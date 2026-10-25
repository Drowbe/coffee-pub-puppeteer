# Groups

**Audience:** contributors changing how Puppeteer stores, moves and draws a group.

How a group is built, stored and kept in step with its pin. Anything marked "not built" is agreed design that is not yet in the code.

## The model

A group is one pin and the things that move with it.

- **The grip is always a Blacksmith pin.** Dragging the pin moves the group, Shift + mouse wheel over the pin turns it, and the Group Editor's heading field and rotate buttons write the same pin. Hiding the pin, restyling it or limiting who may edit it changes nothing about the group.
- **The parts** are Tiles, Drawings, AmbientLights, AmbientSounds, Walls, Notes and Regions. Each is recorded as an offset from the pin, in the pin's own frame.
- **The body token** is an optional token that makes the whole group targetable. It is a part like the others, never the grip.
- **Riders** are tokens the group carries, free to move inside it.

Engaging with a group is therefore always the same: find its pin.

## Where data lives

Groups are records in one scene flag, `flags.coffee-pub-puppeteer.groups`, keyed by group id (`scripts/store.js`). The pin holds only `config.puppeteer = { groupId }`. Pin `config` sits in a scene flag shared by every pin and every module, and `update()` replaces a nested object whole, so a member list kept there would be rewritten on every change.

A group record holds:

| Field | Meaning |
|---|---|
| `id`, `name`, `version` | Identity and record version (migrations key off it). |
| `anchor` | `{ type: 'pin', id }`. |
| `applied` | The pin state (`x`, `y`, `heading`) the members were last written for. The follower compares it to the pin to see what changed. |
| `heading` | Mirrors the pin's `rotation`, for display. The pin is the truth. |
| `members` | `{ type, id, dx, dy, drot }`, plus `label` for a name, `c` for a Wall's endpoints and `shapes` for a Region. |

`id` is the embedded document id on the scene, not a UUID, because a UUID names the scene and breaks when a scene is duplicated or imported.

## Frames and maths

Offsets are stored in the pin's frame (heading zero), so a member's world pose is one rotation and one translation of its stored offset (`scripts/frame.js`, `scripts/geometry.js`). Positions are computed absolutely from the pin's committed state, never by adding deltas, so repeated moves cannot drift.

| Member | Pose |
|---|---|
| Tile | `x, y` is the texture anchor point (the centre by default) and the tile turns about it. A point and a heading, like a light. |
| Drawing | `x, y` is the top-left of a box that turns about its centre, so the centre is carried and converted back. |
| AmbientLight | `x, y` and `rotation`. |
| AmbientSound, Note | `x, y`. |
| Wall | Both endpoints of `c`, rotated about the pivot. |
| Region | Every shape, by its own rule (`scripts/region-shapes.js`). Token and grid shapes cannot be carried and the region is refused. |

Tile, AmbientLight, AmbientSound and Note `x, y`, and every number in a Wall's `c`, are integer fields, so computed positions are rounded before writing. Rounding cannot accumulate because each position is computed afresh.

## The follower

`scripts/follower.js`. Runs only on `game.users.activeGM`, driven by `updateScene` (Blacksmith's pin events fire only on the client that wrote, so they cannot drive a second GM's drag). When the pins flag changes, each group's pin is compared with `applied`; if they differ the members are written, one `updateEmbeddedDocuments` call per type, tagged `{ puppeteer: { follower: true } }`.

- **Serialised per group.** Hook Manager callbacks are not awaited, so a promise chain per group makes the last update land last.
- **Hand edits.** Moving, turning or resizing a member by hand re-records its offset against the pose the group currently occupies, so the next move does not snap it back. The follower's own writes are told apart by the option marker and by the member already sitting where the record puts it.
- **Errors are handed back** to the caller and shown to the GM; they are never only logged.
- **No GM connected.** Nothing moves. `syncAllGroups` runs at load and when a GM connects, so the group catches up.
- **Migration first.** Older records are migrated (`scripts/migrate.js`) before the follower listens, so a scene update cannot be read by new rules against an old record.

## Smooth movement

`scripts/tween.js`. Only what is drawn changes; documents are never touched.

