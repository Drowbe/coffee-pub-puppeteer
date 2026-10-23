# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [14.0.0]

### Added
- **Regions in groups.** A region can be a member, so zones such as a campsite or a trap area move and turn with the rest. Every shape in the region is carried: rectangles (by their anchor point), ellipses, circles, cones, rings, lines, polygons and emanations. Regions with a token or grid-cell shape cannot be turned freely and are refused with a reason. Add them with Add Selected.
- **Groups on tokens.** A group can hang from a token, such as a cart or a ship a player pilots, and follows its position and heading. Make one with On Selected Token in the Group Editor. The group follows the token's committed position, so a paused, stopped or undone move leaves the parts where the token really is. If no GM is connected, the person moving the token is told once and the parts catch up when a GM comes online. Turning the group in the editor turns the token. An existing group can be moved onto a token with Attach to Token (in the editor and the pin menu), and back onto a pin with Detach from Token; nothing in the scene moves either way, because every member is re-recorded against the new pivot.
- **Tiles are placed correctly in v14.** A v14 tile's `x, y` is its texture anchor point, the centre by default, not its top-left corner, and it turns about that point. Puppeteer had treated it as top-left, so a tile was half its size out whenever a group turned or a template was stamped. Group records saved before this are repaired from where the tiles are when the world loads, and exported templates from before are refused with a clear message (template format version 2).
- **Failures are no longer silent.** An error while moving or turning a group, or while centring its pivot, is shown to the GM instead of only logged, and is handed back to whoever asked. Centre Pivot checks that the pin really moved and puts the group back if it did not. A member that another module stops from moving raises one notification.
- **Library and stamping.** Save a group to a library kept in a world setting, then stamp it onto any scene, as many times as wanted, at the centre of the view. Each stamp creates new tiles, lights, sounds, walls, a new pin and a new group, so two stamps are two independent copies. Templates can be imported from and exported to JSON files. In the Group Editor and the console API.
- **Group bounds overlay.** An optional overlay draws the box that holds each group (turned with the group), its pivot and the way it faces. Toggled from the toolbar, the Group Editor or the pin menu; remembered per user.
- **Member names.** Each member of a group can be given a name in the Group Editor; the name survives hand edits and travels in templates.
- **Diagnosis.** `api.diagnose(groupId)` reports where a group's pin, record and members are against where they should be.
- **Contributor checks.** `node tools/check-scripts.mjs` (scripts parse as ES modules, every import resolves), `node tools/check-blacksmith-only.mjs` (fails on core calls Blacksmith replaces, such as `Hooks.on`, `game.socket`, `ui.notifications`), and `node --test tests/*.test.mjs` (geometry and templates).
- **Group templates.** A group can be exported as a portable template (offsets and a snapshot of every member), saved as JSON from the Group Editor, and turned into creation data for any pivot and heading. This is the format prefabs will use.
- **Centre Pivot.** Moves a group's pin to the centre of what it holds without moving any member, so the group turns about its own middle. In the Group Editor and the pin menu.
- **Manual edits are kept.** Moving, turning or resizing a member by hand updates where it sits in the group, instead of being undone on the next move. Capturing waits for the group to settle first. The follower logs what it writes under Blacksmith debug and warns when a member does not take the position it wrote.
- **Capture Area.** Drag a box and every tile, drawing, light, sound, wall and note whose centre is inside joins the group, across all layers, using Blacksmith's area pick. Available from the Group Editor and the pin menu.
- **Group Editor, toolbar and pin menu.** A Group Editor window lists the groups on the scene with their members, heading, rename, add and remove selected, select members, go to pin and delete. The Blacksmith toolbar has Puppeteer Groups and New Group tools, and right-clicking a group's pin offers Add Selected, Remove Selected, Select Members, Rotate 90 either way and Open Group Editor. Deleting a member's document removes it from its groups.
- **Pin-anchored groups.** A group is a record in a scene flag, anchored on a Blacksmith pin. Dragging the pin, or changing the group's heading, moves and rotates every member (Tile, Drawing, AmbientLight, AmbientSound, Wall, Note) rigidly. The active GM applies it from `updateScene`, one queued write per group. Driven from a console API on the module for now.
- **Bootstrap.** Puppeteer waits for Blacksmith, refuses to start if its ready stage failed or any API member it uses is missing, registers its console label and registers itself with Blacksmith.
- **Module scaffold.** Folder layout, release and wiki workflows, and the design plan. No feature code yet.
