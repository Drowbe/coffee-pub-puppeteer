# Plan: Grouped Movement

**Audience:** contributors building Puppeteer.

The design for moving scene elements as one group, anchored to a vehicle token. Deleted when the module ships; durable knowledge moves to `architecture/`.

## Goal

Horse carts and ships first. Players pilot the vehicle token. Tiles, lights, sounds, walls and drawings that belong to the vehicle follow its position and heading, and tokens standing on it are carried along. GM-only set pieces (a drawbridge, a barge on rails) come second, anchored to a Blacksmith pin instead of a token.

## Ground rules

- **Foundry v14 only.** Version 14.0.0 is the first release; the module version matches the Foundry generation it supports. `module.json` compatibility is minimum 14, verified 14, maximum 14. Nothing here is written to work on v13.
- **Blacksmith is a hard dependency.** Without it Puppeteer does not run. There is no fallback path: no native `Hooks.on`, no `game.socket`, no `ui.notifications`, no `AudioHelper`, no raw `ChatMessage.create`, no hand-built `Dialog`. If Blacksmith is missing or its ready stage failed, Puppeteer refuses to initialise and says why, because a half-working vehicle that strands its passengers is worse than none.
- **Foundry core is used directly only where Blacksmith offers no equivalent:** document reads and writes (`updateEmbeddedDocuments`), settings registration, localization, and the PIXI display objects of placeables.
- **Plain data, plain updates.** Puppeteer does not hook placeable internals or wrap anything in core, because that coupling is what breaks when Foundry changes movement.

## Blacksmith surface

Every Blacksmith surface was read against the Blacksmith 14.4.1 API documentation. Each one is either used, with the job it does, or ruled out, with the reason.

| Surface | Puppeteer uses it for |
|---|---|
| Bootstrap | In `ready`: `await BlacksmithAPI.waitForReady()`, then check for every member Puppeteer uses (`sockets`, `pins`, `gmRequest`, `chatCards`, `toast`, `registerWindow`, `registerToolbarTool`, `registerMenubarTool`), then `registerModule`. A missing member stops initialisation with a loud error. Settings are registered only after that check passes, because registration cannot be redone. |
| `BlacksmithHookManager` | Every hook Puppeteer listens to: `updateToken` (the follower), the delete hooks that prune members, `preCreateToken` (strips a copied group flag), `canvasReady`. One context, `coffee-pub-puppeteer`, and a `key` on each registration. The follower is never throttled or debounced, because that drops the intermediate updates it must act on. |
| `api.sockets` | The cosmetic channel only, event names prefixed `coffee-pub-puppeteer.`: the active GM announces a group move so other clients can tween the members' display and play the vehicle sound. Document state never travels over it. Emit does not reach the sender, so the GM tweens locally. Payloads carry no secrets. |
| `api.gmRequest` | Anything a player needs a GM to do: board, disembark, and mark a passenger as carried. Ops are registered on every client and prefixed `coffee-pub-puppeteer.`. The handler checks `user` (the verified caller), never the payload, that the caller owns the passenger token. Results `NO_ACTIVE_GM` and `TIMEOUT` become toasts. |
| Windows | `BlacksmithWindowBaseV2` for the Group Editor (members, footprint, carry toggle, heading for pin groups); `BlacksmithToolWindowBaseV2` for the capture palette. The classes are imported from `/modules/coffee-pub-blacksmith/api/blacksmith-api.js`, never read from `module.api` at class-definition time. Both are registered with `registerWindow` so toolbar, menubar and macros open them by id. |
| Toolbar | `registerToolbarTool` for Capture Area, Add Selected, Remove Member and Open Group Editor. GM only, on both the Blacksmith and the Foundry toolbars. |
| Menubar | A toggleable Puppeteer tool that shows or hides the group overlay, and a secondary bar for capture mode (Capture Area, Add Selected, Remove, Done). Menubar notifications report groups whose members have gone missing. |
| Context menu | `pins.registerContextMenuItem` for Capture and Open Group Editor on Puppeteer pins. `uiContextMenu` for the member rows in the Group Editor. |
| Chat cards | `chatCards.post` for the boarded and disembarked announcements (public) and the prefab stamp summary (GM whisper, with a count of members skipped and why). |
| Toast and notifications | Player-facing and GM-facing messages through `api.toast` on a registered `puppeteer` channel, so a GM can switch them off. Console output through `utils.postConsoleAndNotification` with the module id. |
| Sounds | `utils.playSound` with `BlacksmithConstants` (boarding, capture, stamp). Never a raw path or `AudioHelper`. |
| Pins | Prefabs and pin-anchored groups. `registerPinTaxonomy` and `registerPinType` for a Puppeteer type with `copyable: false`. `pins.on('dragEnd', ..., { dragEvents: true })` drives pin-anchored groups. `pins.createAsGM` and `pins.updateAsGM` for player-triggered writes. |
| Scene Config tab | `registerSceneConfigTab` for the per-scene switch (groups enabled, default carry-passengers). |
| Handlebars helpers | Used in Puppeteer templates; they exist because Blacksmith is active. |
| Ruled out | `tokens.registerInteraction`: the only claimable gestures are double-click, and claiming them on a vehicle would displace the sheet and config the GM needs. `rolls`, `requestRoll`, `party`, `inventory`, `effects`, `stats`, `worldclock`, `notes`, `tags`: no job in grouped movement. |

