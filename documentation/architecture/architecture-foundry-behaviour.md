# Foundry Behaviour Puppeteer Relies On

**Audience:** contributors changing how Puppeteer moves documents or reads Foundry's state.

What Foundry v14.369 does that Puppeteer depends on. Entries marked "read" come from the installed source; entries marked "observed" were seen in a running world.

## Documents

- **A tile's `x, y` is not its top-left corner (read).** A tile carries a texture anchor (`texture.anchorX`, `anchorY`, default 0.5), its mesh is drawn with that anchor at `x, y`, and it turns about that point (`client/canvas/placeables/tile.mjs`). With the default, `x, y` is the centre. Its pose is a point and a heading, exactly like a light, and its width, height and anchor only matter for drawing its outline. Reading a tile as top-left put every tile half its size out of place, which only shows once a group turns or is stamped.
- **A drawing's `x, y` is the top-left of an unrotated box that turns about its centre (read, `client/documents/drawing.mjs`).**
- **Integer fields.** `x` and `y` on Tile, AmbientLight, AmbientSound and Note, and every number in a Wall's `c`, are integers, so computed positions are rounded before writing. A Drawing's are not. Rounding cannot accumulate, because every position is computed afresh from the stored offsets.
- **Rotation** is an `AngleField` on Tile, Drawing and AmbientLight. AmbientSound has none.
- **Levels (read).** Tile, Drawing, AmbientLight, AmbientSound, Wall and Note carry a `levels` set, and a Token has a single `level`. Puppeteer leaves `levels` out of templates and does not move a group between levels.
- **MeasuredTemplate is not a core document in v14.**
- **Regions** have no position of their own, only a list of shapes. They are carried by shape (see the Groups architecture document).
- **Duplicating a scene (read).** The sidebar's Duplicate clones the scene without its own `_id` and with `keepEmbeddedIds` at its default of true, so embedded documents and the scene's flags keep their ids. Adventure export and import and compendium export keep them too. A copy therefore carries working groups of its own.

## Tokens

- **Movement is a multi-waypoint operation (read).** `TokenDocument#movement` exposes `origin`, `destination`, `passed.waypoints`, `pending.waypoints`, `state` and `method`. `TokenDocument.MOVEMENT_FIELDS` is `x, y, elevation, width, height, depth, shape, level`.
- **A multi-waypoint drag arrives as one position update (observed).** A drag with four passed waypoints was a single `updateToken` with `x, y, rotation` changed. Rotation can follow in a second, rotation-only update about 127 ms later. Each update must be handled on its own.
- **Inside `updateToken`, the document's own `x`, `y` and `rotation` hold the old, still-animating state (observed).** The committed values are in `_source` and in the update's `changes`. Puppeteer reads `_source` for every token.
- **The `displace` movement action (read, `client/config.mjs`).** It is a teleport: walls are ignored, speed is infinite, cost is zero, and nothing is visualised. An update option of `teleport: true` maps to it (deprecated in v13 for removal in v15). Puppeteer moves riders and bodies this way, with `animate: false`.
- **Foundry writes its own fields onto the options passed to `update`.** An options object that is frozen, or shared between calls, fails with "object is not extensible". Puppeteer builds a fresh options object for every write.
- **A token's `width` and `height` are positive numbers and need not be whole squares (observed).** A 6.5 by 3.5 token was drawn at exactly 650 by 350 pixels on a 100 pixel grid.

## The body token (observed)

Seen with a throwaway macro on an actor with a dnd5e sheet.

- Selecting or hovering the token outlines the whole footprint, not the image, so a transparent token still shows where it is.
- A locked token cannot be dragged, by the GM or anyone else: Foundry warns "You cannot take this action while the Token object is locked". A plain `update({ x })` of a locked token left it where it was. An update with `teleport: true`, and `move()` with action `displace`, both moved it.
- It can be targeted, by hand and programmatically. Double-clicking it opens the actor's sheet, and an attack rolled against it applied damage to the actor.
- The token's hit area printed as an empty object, so it is not a plain rectangle.
