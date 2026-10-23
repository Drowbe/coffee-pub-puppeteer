# Plan: Grouped Movement

**Audience:** contributors building Puppeteer.

The design for moving scene elements as one group, anchored first to a Blacksmith pin and later to a vehicle token. Deleted when the module ships; durable knowledge moves to `architecture/`.

## Goal

Group tiles, lights, sounds, walls, drawings and notes, and move and rotate them as one. A group does not need an actor or a token.

## Phases

1. **Pin-anchored groups of scene elements.** The GM makes a group on a Blacksmith pin, adds and removes members, and dragging the pin moves the whole group while a rotate action turns it. No tokens anywhere: this proves the model (offsets in the anchor's frame, committed state, one batched write per type) on things that are not actors. Set pieces such as a drawbridge, a barge on rails or a moving stage are the use case.
2. **Tokens.** A token can anchor a group, so a vehicle a player pilots drags its parts, and tokens can be members, which is how passengers are carried (footprint plus an explicit boarded toggle).
3. **Prefabs.** Save a group as a template and stamp it onto a scene as many times as wanted, each stamp an independent copy. Vehicles keep their template on an Actor; set pieces keep theirs in a Puppeteer library.
4. **Polish.** Menubar tool and secondary bar, sounds, toast channel, Scene Config tab, the hard-dependency check.

The rest of this plan describes the end state. The pin follower is built first; the token follower reuses its math and adds what is specific to token movement.

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
| Windows | `BlacksmithWindowBaseV2` for the Group Editor (members, footprint, carry toggle, heading for pin groups); `BlacksmithToolWindowBaseV2` for the capture palette. The classes are imported from `/modules/coffee-pub-blacksmith/api/blacksmith-api.js`, never read from `module.api` at class-definition time. Both are registered with `registerWindow` so toolbar, menubar and macros open them by id. |
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
- A **heading** for pin-anchored groups, since a pin has no rotation of its own. A token-anchored group takes its heading from the token.

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

One `updateToken` hook, registered through the Hook Manager. It acts only on the client that is `game.users.activeGM`, the same election `gmRequest` uses, so exactly one client writes and every Coffee Pub module agrees on who that is. It ignores updates where no field in `TokenDocument.MOVEMENT_FIELDS` or `rotation` changed (elevation and level are already movement fields), ignores tokens whose `groupId` does not resolve to a record naming that token as its anchor, and ignores updates tagged as its own.

**Loop guard.** Every follower write carries an update option `{ puppeteer: { follower: true } }`. The hook returns on that option. A token that is already a member of a group is refused as an anchor, and a group cannot contain its own anchor, so there is no cycle to walk.

**Heading.** A vehicle's heading is the token's `rotation`. In v14 the same update that moves a token can also rotate it, through the core `tokenAutoRotate` setting or the `autoRotate` movement option, so the follower reads `x`, `y` and `rotation` from the committed update and never from the planned destination.

For each member it computes the new position from the anchor's new centre and heading, and writes members in one `updateEmbeddedDocuments` call per document type, with `animate: false` so the batch does not fight the token's own animation.

**Passengers are displaced, not moved.** A passenger's `x, y` change goes through the same v14 movement pipeline as any token, which applies wall and terrain constraints (`constrainOptions`) unless told otherwise. A cart carrying a passenger past a wall would stop the passenger or reject the update. The follower therefore writes passenger tokens with the constraints switched off (`ignoreWalls` and `ignoreCost`) or through the displace path core uses for teleport, undo and paste. Which of the two is correct is settled when passengers are built.

Per type:

| Member | Position | Heading |
|---|---|---|
| Tile, Drawing | `x`, `y` after rotating the member's centre | `rotation = anchor.rotation + drot` |
| AmbientLight | `x`, `y` | `rotation` the same way (matters for directional lights) |
| AmbientSound | `x`, `y` | none |
| Wall | both endpoints in `c`, rotated about the anchor centre | endpoints carry it |
| Note | `x`, `y` | none |
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
- **Heading is ours.** Blacksmith will not add a rotation to pins, so the heading lives in Puppeteer's data and its own rotate UI.
- **Phase 1 has no tokens.** Member types are Tile, Drawing, AmbientLight, AmbientSound, Wall and Note. MeasuredTemplate is not a core document in v14. Token members and token anchors arrive in phase 2.

## Observed

These concern a token anchor, so they apply from phase 2. One drag in v14.369 as the GM, with a throwaway macro that wrote a tile and a light from each `updateToken`.

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
5. Does duplicating a scene keep the ids of its embedded documents? Groups reference members by id inside a scene flag, so a duplicate that regenerates ids would need the records remapped. Untested.
6. Regions (v12 and later) are not covered. They carry shapes and a `levels` set, and could be members later.

## Capture

"Capture area" on the anchor (the pin in phase 1): the GM drags a rectangle with Blacksmith's `pickArea` and every placeable of a supported type whose centre is inside, across all layers, becomes a member, with offsets computed from the anchor's current position and heading (un-rotated into the anchor's frame). "Add selected" and "Remove member" cover single elements. Members deleted from the scene are pruned through the delete hooks.

## Order

The sequence is in `TODO.md`.