- **Dragging a pin:** Blacksmith reports `dragMove` on the dragging client, and Tiles, Drawings and Notes follow the pointer there.
- **A pin that moved or turned:** the follower puts the previous `applied` pose in its write options. Each client eases the pin pose from there to the new one over about 350 ms and recomputes the members each frame, so a turn swings along arcs. The client that just dragged skips it.
- Lights, Walls, Sounds and Regions take part in perception and cannot be animated by moving a sprite, so they update when the documents are written.

## Capture, templates and the library

- **Capture Area** (`api.canvas.pickArea`) adds every supported placeable whose centre is in a dragged box, across layers. **Add Selected** and **Remove Member** handle single elements. Deleted members are pruned (`scripts/prune.js`).
- A **template** is a portable snapshot: offsets from the pivot plus a copy of each member's data, minus scene-bound fields (`_id`, `_stats`, `levels`). Format version 2. Built by `exportGroup`, turned into creation data by `stampMembers` (`scripts/template.js`).
- The **library** is a world setting, `library` (`scripts/library.js`). Stamping creates the group first, then fresh documents for the stored heading, so two stamps are two independent copies; a failed stamp cleans up after itself.

## Body token

A body is optional, and most groups have none: a group with no actor is a pin and its parts, and nothing in Puppeteer requires an actor. A group may represent an actor, and the body token is how it then takes attacks and damage (`scripts/body.js`, with the operations in `scripts/groups.js`).

- **Record.** `group.body = { tokenId, actorId }`. The token carries `flags.coffee-pub-puppeteer.groupId` and `body: true`. It is not in `members`: it has no offset, because it is derived from them.
- **Made from an actor** (`setBody`): the actor makes the token data, so name, bars and disposition are the actor's. Unlinked by default, linked optionally (`setBodyLinked`). In the Group Editor, drag an actor from the sidebar onto the group's body row. Actors in a compendium must be imported first.
- **Adopted from a token** (`adoptBody`): a token already on the map becomes the body. Dropping an actor on the map over a group is reserved for riders and never makes a body. A token with no actor, or one that already belongs to a group, is refused.
- **Looks.** A transparent image, `images/transparent.png`, set on this placed token only; the actor's own art is untouched. Vision is off.
- **Footprint.** Token `width` and `height` are positive numbers and need not be whole squares. The body is the axis-aligned bounding box of the group's Tiles, Drawings, Walls and Regions as they sit now, at least half a square each way. Lights, Sounds and Notes have a place and no size, so they are left out; a group with nothing sized gets a half-square body on its pivot. It is refitted (`fitBody`) after the follower moves the members, after a hand edit is re-recorded, and after parts are added or removed. The footprint does not turn with the group, so at diagonal headings it covers more than the group.
- **Locked.** `locked: true` stops anyone dragging it, the GM included; Foundry warns "You cannot take this action while the Token object is locked". A plain `update({ x })` is refused too, so the follower moves the body with `teleport: true, animate: false`, which Foundry treats as a `displace` move that ignores walls, speed and cost.
- **Targeting.** Selection and hover outline the whole footprint, not the image, so clicking anywhere in it targets the actor. Attacks, damage, the sheet and initiative work as for any token.
- **Not the grip.** The body never drives the group. Deleting it by hand leaves the group without a body; deleting the group deletes the body; `clearBody` removes only the body.

A template saved from a group with a body carries the actor (`body: { actorId, actorName, linked }`), never the token. Each stamp makes its own body, sized to that stamp's heading. If the actor is not in the world, the stamp has no body and the GM is told.

Not built yet: converting token-anchored groups, and animating the body (it jumps to its new place with the parts that cannot be tweened).

Group behaviour options (designed): whether the group turns with its pin or only on request, a facing offset for art that does not face down, movement style (glide or jump), and, with riders, whether the group is mountable and whether riders move freely inside it.

## Behaviour

A group's record carries a few choices, set in the editor's Behaviour section or with `setBehaviour`:

