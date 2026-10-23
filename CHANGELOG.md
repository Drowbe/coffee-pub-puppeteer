# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [14.0.0]

### Added
- **Centre Pivot.** Moves a group's pin to the centre of what it holds without moving any member, so the group turns about its own middle. In the Group Editor and the pin menu.
- **Manual edits are kept.** Moving, turning or resizing a member by hand updates where it sits in the group, instead of being undone on the next move. Capturing waits for the group to settle first. The follower logs what it writes under Blacksmith debug and warns when a member does not take the position it wrote.
- **Capture Area.** Drag a box and every tile, drawing, light, sound, wall and note whose centre is inside joins the group, across all layers, using Blacksmith's area pick. Available from the Group Editor and the pin menu.
- **Group Editor, toolbar and pin menu.** A Group Editor window lists the groups on the scene with their members, heading, rename, add and remove selected, select members, go to pin and delete. The Blacksmith toolbar has Puppeteer Groups and New Group tools, and right-clicking a group's pin offers Add Selected, Remove Selected, Select Members, Rotate 90 either way and Open Group Editor. Deleting a member's document removes it from its groups.
- **Pin-anchored groups.** A group is a record in a scene flag, anchored on a Blacksmith pin. Dragging the pin, or changing the group's heading, moves and rotates every member (Tile, Drawing, AmbientLight, AmbientSound, Wall, Note) rigidly. The active GM applies it from `updateScene`, one queued write per group. Driven from a console API on the module for now.
- **Bootstrap.** Puppeteer waits for Blacksmith, refuses to start if its ready stage failed or any API member it uses is missing, registers its console label and registers itself with Blacksmith.
- **Module scaffold.** Folder layout, release and wiki workflows, and the design plan. No feature code yet.
