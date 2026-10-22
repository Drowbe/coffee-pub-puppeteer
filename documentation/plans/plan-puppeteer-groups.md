# Plan: Grouped Movement

**Audience:** contributors building Puppeteer.

The design for moving scene elements as one group, anchored to a vehicle token. Deleted when the module ships; durable knowledge moves to `architecture/`.

## Goal

Horse carts and ships first. Players pilot the vehicle token. Tiles, lights, sounds, walls and drawings that belong to the vehicle follow its position and heading, and tokens standing on it are carried along. GM-only set pieces (a drawbridge, a barge on rails) come second, anchored to a Blacksmith pin instead of a token.

## Approach

Puppeteer does not hook placeable internals or wrap anything in core, because that coupling is what breaks when Foundry changes movement. It stores plain data and applies plain document updates.

## Data shape

A group is stored as a flag on its anchor.

- **Token anchor:** `flags.coffee-pub-puppeteer.group` on the TokenDocument.
- **Pin anchor:** the same shape in the pin's `config`, via `api.pins`.
- **Prefab:** an unplaced Blacksmith pin of a Puppeteer type, holding the same shape. Stamping a prefab onto a scene creates the placeables and writes the group onto the chosen token.

The group holds: members as `{ type, uuid, dx, dy, drot }` where `dx, dy` are the offset from the anchor's centre in the anchor's own frame (heading zero), and `drot` is the member's rotation relative to the anchor's heading; a carry-passengers flag; and a footprint (width and height at heading zero, centred on the anchor, defaulting to the token's own size).

Offsets are stored in the anchor's frame, not the scene's. Applying a move is then one rotation and one translation per member, with no accumulated drift from repeated deltas.

## The follower

One `updateToken` hook. It runs only on the active GM's client (first active GM by user id), so exactly one client writes. It ignores updates where no movement field, `rotation`, or `elevation` changed, and ignores tokens with no group flag.

For each member it computes the new position from the anchor's new centre and heading, and writes members in one `updateEmbeddedDocuments` call per document type, with `animate: false` so the batch does not fight the token's own animation.

Per type:

| Member | Position | Heading |
|---|---|---|
| Tile, Drawing | `x`, `y` after rotating the member's centre | `rotation += delta` |
| AmbientLight | `x`, `y` | `rotation += delta` (matters for directional lights) |
| AmbientSound | `x`, `y` | none |
| Wall | both endpoints in `c`, rotated about the anchor centre | endpoints carry it |
| Note, MeasuredTemplate | `x`, `y` | template `direction += delta` |
| Passenger Token | `x`, `y` of its centre, converted back to top-left | `rotation += delta` |

Tile and Drawing positions are top-left of an unrotated box, so rotate the box centre and convert back.

## What was read in Foundry v14.369

- Token movement is now a multi-waypoint operation. `TokenDocument#movement` exposes `origin`, `destination`, `passed.waypoints`, `pending.waypoints`, `state` and `method`. A move can pause, be stopped, or be constrained partway, so the follower must use the committed position from the update, never the planned destination.
- `TokenDocument.MOVEMENT_FIELDS` is `x, y, elevation, width, height, depth, shape, level`. `TokenDocument._isMovementUpdate(changes)` is the core test for "this update moved the token" and is underscore-prefixed, so do not call it; test the field list instead.
- Core animates the token along the path itself (`#onUpdateAnimation`). Other placeables are not animated by core, so members will jump when the update lands unless Puppeteer tweens them. Open question below.
- Scenes now have Levels. Tile, AmbientLight and Wall carry a `levels` set, and a Token has a single `level`. Members and the anchor must be on compatible levels, and a move that changes `level` or `elevation` has to decide what members do.
- Rotation is an `AngleField` on Tile, Drawing and AmbientLight. AmbientSound has none.

These are reads of source, not observed behaviour. Item 1 in `TODO.md` is to confirm them with a throwaway macro before building.

## Open questions

1. Smoothness. Do members visibly jump at the end of a token move? A per-frame tween of the placeables' display (not the documents), driven by the movement animation's duration, would fix it, but needs checking against `document._movement.animation`, which is underscore-prefixed.
2. Does a multi-waypoint move arrive as one `updateToken` or several? The follower must be correct either way, and the answer decides whether tweening is per segment.
3. Levels. Should a group follow the anchor between levels, or stay put?
4. Passenger rule. Footprint containment alone, or footprint plus an explicit boarded toggle? A token swimming beside a ship should not be dragged.
5. No GM connected. Players can move the token and the parts stay behind. The honest options are a warning to the player, or refusing the move; neither is built into core.
6. Snapping. Rotated members will not sit on grid positions, which is correct, but a snapped anchor with an unsnapped member offset needs to be allowed.

## Capture

"Capture area" on the anchor: the GM drags a rectangle and every placeable of a supported type whose centre is inside, across all layers, becomes a member, with offsets computed from the anchor's current position and heading. "Add selected" and "Remove member" cover single elements. Members deleted from the scene are pruned through the delete hooks.

## Blacksmith surface used

Pins: create and store unplaced prefab pins, a context menu entry for capture, and a taxonomy entry for the Puppeteer type. Live position and draggable pins are for the pin-anchored mode only. Nothing new is needed from Blacksmith for the token-anchored mode.

## Order

The sequence is in `TODO.md`. Prove the follow mechanism before anything else, because every other piece depends on it.