- **`ease`**: `{ mode: 'ease' | 'jump', ms }`. Gliding (the default, 350 ms, kept between 100 and 3000) is the smooth movement described above; jumping gives the member writes no glide and stops the live follow while the pin is dragged. Riders are drawn along with tiles, drawings and notes (`DISPLAY.Token` in `tween.js` sets the token's own position and mesh as Foundry's refresh does, and the same short hold keeps the pose against Foundry's redraw). The body token is not drawn eased: it is transparent, so only its selection outline would show, and that jumps.
- **`rotates`**: whether the group turns when its pin turns (default yes). Off, `headingOf` (in `anchor.js`) returns the heading the group had when this was chosen (`fixedHeading`), so the pin can be turned freely and nothing turns; the editor's heading field and rotate buttons are disabled and `setHeading` refuses. Turning it on again first records every part against the pin's own heading (`repivot`), so nothing swings.
- **`ridersFree`**: whether a rider may be moved about inside the group (default yes). Off, a rider moved by hand is put back where it rides.
- **`mountable`**: whether tokens that move onto the group, or are created on it, board it (see Riders).
- **`announce`**: whether boarding and leaving post a public chat card (`chatCards.post`, in `announce.js`) and a soft sound heard by everyone (`utils.playSound`, broadcast). Off by default.

Other feedback: a short sound on this screen only after a stamp or a Capture Area that added members; every toast goes out on the `puppeteer` channel, declared with `toast.registerChannel`, so a GM can switch them off; the menubar has a toggle for the bounds overlay (kept in step with the editor's and toolbar's switches through `updateMenubarToolActive`) and a button for the Group Editor.

## Moving the grip

The pin can sit anywhere: the prow of a ship, a wagon's hitch, a door's hinge. Dragging a pin normally takes the group with it, and Blacksmith saves the pin before Puppeteer sees the drop, so a drag cannot be told apart in time. Move Pivot is therefore a mode on the group (`group.movePivot`). While it is on, the follower does not write the scene when the pin moves or turns; `repivot` in `follower.js` records every member and rider again against the pin's new pose, updates `applied` and `heading`, and switches the mode off, so nothing moves and one drop is one use. The body is left alone, because it does not depend on the pin. With the mode off, the pin takes the group. The live follow while dragging (`tween.js`) is skipped in the mode. Centre Pivot is the same re-recording to the middle of the parts.

## Riders

A rider is a token a group carries (`scripts/riders.js`, `scripts/boarding.js`, with the operations in `scripts/groups.js`).

- **Record.** `group.riders = [{ tokenId, dx, dy, drot }]`: where the token's middle sits in the pin's frame, and its rotation relative to the pin's heading. The token carries `flags.coffee-pub-puppeteer.riderOf = groupId`. `group.mountable` says whether tokens created on the group board it.
- **Carried.** After the follower writes the members it moves every rider to where its record puts it for the new pin pose, with `teleport: true, animate: false`, a `displace` move that ignores walls, speed and cost. A rider turns with the group. A rider whose token is gone is dropped from the record.
- **Boarding.** A token boards only when its middle is inside the group. The box that decides this is the group's sized members (Tiles, Drawings, Walls, Regions) in the pin's frame, so it turns with the group; a group with nothing sized is one square on the pin. A token cannot ride two groups, ride a group that is its own body, or be a body. The ways on: the editor's Board Selected, the macro API, and, when `mountable`, a token that is moved onto the group (the usual way) or created on it (dropping an actor from the sidebar onto it). Moving counts only when x or y changed in a committed update, so turning on the spot does not board. Dropping on the group is reserved for this and never makes a body.
- **Free movement.** A rider moved by hand (a player dragging their own token) inside the group is re-recorded where it was put, so the next move carries it from there. The follower's own moves carry the follower marker and are ignored.
- **Dismounting.** A rider moved by hand so that its middle is outside the group is let go where it stands, and the GM is told. A rider's token deleted by hand, or its group deleted, lets it go too. Dismounting never moves a token. A token let go with the Dismount button gets `flags.coffee-pub-puppeteer.stayed = groupId`, so it does not climb straight back aboard while it is still on that group; the flag clears when it next moves anywhere else, and boarding on purpose clears it too.
- **Not built yet:** boarding by a player choosing to (a request to the GM), chat announcements, easing a rider along with the group (it jumps today), and a rider moving the group.

## Groups saved when a token could be the grip

An earlier version let a token anchor a group. Those records have `anchor.type` `'token'`. On load, `migrate.js` (record version 4) gives each one a pin where the token's centre was and turns its facing into the pin's rotation, re-records every member against that pin so nothing moves, removes the token's group flag and leaves the token as an ordinary token. The token's image is not changed, because making it the body would make it transparent; the GM can adopt it with Use Selected Token. A group whose token had already been deleted is converted to a pin where it last was. Nothing creates a token-anchored group any more, and `anchor.js` keeps its token branch only so those records can be read until they are converted.
