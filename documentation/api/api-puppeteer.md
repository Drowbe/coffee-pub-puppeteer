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

## Library and templates

| Call | Does |
|---|---|
| `exportGroup(groupId, scene)` | A portable template (format version 2) of the group. |
| `library.list()` | Saved templates. |
| `library.save(groupId, scene)` | Saves the group to the world library. |
| `library.stamp(templateId, { scene, point, heading, name })` | Creates new parts, a new pin and a new group from a template. |
| `library.remove(templateId)` | Deletes a template. |
| `library.import(jsonText)` | Adds a template from exported JSON. Version 1 templates are refused with a message. |

## Display

| Call | Does |
|---|---|
| `showBounds(value)` | Shows or hides the bounds overlay for this user. Omit `value` to toggle. |

## Token groups (to be retired)

`createTokenGroup(token, { name })`, `attachToToken(groupId, token, scene)` and `detachToPin(groupId, scene)` belong to the token-anchored mode that the pin-and-body-token model replaces. They keep working until groups convert on load and are then removed.

## Changes agreed, not yet in the API

- Naming an actor in a library template, so a stamp comes with its body.
- Group behaviour options.
- Events other modules can listen to when a group is created, moved or deleted.
