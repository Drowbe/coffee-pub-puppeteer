# Puppeteer API

**Audience:** macro authors and module developers scripting groups.

Puppeteer exposes its operations at `game.modules.get('coffee-pub-puppeteer').api`. It is set once Blacksmith is ready and Puppeteer has started, so use it from a macro or from `ready` onwards. The toolbar and the Group Editor call these same functions.

Every function that takes a scene defaults to `canvas.scene`, and the scene is always the last argument unless noted. Group ids come from `listGroups`. Writes need a GM; the active GM carries out the movement.

```js
const puppeteer = game.modules.get('coffee-pub-puppeteer').api;
const group = await puppeteer.createGroup({ name: 'Drawbridge' });
await puppeteer.addSelected(group.id);
await puppeteer.rotateBy(group.id, 90);
```

## Groups

| Call | Does |
|---|---|
| `scene()` | The scene in view. |
| `listGroups(scene)` | The scene's group records. |
| `scale(groupId, factor, scene)` | Resizes a group about its pin by `factor`, from 0.1 to 10: parts sit that many times as far from the pin and are that many times as big (tiles, drawings, light and sound reach, region shapes), walls and notes move, riders stand that many times as far from the pin at their own size, and the token is refitted. A factor of 1 does nothing. Returns `{ scaled }`, the number of parts. |
| `resetScale(groupId, scene)` | Puts a resized group back to the size it had before it was resized (the group remembers its total as `scale`). Returns `{ scaled }`. |
| `reorderPart(groupId, type, id, anchor, after, scene)` | Moves a part to another place in the group's list: beside `anchor` (`{ type, id }`), after it if `after`, or to the end if `anchor` is null. The list is also the stack: the first tile (or drawing) in it is drawn in front, so the group's tiles and drawings are given new sort order values to match. Elevation is not changed. Returns whether the order changed. |
| `restack(groupId, where, scene)` | Draws a whole group above (`'front'`) or below (`'back'`) everything else on the scene by changing the sort order of its tiles and drawings, keeping their order among themselves. Elevation is not changed, so something above by elevation still covers it. Returns `{ moved }`. |
| `setWidth(groupId, squares, scene)` | Resizes a group so it is `squares` grid squares wide, within a tenth and ten times its width now. Returns `{ scaled }`. |
| `getState(groupId, scene)` | What the group is doing now, on this client: `x`, `y` and `heading` of its pin (where it is going while it moves), `moving`, `speed` in squares a second (0 when still), `progress` through the current move (0 to 1), `hidden`, and the counts `members`, `riders` and `hasToken`. Read-only, and null for a group that does not exist. There is no event for a change; read it each frame or on an interval. A group that jumps is never moving. |
| `createGroup({ scene, point, name })` | Makes a group on a new pin at `point` (default: the centre of the view). Returns the record. |
| `addEvent(groupId, { on, do, value }, scene)` | Gives a group a rule. `on` is `'board'`, `'leave'`, `'move'`, `'hide'`, `'show'` or `'health'` (which also takes `at`: `'healthy'`, `'injured'`, `'bloodied'`, `'critical'` or `'dead'`); `do` is `'sound'` (value is a sound path, played for everyone), `'macro'` (value is a macro's id or UUID, run on the GM's screen with `scope.group`, `scope.scene` and `scope.event`) or `'image'` (value is a picture path; `target` is the id of one of the group's tiles, whose picture it becomes). At most 20 a group. Returns the stored rule, with its `id`. |
| `removeEvent(groupId, eventId, scene)` | Removes a rule. Returns whether it was there. |
| `setPlaying(groupId, playing, scene)` | Plays or pauses a group: runs its events for "Play is clicked" or "Pause is clicked" (the group is paused after Pause and playing after Play); `playing` left out flips it. A group with no such event does nothing. Returns `{ playing, ran }`. |
| `setEmittersOn(groupId, type, on, scene)` | Switches a group's lights (`'AmbientLight'`) or sounds (`'AmbientSound'`) on or off together. With `on` left out, they flip: if any is on they all go off, otherwise they all come on. Returns `{ on, count }`. |
| `replacePin(groupId, scene)` | Gives a group that lost its pin without being deleted (deleting a pin deletes its group) a new pin where the group last was, facing the way it faced. Nothing moves. Refused if the group still has its pin. Returns the updated record. |
| `duplicate(groupId, { name }, scene)` | Copies a group on its scene: new parts and pin two squares to the right, the same heading and behaviour, and its own body if it has one. Riders are not copied. Returns the new record. |
| `deleteGroup(groupId, scene)` | Deletes the group record. Parts stay on the map. |
| `renameMember(groupId, type, id, label, scene)` | Names a member. The name survives hand edits and travels in templates. |
| `diagnose(groupId, scene)` | Reports where the pin, record and members are against where they should be. |

## Members

| Call | Does |
|---|---|
| `addSelected(groupId, scene)` | Adds the objects selected on the canvas, across layers. |
| `addMembers(groupId, documents, scene)` | Adds embedded documents (Tile, Drawing, AmbientLight, AmbientSound, Wall, Note, Region). |
| `removeMember(groupId, type, id, scene)` | Removes one member. The object stays on the map. |
| `captureArea(groupId, options, scene)` | Drags a box with Blacksmith's area pick and adds what is inside. |
| `recenterPivot(groupId, scene)` | Moves the pin to the centre of the members without moving any of them. |
| `setMovePivot(groupId, on, scene)` | While on, the next move or turn of the group's pin moves only the grip: nothing else moves, every part and rider is recorded against the pin's new place, and the mode switches itself off. Off, the pin takes the group. Returns the new state. |

## Moving and turning

| Call | Does |
|---|---|
| `setHeading(groupId, degrees, scene)` | Turns the group to a heading by writing the pin's `rotation`. |
| `rotateBy(groupId, degrees, scene)` | Turns it by a step. |

To move a group, move its pin (`BlacksmithAPI.pins.update(pinId, { x, y })`); the follower does the rest.

## Hiding

| Call | Does |
|---|---|
| `setHidden(groupId, hidden, scene)` | Hides or shows the group's tiles, drawings, lights, sounds, regions and body token. Parts already hidden when the group is hidden stay hidden when it is shown. Walls, notes and riders are left alone. Returns whether the group is now hidden. |
| `setMemberHidden(groupId, type, id, hidden, scene)` | Hides or shows one part. Only Tile, Drawing, AmbientLight, AmbientSound and Region can be hidden. |

## Making a group a target

| Call | Does |
|---|---|
| `setBody(groupId, actorId, { scene, linked })` | Gives the group a body: a transparent, locked token of the actor, sized to cover the group and moved with it. Unlinked unless `linked`. Returns the token. A group has one body. |
| `adoptBody(groupId, token, scene)` | Uses a token already on the scene as the body. It is made transparent, locked and fitted. |
| `clearBody(groupId, scene)` | Deletes the body token. The group, its pin and its parts stay. Returns whether there was one. |
| `setBodyLinked(groupId, linked, scene)` | Links or unlinks the body's actor. |

The body is fitted to the group by the follower. Do not move it yourself: it is locked, and a plain update is refused.

## Riders

| Call | Does |
|---|---|
| `mount(groupId, tokens, scene)` | Puts token documents aboard the group. Each must be on it (its middle inside), not a body, and not riding another group. Returns `{ mounted, skipped }`, where `skipped` says why. |
| `dismount(groupId, tokenId, scene)` | Lets a rider go. It stays where it is, and does not board again until it has left the group and come back. Returns whether it was aboard. |
| `setMountable(groupId, mountable, scene)` | When on, a token that moves onto the group, or is created on it, boards it. |

## Library and templates

| Call | Does |
|---|---|
| `exportGroup(groupId, scene)` | A portable template (format version 2) of the group: its parts, its body's actor and how it behaves (`behaviour`: movement, turning, boarding, events, size and the rest of the Behaviour section). A template without `behaviour`, saved by an earlier build, stamps with the defaults. |
| `library.list()` | Saved templates. |
| `library.save(groupId, scene)` | Saves the group to the world library. A group with a body saves the actor it represents. |
| `library.stamp(templateId, { scene, point, heading, name })` | Creates new parts, a new pin and a new group from a template, with a body if the template names an actor that exists in this world. |
| `library.remove(templateId)` | Deletes a template. |
| `library.rename(templateId, name)` | Renames an entry. A blank name is refused. |
| `library.describe(templateId, text)` | Sets an entry's description. A blank one removes it. |
| `library.updateFromGroup(templateId, groupId, scene)` | Replaces an entry's parts with those of a group. The entry keeps its id, name and description; copies already placed are not changed. |
| `library.import(jsonText)` | Adds a template from exported JSON. Version 1 templates are refused with a message. |
| `library.categories()` | The library's categories by name, each `{ id, name, count }`. |
| `library.createCategory(name)` | Makes a category and returns its id. A blank name, or one already used (compared without regard to case), is refused. |
| `library.renameCategory(categoryId, name)` | Renames a category, with the same checks. |
| `library.removeCategory(categoryId)` | Deletes a category. Its entries are kept, uncategorised. |
| `library.setCategory(templateId, categoryId)` | Files an entry in a category, or in none with `null`. `library.list()` gives each entry's `category`. |

## Behaviour

| Call | Does |
|---|---|
| `setBehaviour(groupId, options, scene)` | Sets any of: `ease` (`{ mode: 'ease' \| 'travel' \| 'jump', ms, speed }`; `ms` is kept between 100 and 3000 and `speed`, in squares a second, between 0.5 and 60), `front` (degrees clockwise from down: which way the picture's front points, for facing travel; 0 down, 90 left, 180 up, 270 right), `lockRotation` (on by default: the group keeps its heading when moved; off, it turns to face the way its pin was moved, leading with `front`; the group's token is locked or unlocked to match; `facesTravel` is the same switch the other way round and is still accepted), `ridersFree` (whether riders may be moved about inside it), `solidOnly` (shown as Ignore Transparent Area), `snap` (go to the nearest grid point when the pin is dropped) (default true: only the solid part of a tile's picture counts as on the group, so a token on a transparent corner does not board), `announce` (chat card and sound when a token boards or leaves). Anything left out is unchanged. Returns the group record. |

`setHeading` and `rotateBy` always turn the group, whether or not its rotation is locked.

## Display

| Call | Does |
|---|---|
| `showBounds(value)` | Shows or hides the bounds overlay for this user. Omit `value` to toggle. |

## Not in the API

Puppeteer does not publish events. Blacksmith offers no way to emit one, and Puppeteer does not call `Hooks.callAll` itself. Another module that needs to know a group moved can listen for the update of the scene flag `flags.coffee-pub-puppeteer.groups`, or of the members' own documents.
