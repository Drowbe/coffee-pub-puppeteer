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
| `createGroup({ scene, point, name })` | Makes a group on a new pin at `point` (default: the centre of the view). Returns the record. |
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
| `setMovePivot(groupId, on, scene)` | While on, dragging or turning the group's pin moves only the grip: nothing else moves, and every part and rider is recorded against the pin's new place. Off, the pin takes the group again. Returns the new state. |

## Moving and turning

| Call | Does |
|---|---|
| `setHeading(groupId, degrees, scene)` | Turns the group to a heading by writing the pin's `rotation`. |
| `rotateBy(groupId, degrees, scene)` | Turns it by a step. |

To move a group, move its pin (`BlacksmithAPI.pins.update(pinId, { x, y })`); the follower does the rest.

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
| `exportGroup(groupId, scene)` | A portable template (format version 2) of the group. |
| `library.list()` | Saved templates. |
| `library.save(groupId, scene)` | Saves the group to the world library. A group with a body saves the actor it represents. |
| `library.stamp(templateId, { scene, point, heading, name })` | Creates new parts, a new pin and a new group from a template, with a body if the template names an actor that exists in this world. |
| `library.remove(templateId)` | Deletes a template. |
| `library.import(jsonText)` | Adds a template from exported JSON. Version 1 templates are refused with a message. |

## Display

| Call | Does |
|---|---|
| `showBounds(value)` | Shows or hides the bounds overlay for this user. Omit `value` to toggle. |

## Changes agreed, not yet in the API

- Group behaviour options.
- Events other modules can listen to when a group is created, moved or deleted.