A check in `tools/` should fail the build on a core call that has a Blacksmith equivalent (see `TODO.md`), so the hard-dependency rule is enforced rather than remembered.

## Data shape

A group is stored as a flag on its anchor.

- **Token anchor:** `flags.coffee-pub-puppeteer.group` on the TokenDocument.
- **Pin anchor:** the same shape in the pin's `config`, via `api.pins`.
- **Prefab:** an unplaced Blacksmith pin of the Puppeteer type, holding the same shape. Stamping a prefab onto a scene creates the placeables and writes the group onto the chosen token.

The group holds:

- **Members** as `{ type, id, dx, dy, drot }`. `id` is the embedded document id on the anchor's scene, not a UUID: a UUID names the scene, so it breaks when a scene is duplicated, exported or imported. `dx, dy` are the offset from the anchor's centre in the anchor's own frame (heading zero), and `drot` is the member's rotation relative to the anchor's heading.
- A **carry-passengers** flag.
- A **footprint** (width and height at heading zero, centred on the anchor, defaulting to the token's own size).
- A **heading** for pin-anchored groups only, since a pin has no rotation of its own.

Offsets are stored in the anchor's frame, not the scene's, and positions are always computed absolutely from the anchor's committed state: `anchor.rotation + drot`, normalised for the `AngleField`, never `rotation += delta`. Applying a move is then one rotation and one translation per member, with no accumulated drift from repeated deltas.

A token created from another token (copy, duplicate, drag from the sidebar) carries the flag with it. `preCreateToken` strips it, otherwise two vehicles would drive the same parts. Scene duplication needs no handling because members are scene-relative ids.

## The follower

One `updateToken` hook, registered through the Hook Manager. It acts only on the client that is `game.users.activeGM`, the same election `gmRequest` uses, so exactly one client writes and every Coffee Pub module agrees on who that is. It ignores updates where no field in `TokenDocument.MOVEMENT_FIELDS` or `rotation` changed (elevation and level are already movement fields), ignores tokens with no group flag, and ignores updates tagged as its own.

**Loop guard.** Every follower write carries an update option `{ puppeteer: { follower: true } }`. The hook returns on that option. A token that is already a member of a group is refused as an anchor, and a group cannot contain its own anchor, so there is no cycle to walk.

**Heading.** A vehicle's heading is the token's `rotation`. In v14 the same update that moves a token can also rotate it, through the core `tokenAutoRotate` setting or the `autoRotate` movement option, so the follower reads `x`, `y` and `rotation` from the committed update and never from the planned destination.

For each member it computes the new position from the anchor's new centre and heading, and writes members in one `updateEmbeddedDocuments` call per document type, with `animate: false` so the batch does not fight the token's own animation.

**Passengers are displaced, not moved.** A passenger's `x, y` change goes through the same v14 movement pipeline as any token, which applies wall and terrain constraints (`constrainOptions`) unless told otherwise. A cart carrying a passenger past a wall would stop the passenger or reject the update. The follower therefore writes passenger tokens with the constraints switched off (`ignoreWalls` and `ignoreCost`) or through the displace path core uses for teleport, undo and paste. Which of the two is correct is item 1 in `TODO.md`.

Per type:

| Member | Position | Heading |
|---|---|---|
| Tile, Drawing | `x`, `y` after rotating the member's centre | `rotation = anchor.rotation + drot` |
| AmbientLight | `x`, `y` | `rotation` the same way (matters for directional lights) |
| AmbientSound | `x`, `y` | none |
| Wall | both endpoints in `c`, rotated about the anchor centre | endpoints carry it |
| Note | `x`, `y` | none |
| MeasuredTemplate | `x`, `y` | `direction` the same way |
| Passenger Token | `x`, `y` of its centre, converted back to top-left | `rotation` the same way |

Tile and Drawing positions are top-left of an unrotated box, so rotate the box centre and convert back.

**No GM connected.** The `updateToken` hook also runs on the mover's client. When the token has a group, the mover is not a GM and `game.users.activeGM` is null, that client shows a Blacksmith toast that the parts of the vehicle will not follow. The move is not refused.

## What was read in Foundry v14.369

Read from the installed source, not observed behaviour.

- Token movement is a multi-waypoint operation. `TokenDocument#movement` exposes `origin`, `destination`, `passed.waypoints`, `pending.waypoints`, `state` and `method`. A move can pause, be stopped, or be constrained partway, so the follower must use the committed position from the update, never the planned destination.
- `TokenDocument.MOVEMENT_FIELDS` is `x, y, elevation, width, height, depth, shape, level`. `TokenDocument._isMovementUpdate(changes)` is the core test for "this update moved the token" and is `@internal`, so do not call it; test the field list instead.
- Core animates the token along the path itself (`#onUpdateAnimation`). Other placeables are not animated by core, so members will jump when the update lands unless Puppeteer tweens them. Open question below.
- Scenes have Levels. Tile, Drawing, AmbientLight, AmbientSound, Wall and Note carry a `levels` set, and a Token has a single `level`. Members and the anchor must be on compatible levels, and a move that changes `level` or `elevation` has to decide what members do.
- Rotation is an `AngleField` on Tile, Drawing and AmbientLight. AmbientSound has none.

Item 1 in `TODO.md` is to confirm these with a throwaway macro before building.

## Decided

- **Passenger rule.** A token is carried when it is inside the footprint and explicitly marked boarded. Footprint alone would drag a token swimming beside a ship. Boarding goes through `gmRequest`.
- **No GM.** Warn through a toast and let the move through. Refusing it would make a vehicle unusable whenever the GM steps away.
- **Pin-anchored heading.** A pin has no rotation. The group stores its own heading, changed by a rotate action in the Group Editor; dragging the pin translates the group.

## Observed

One drag in v14.369 as the GM, with a throwaway macro that wrote a tile and a light from each `updateToken`.

- **A multi-waypoint move is one position update.** A drag with 4 passed waypoints arrived as a single `updateToken` with `x, y, rotation` changed. Paused, stopped and constrained moves were not tried.
- **Rotation can follow in a second update.** 127 ms later, same `movementId`, a rotation-only update (80.5 degrees, then 26.6). The follower must handle each update on its own and always use the committed `rotation`.
- **Members would land before the token does.** They were written 141 ms after the hook fired, while the token's own animation had 782 ms to run, so they jump to the destination at the start of the glide.
- **`doc.x`, `doc.y` and `doc.rotation` are not the committed values inside `updateToken`.** They hold the old, still-animating state: one probe read `4800,2800` from the document and `5200,3400` from both `_source` and the update's `changes`, and another read rotation 326.3 from the document against 143.1 in `_source`. The follower must read `_source` (position, rotation, width, height), which already includes the update, and never the document's own getters. Writing members from `doc.x` left them around the token's old position; writing them from `_source` held every member at exactly its stored distance from the token's centre.
- **The animation duration is available at hook time** as `document._movement.animation.duration` on the client that moved the token. Not yet checked on a GM client when a player moves the token.

## Open questions

1. Smoothness. A per-frame tween of the placeables' display (not the documents), driven by that duration, would fix the jump, and the socket channel exists to start it on every client. It needs the duration confirmed on a GM client when a player moves, and a check that `_movement` (underscore-prefixed) is the right thing to depend on.
2. Levels. Should a group follow the anchor between levels, or stay put?
3. Snapping. Rotated members will not sit on grid positions, which is correct, but a snapped anchor with an unsnapped member offset needs to be allowed.
4. Undo (Ctrl+Z) and a paused or constrained move were not tried. Both must leave members where the token committed.

## Capture

"Capture area" on the anchor: the GM drags a rectangle and every placeable of a supported type whose centre is inside, across all layers, becomes a member, with offsets computed from the anchor's current position and heading (un-rotated into the anchor's frame). "Add selected" and "Remove member" cover single elements. Members deleted from the scene are pruned through the delete hooks.

## Order

The sequence is in `TODO.md`. Prove the follow mechanism before anything else, because every other piece depends on it.
