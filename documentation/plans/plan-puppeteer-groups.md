# Plan: Grouped Movement

**Audience:** contributors building Puppeteer.

The design for moving scene elements as one group, anchored first to a Blacksmith pin and later to a vehicle token. Deleted when the module ships; durable knowledge moves to `architecture/`.

## Goal

Group tiles, lights, sounds, walls, drawings, notes and regions, and move and rotate them as one. A group does not need an actor or a token, and can optionally be made targetable.

## Aligned model (decided)

Agreed with the user after the token-anchor mode was built and used. It replaces the earlier "pin or token anchor" split. Durable description: `architecture/architecture-groups.md`.

- **The pin is always the grip.** One way to move and turn a group, with everything a pin offers (hide it, restyle it, permissions, drag, Shift + wheel). There is no mode in which a token is the grip.
- **A body token is an optional layer.** Most groups have none; nothing requires an actor. A group may represent an actor. Puppeteer then manages a token for it: transparent image set on the placed token only (the actor's art is untouched), sized to cover the group, locked, moved with the group like a member. It is what takes attacks and damage. The user never places or sizes it.
- **Two ways to get one.** Drag an actor onto the group's body row in the Group Editor, or stamp a Library entry that names one. Dropping an actor on the map over a group is reserved for mounting it as a rider, so it never makes a body.
- **Unlinked by default,** linked optionally, so many copies of a prefab each have their own hit points.
- **Riders come later,** on the same machinery: tokens carried by the group, free to move inside it.
- **Token-anchored groups are retired.** Existing ones convert on load: a pin appears at the token's centre and the token becomes the body. Attach to Token, On Selected Token, detach and the token-removed question go.
- **Accepted loss.** A player no longer drives a cart by moving a token, with walls, speed and a ruler. A player can still move a group if given edit access to the pin, with no movement rules.

## Phases

1. **Pin-anchored groups of scene elements.** Built. The GM makes a group on a Blacksmith pin, adds and removes members, and dragging or turning the pin moves the whole group. Offsets in the pin's frame, committed state, one batched write per type.
2. **Body token.** A group can represent an actor and be targeted. Shares its machinery with riders: tokens as members, moved by displace-style moves, locked, auto-sized footprint. Also converts the old token-anchored groups.
3. **Prefabs.** Save a group as a template and stamp it as many times as wanted, each stamp an independent copy. All templates live in the Puppeteer library; a template can name an actor to represent.
4. **Riders.** Tokens carried by a group, free to move inside it, dismounting when they leave the footprint. Boarding through `gmRequest`, announced by chat cards.
5. **Polish.** Group behaviour options, menubar tool and secondary bar, sounds, toast channel, Scene Config tab, events for other modules.

The token follower built earlier stays in the code until phase 2 converts its groups; its description below is kept for that reason.

## Body token: what the probe found

`tools/probes/body-token-probe.js`, run in Foundry v14.369 by the user on an actor with a dnd5e sheet.

- **Fractional size works.** A 6.5 by 3.5 token was created and drawn at exactly 650 by 350 px on a 100 px grid.
- **Selection and hover outline the whole footprint,** not the image, so a transparent token still shows where it is.
- **Locked blocks dragging, for the GM too.** The warning "You cannot take this action while the Token object is locked" appears and the token does not move.
- **Locked also stopped a plain `update({ x })`.** The token stayed put. An update with `teleport: true` and `move()` with action `displace` (walls and cost ignored) both moved it. So the follower moves the body with `teleport: true` or `displace`, never with a plain update.
- **Targeting works,** programmatically and by hand.
- **It is a real combatant target.** Double-click opened the actor's sheet, and a longbow attack from another token rolled against it and applied 9 damage to the actor (110 to 101).
- **The probe's image was not transparent.** The base64 PNG in the first version of the probe was opaque, so the token drew a navy square. A real transparent PNG is now generated and shipped as `images/transparent.png`. Whether any shadow or border draws around a truly transparent token is not yet seen.

Not yet observed: clicking a tile or light beneath the footprint, and whether a displace move counts against combat movement. The hit area printed empty (it is not a plain rectangle).

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
| `BlacksmithHookManager` | Every hook Puppeteer listens to: `updateScene` (the pin follower), `updateToken` (the token follower, phase 2), the delete hooks that prune members, `canvasReady`. One context, `coffee-pub-puppeteer`, and a `key` on each registration. The follower is never throttled or debounced, because that drops the intermediate updates it must act on. |
| `api.sockets` | The cosmetic channel only, event names prefixed `coffee-pub-puppeteer.`: the active GM announces a group move so other clients can tween the members' display and play the vehicle sound. Document state never travels over it. Emit does not reach the sender, so the GM tweens locally. Payloads carry no secrets. |
| `api.gmRequest` | Anything a player needs a GM to do: board, disembark, and mark a passenger as carried. Ops are registered on every client and prefixed `coffee-pub-puppeteer.`. The handler checks `user` (the verified caller), never the payload, that the caller owns the passenger token. Results `NO_ACTIVE_GM` and `TIMEOUT` become toasts. |
| Windows | `BlacksmithToolWindowBaseV2` for the Group Editor, because it is a palette kept open over the canvas while the GM selects objects and drags pins, which is what the tool base is for. It brings the Light, Dark and Glass themes, the compact title bar, and a title-bar icon with an on and off state (Show group bounds). Three tabs in its bar: Groups (this scene's groups), Library (saved templates) and Tools (update all groups, diagnosis, about). The classes are imported from `/modules/coffee-pub-blacksmith/api/blacksmith-api.js`, never read from `module.api` at class-definition time. Both are registered with `registerWindow` so toolbar, menubar and macros open them by id. |
| Toolbar | `registerToolbarTool` for Capture Area, Add Selected, Remove Member and Open Group Editor. GM only, on both the Blacksmith and the Foundry toolbars. |
| Menubar | A toggleable Puppeteer tool that shows or hides the group overlay, and a secondary bar for capture mode (Capture Area, Add Selected, Remove, Done). Menubar notifications report groups whose members have gone missing. |
| Canvas | `api.canvas.pickArea` for Capture Area: the GM drags a box and every Tile, Drawing, AmbientLight, AmbientSound, Wall and Note whose centre is inside, across all layers, becomes a member. It leaves the GM's selection and active layer alone. Blacksmith added it at Puppeteer's request. |
| Context menu | `pins.registerContextMenuItem` for Capture and Open Group Editor on Puppeteer pins. `uiContextMenu` for the member rows in the Group Editor. |
| Chat cards | `chatCards.post` for the boarded and disembarked announcements (public) and the prefab stamp summary (GM whisper, with a count of members skipped and why). |
| Toast and notifications | Player-facing and GM-facing messages through `api.toast` on a registered `puppeteer` channel, so a GM can switch them off. Console output through `utils.postConsoleAndNotification` with the module id. |
| Sounds | `utils.playSound` with `BlacksmithConstants` (boarding, capture, stamp). Never a raw path or `AudioHelper`. |
| Pins | The anchor of a pin-anchored group. `registerPinTaxonomy` and `registerPinType` for a Puppeteer type with `copyable: false`, `pins.create` for the pin, `pins.update` and `pins.panTo` from the editor. The follower is driven by `updateScene`, not pin events. Pins are not used to store templates. |
| Scene Config tab | `registerSceneConfigTab` for the per-scene switch (groups enabled, default carry-passengers). |
| Handlebars helpers | Used in Puppeteer templates; they exist because Blacksmith is active. |
| Ruled out | `tokens.registerInteraction`: the only claimable gestures are double-click, and claiming them on a vehicle would displace the sheet and config the GM needs. `rolls`, `requestRoll`, `party`, `inventory`, `effects`, `stats`, `worldclock`, `notes`, `tags`: no job in grouped movement. |

A check in `tools/` should fail the build on a core call that has a Blacksmith equivalent (see `TODO.md`), so the hard-dependency rule is enforced rather than remembered.

## Data shape

Groups are records in one scene flag, `flags.coffee-pub-puppeteer.groups`, keyed by group id. The anchor does not hold the data; it points at it.

- **Pin anchor (phase 1):** the pin's `config.puppeteer` holds only `{ groupId }`. Pin `config` lives in a scene flag shared by every pin and every module in the scene, and `update()` replaces a nested object whole, so a member list kept there would be rewritten on every change.
- **Token anchor (phase 2):** `flags.coffee-pub-puppeteer.groupId` on the TokenDocument.
- **Prefab (phase 3):** a template, described below. Pins are not used to store templates: a template holds full document data, so one cart can run to tens of kilobytes, and unplaced pins share one world setting and cannot go in a compendium.

One place lists every group, which the Group Editor and the "missing members" notification need. A deleted anchor leaves a record the active GM prunes. A copied token carries the `groupId`, but the record names the original anchor, so the follower ignores the copy and no hook is needed to strip it.

A group record holds:

- A **name**, an **anchor** (`{ type: 'pin' | 'token', id }`), and the **applied** anchor state (`x, y, heading`) it last wrote members for, so the follower knows what changed.

- **Members** as `{ type, id, dx, dy, drot }`. `id` is the embedded document id on the anchor's scene, not a UUID: a UUID names the scene, so it breaks when a scene is duplicated, exported or imported. `dx, dy` are the offset from the anchor's centre in the anchor's own frame (heading zero), and `drot` is the member's rotation relative to the anchor's heading.
- A **carry-passengers** flag.
- A **footprint** (width and height at heading zero, centred on the anchor, defaulting to the token's own size).
- A **heading** that mirrors where the anchor faces: the pin's `rotation`, or the token's rotation.

Offsets are stored in the anchor's frame, not the scene's, and positions are always computed absolutely from the anchor's committed state: `anchor.rotation + drot`, normalised for the `AngleField`, never `rotation += delta`. Applying a move is then one rotation and one translation per member, with no accumulated drift from repeated deltas.

**Integer coordinates.** `x` and `y` on Tile, AmbientLight, AmbientSound and Note, and every number in a Wall's `c`, are integer fields, so every computed position is rounded before it is written. Drawing `x` and `y` are not integer. Rounding cannot accumulate, because every position is computed afresh from the stored offsets.

## Templates and prefabs

A template is a portable snapshot of a group, kept apart from any scene. It holds each member's offsets from the pivot (in the pivot's own frame, so a template has no heading) and a copy of the member's document data. Fields tied to the source scene are left out: `_id`, `_stats`, and `levels` (ids of the source scene's Levels; empty means every level). `exportGroup` builds one, `stampMembers` turns one into creation data for a pivot and heading, and the Group Editor can save one as JSON. Both are in `scripts/template.js` and tested under Node.

Stamping creates fresh documents and a fresh group record every time, so two carts are two stamps, each with its own pin and members.

Where a template lives depends on what it is:

- **Vehicles (token-anchored):** on an Actor, in its prototype-token flags. Dropping the actor onto a scene creates the token and the active GM stamps the template around it. The Actor supplies the sidebar entry, compendium sharing, independent copies and, with dnd5e, the Vehicle sheet. Groups themselves still need no actor.
- **Set pieces (pin-anchored):** a Puppeteer library in a world setting, stamped from a Puppeteer window.

Both use the same template format, so a template can move between the two.

## The pin follower (phase 1)

Runs only on the client that is `game.users.activeGM`. It acts when a Puppeteer pin's position is committed (a drag ends or the pin is updated) and when the group's heading changes through the rotate action. The anchor centre is the pin's `x, y` and the heading is the stored one, both read from committed state, never from a position that is still being dragged. It is driven by Foundry's `updateScene` on the active GM, not by `pins.on('updated')`: Blacksmith's pin events fire only on the client that performed the write, so a second GM's drag would never reach the active GM. When the pins flag changes, the follower compares each group's anchor pin with the state it last applied and moves the members if they differ. `dragEnd` is not used to trigger writes.

The math and the per-type writes are the table below, minus the passenger row. Writes go out as one `updateEmbeddedDocuments` call per document type and carry `{ puppeteer: { follower: true } }` so nothing the follower writes is mistaken for a user edit.

**Concurrency.** Hook Manager callbacks are started back to back and not awaited, so two updates in quick succession (a move, then a rotation-only update 127 ms later) would run their member writes concurrently. The follower serialises writes per group with a promise chain, and each write is computed from committed state, so the last update always lands last.

**Rotating.** The GM rotates a group from the Group Editor (a numeric heading and plus or minus steps) and from toolbar buttons, which write the new heading to the pin's config. A drag handle on the canvas is a later refinement.

## The token follower (phase 2)

Built (written and simulated; to be checked with a real token). The group record names the token as its anchor and the token carries `flags.coffee-pub-puppeteer.groupId`. The follower trusts the flag only when the record names that same token, so a copied token is inert. The pivot is the middle of the token's footprint and the heading is its rotation, both read from `_source` (see Observed). Turning a token group from the editor turns the token itself. With no GM connected the mover is warned once every 15 seconds, and `syncAllGroups` runs when the world loads and when a GM connects. What follows is the design the code was written from.

One `updateToken` hook, registered through the Hook Manager. It acts only on the client that is `game.users.activeGM`, the same election `gmRequest` uses, so exactly one client writes and every Coffee Pub module agrees on who that is. It ignores updates where no field in `TokenDocument.MOVEMENT_FIELDS` or `rotation` changed (elevation and level are already movement fields), ignores tokens whose `groupId` does not resolve to a record naming that token as its anchor, and ignores updates tagged as its own.

**Loop guard.** Every follower write carries an update option `{ puppeteer: { follower: true } }`. The hook returns on that option. A token that is already a member of a group is refused as an anchor, and a group cannot contain its own anchor, so there is no cycle to walk.

**Heading.** A vehicle's heading is the token's `rotation`. In v14 the same update that moves a token can also rotate it, through the core `tokenAutoRotate` setting or the `autoRotate` movement option, so the follower reads `x`, `y` and `rotation` from the committed update and never from the planned destination.

For each member it computes the new position from the anchor's new centre and heading, and writes members in one `updateEmbeddedDocuments` call per document type, with `animate: false` so the batch does not fight the token's own animation.

**Passengers are displaced, not moved.** A passenger's `x, y` change goes through the same v14 movement pipeline as any token, which applies wall and terrain constraints (`constrainOptions`) unless told otherwise. A cart carrying a passenger past a wall would stop the passenger or reject the update. The follower therefore writes passenger tokens with the constraints switched off (`ignoreWalls` and `ignoreCost`) or through the displace path core uses for teleport, undo and paste. Which of the two is correct is settled when passengers are built.

Per type:

| Member | Position | Heading |
|---|---|---|
| Tile | `x`, `y`, the tile's anchor point, carried like a light's position | `rotation = anchor.rotation + drot` |
| Drawing | `x`, `y` after rotating the box's centre | `rotation = anchor.rotation + drot` |
| AmbientLight | `x`, `y` | `rotation` the same way (matters for directional lights) |
| AmbientSound | `x`, `y` | none |
| Wall | both endpoints in `c`, rotated about the anchor centre | endpoints carry it |
| Note | `x`, `y` | none |
| Region | every shape in `shapes`, by its own rule (below) | each shape that has a `rotation` turns with the group |
| Passenger Token | `x`, `y` of its centre, converted back to top-left | `rotation` the same way |

**A tile's `x, y` is not its top-left corner.** In v14 a tile carries a texture anchor (`texture.anchorX`, `anchorY`, default 0.5), the mesh is drawn with that anchor at `x, y`, and it turns about that point. So with the default a tile's `x, y` is its centre. Its pose is a point and a heading, exactly like a light, and its width, height and anchor only matter for drawing its outline. A Drawing is different: its `x, y` is the top-left of an unrotated box that turns about its centre. Reading a tile as top-left put every tile half its size out of place, which only shows once a group turns or is stamped.

**No GM connected.** The `updateToken` hook also runs on the mover's client. When the token has a group, the mover is not a GM and `game.users.activeGM` is null, that client shows a Blacksmith toast that the parts of the vehicle will not follow. The move is not refused.

## What was read in Foundry v14.369

Read from the installed source, not observed behaviour.

- Token movement is a multi-waypoint operation. `TokenDocument#movement` exposes `origin`, `destination`, `passed.waypoints`, `pending.waypoints`, `state` and `method`. A move can pause, be stopped, or be constrained partway, so the follower must use the committed position from the update, never the planned destination.
- `TokenDocument.MOVEMENT_FIELDS` is `x, y, elevation, width, height, depth, shape, level`. `TokenDocument._isMovementUpdate(changes)` is the core test for "this update moved the token" and is `@internal`, so do not call it; test the field list instead.
- Core animates the token along the path itself (`#onUpdateAnimation`). Other placeables are not animated by core, so members will jump when the update lands unless Puppeteer tweens them. Open question below.
- Scenes have Levels. Tile, Drawing, AmbientLight, AmbientSound, Wall and Note carry a `levels` set, and a Token has a single `level`. Members and the anchor must be on compatible levels, and a move that changes `level` or `elevation` has to decide what members do.
- Rotation is an `AngleField` on Tile, Drawing and AmbientLight. AmbientSound has none.
- A tile is positioned by its texture anchor (`client/canvas/placeables/tile.mjs`: `mesh.position.set(x, y)` with `mesh.anchor.set(anchorX, anchorY)`), so `x, y` is the anchor point, the centre by default, and rotation is about it. A Drawing's `x, y` is the top-left of its box and it turns about the box's centre (`client/documents/drawing.mjs`).

A throwaway macro confirmed the movement behaviour; the results are under Observed.

## Blacksmith answers

From the Blacksmith session, read from its code (`manager-hooks.js`, `manager-pins.js`, `manager-pins-renderer.js`), not run live. The repo's `documentation/` is the source of truth; the wiki is a mirror pushed by `sync-wiki.yml`.

- **Hook Manager.** Callbacks run in priority order from one Foundry handler and async callbacks are not awaited. A throw is caught and logged per callback, so the others still run. Arguments pass through unchanged. `throttleMs` is leading-edge and per registration, so it drops calls (two tokens inside the window lose one) and `debounceMs` keeps only the last: set neither. There is no supported active-GM pattern; the in-callback check `game.users.activeGM?.isSelf` is the intended way. `canCancel` defaults to false, so `preCreateToken` mutates through `document.updateSource` and returns nothing.
- **Pin storage.** `config` is a free-form bag, persisted for placed pins (in one scene flag shared by all pins of the scene and all modules) and unplaced pins (world setting `pinsUnplaced`). No size limit is enforced, but the shared scene flag is the real constraint, so keep it small. `update()` shallow-merges `config`, so a nested object under our key is replaced whole. Use one top-level key, `config.puppeteer`.
- **Pin events.** `dragEnd` fires after the save resolves, with the committed x and y, and only on the dragging client. `dragMove` fires continuously on the dragging client only and needs `{ dragEvents: true }`; it can drive a visual preview there but must not write documents. `setLivePosition` is for a pin moving on a clock and is not needed for a drag. `updated` and `blacksmith.pins.updated` fire inline on the client that performed the write and are not broadcast.
- **Pins have no rotation**, and Blacksmith has no plan to add one. The heading is ours, rotated through our own UI.
- **Writes.** Only a GM writes pins (placed or unplaced); a non-GM with edit rights goes through `requestGM`. Puppeteer writes only from the active GM.

## Decided

- **Passenger rule.** A token is carried when it is inside the footprint and explicitly marked boarded. Footprint alone would drag a token swimming beside a ship. Boarding goes through `gmRequest`.
- **No GM.** Warn through a toast and let the move through. Refusing it would make a vehicle unusable whenever the GM steps away.
- **Pin-anchored heading.** A pin has no rotation. The group stores its own heading, changed by a rotate action in the Group Editor and the toolbar; dragging the pin translates the group.
- **A manual edit redefines the member.** When the GM moves, turns or resizes a member by hand, the group re-records its offset against the anchor state the members currently occupy. Otherwise the record keeps the old offset and the next move snaps the member back to it, which looks like the group tearing apart. The follower's own writes are told apart by a marker option and, as a second guard, by the member already sitting where the record puts it. Capturing new members first lets the follower finish, so offsets are measured against where the pin really is.
- **See the group.** Each tool shows its own objects one layer at a time, so nothing shows a group as one thing. An optional overlay (per user, off by default) draws the oriented box that holds the members, the pivot and the heading, on Blacksmith's utilities layer.
- **Members have names.** A member record can carry a `label`. It is not geometry, so a hand edit or a Centre Pivot keeps it, and a template carries it.
- **A pin group faces where its pin faces.** Blacksmith added an optional `rotation` to pins (degrees clockwise, 0 facing down, two decimals), turned with Shift + mouse wheel over a selected pin at 5 degrees a notch and saved once, 400 ms after the last notch. A pin type opts in with `rotatable: true` in its taxonomy, which Puppeteer sets. The group's heading is read from `pin.rotation`; the editor's heading field and rotate buttons write the same field, so they and the wheel always agree. The follower sees a turn the way it sees a drag, through `updateScene`. The record's `heading` mirrors the pin for display. Older groups, whose heading lived in the record, hand it to their pin once at load (record version 3), before the follower starts listening.
- **Phase 1 has no tokens.** Member types are Tile, Drawing, AmbientLight, AmbientSound, Wall, Note and Region. MeasuredTemplate is not a core document in v14. Token members and token anchors arrive in phase 2.

## Observed

These concern a token anchor, so they apply from phase 2. One drag in v14.369 as the GM, with a throwaway macro that wrote a tile and a light from each `updateToken`.

- **A multi-waypoint move is one position update.** A drag with 4 passed waypoints arrived as a single `updateToken` with `x, y, rotation` changed. Paused, stopped and constrained moves were not tried.
- **Rotation can follow in a second update.** 127 ms later, same `movementId`, a rotation-only update (80.5 degrees, then 26.6). The follower must handle each update on its own and always use the committed `rotation`.
- **Members would land before the token does.** They were written 141 ms after the hook fired, while the token's own animation had 782 ms to run, so they jump to the destination at the start of the glide.
- **`doc.x`, `doc.y` and `doc.rotation` are not the committed values inside `updateToken`.** They hold the old, still-animating state: one probe read `4800,2800` from the document and `5200,3400` from both `_source` and the update's `changes`, and another read rotation 326.3 from the document against 143.1 in `_source`. The follower must read `_source` (position, rotation, width, height), which already includes the update, and never the document's own getters. Writing members from `doc.x` left them around the token's old position; writing them from `_source` held every member at exactly its stored distance from the token's centre.
- **The animation duration is available at hook time** as `document._movement.animation.duration` on the client that moved the token. Not yet checked on a GM client when a player moves the token.

## Open questions

1. Smoothness is built (`scripts/tween.js`), and needs a real token to confirm. It does not use a duration or the socket channel. Foundry steps the token document's own `x`, `y` and `rotation` every frame while it animates (the committed values stay in `_source`) and announces each frame through `refreshToken`. Each frame, on every client, the tiles, drawings and notes of the token's group are drawn where their records put them for the token's displayed pose, with the same maths the follower uses; the documents are untouched. A short hold in each member's own `refresh` hook puts the tweened pose back when Foundry redraws it from the follower's write, so it does not flash at the destination. Lights, walls, sounds and regions take part in perception and cannot be animated by moving a sprite, so they still update at the start. A pin group has no animation to follow, so it is smoothed in two other ways:

- **While a pin is dragged,** Blacksmith reports the pin's live position on every move (`dragMove`, on the client that is dragging), and the members follow the pointer on that screen.
- **When a pin moves or turns** (a drop, a Shift + wheel notch, the editor's rotate buttons), the follower puts where the group was (`group.applied`) in the options of its writes. Every client eases the anchor from there to where the pin is now over about a third of a second, and recomputes the members from the eased anchor each frame, so a turn swings them along arcs and not chords. The client that just dragged skips it, because its screen is already at the destination; a second move during a glide eases on from where the group is drawn.
2. Levels. Should a group follow the anchor between levels, or stay put?
3. Snapping. Rotated members will not sit on grid positions, which is correct, but a snapped anchor with an unsnapped member offset needs to be allowed.
4. Undo (Ctrl+Z) and a paused or constrained move were not tried. Both must leave members where the token committed.
5. Does duplicating a scene keep the ids of its embedded documents? Groups reference members by id inside a scene flag, so a duplicate that regenerates ids would need the records remapped. Untested.

## Regions

A region has no position of its own. It holds a list of shapes, so a region member records one entry per shape and carries each by its own rule (`scripts/region-shapes.js`):

| Shape | Carried by |
|---|---|
| rectangle | its anchor point `x, y` (the anchor fractions say where on the rectangle that is), turning about it, like a tile |
| ellipse, cone, line | `x, y` and `rotation` |
| circle, ring | `x, y` |
| polygon | every vertex, and its `origin` if it has one |
| emanation | its base shape, by the rule for that shape |
| token, grid | not carried: tied to a token's footprint or to grid cells, so they cannot be turned freely. A region with one is refused with a reason. |

Fields Puppeteer does not own (`hole`, `gridBased`, sizes, behaviours, colour) are left as they are. The shapes of the region as saved are the source of truth: if the GM adds, removes or reshapes a shape by hand, the region is re-recorded like any hand edit. Blacksmith's area pick does not list Regions yet, so Regions are added with Add Selected, and Capture Area passes only the types the pick knows.

## Deleting

- **Deleting a group** from the editor asks with three choices when it has parts: Cancel, Delete group only (the parts stay on the map), or Delete group and its parts. A group with no parts gets a plain confirmation.
- **Deleting a token that a group follows** asks the GM who deleted it, and only that GM's client asks: keep the parts and turn the group into a pin group where the token last was (default), delete only the group, or delete the group and its parts. Closing the question leaves the group as it was, flagged in the editor as having lost its token. A copied token carrying the flag asks nothing, because the group's record has to name the token as its anchor.

## Capture

"Capture area" on the anchor (the pin in phase 1): the GM drags a rectangle with Blacksmith's `pickArea` and every placeable of a supported type whose centre is inside, across all layers, becomes a member, with offsets computed from the anchor's current position and heading (un-rotated into the anchor's frame). "Add selected" and "Remove member" cover single elements. Members deleted from the scene are pruned through the delete hooks.

## Order

The sequence is in `TODO.md`.
