# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [14.0.0]

### Added
- **Pin-anchored groups.** A group is a record in a scene flag, anchored on a Blacksmith pin. Dragging the pin, or changing the group's heading, moves and rotates every member (Tile, Drawing, AmbientLight, AmbientSound, Wall, Note) rigidly. The active GM applies it from `updateScene`, one queued write per group. Driven from a console API on the module for now.
- **Bootstrap.** Puppeteer waits for Blacksmith, refuses to start if its ready stage failed or any API member it uses is missing, registers its console label and registers itself with Blacksmith.
- **Module scaffold.** Folder layout, release and wiki workflows, and the design plan. No feature code yet.
