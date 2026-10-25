# TODO

**What is open, ranked.** Nothing else belongs here.

| Looking for | It lives in |
|---|---|
| What shipped, and why | `CHANGELOG.md` |
| What is built and not yet proven in a running world | `testing/testing-foundry-verification.md` |
| How it works | `documentation/architecture/` |
| What is broken and not yet fixed | `known-issues.md` |

**When something is finished, log it where it belongs and delete it from here.**

---

**Stack rank (proposed)**

Effort is for building and testing under Node, not for checking in Foundry. **S** is about an hour, **M** is a few hours, **L** is a day or more or needs design or something from Blacksmith first.

| Rank | Todo | Effort | Why here |
|---|---|---|---|
| 1 | Library: edit and update entries | M | An entry cannot be renamed or replaced today, so every fix means a new entry. The other library items build on it. |
| 2 | Library: description, thumbnail, rename Stamp | M | Description and the rename are S; the thumbnail is the M. Cheap, visible, and makes the library usable. |
| 3 | Group Editor: layout, and expand or collapse the group | M | Each card now carries body, riders, behaviour and members, and the editor is the main surface. Do before adding more to it. |
| 4 | Hide and show a group and its members | M | High value for set pieces such as a bridge that is up or down. Document types hide differently, so it needs a rule per type. |
| 5 | Pin context menu actions | M | Mostly wiring once hide and show exists. A sound submenu needs the public API. |
| 6 | Face the direction of travel | S | One option in Behaviour, with the pin's drag direction as input. Small, and makes carts and boats feel right. |
| 7 | Public API: what else to expose | M | Needs a short design pass (what would an animated scene want?) before code. Cheap to start with a read-only speed and heading. |
| 8 | Group events | L | Wants the public API first, plus a list of event names and a set of actions. The most open-ended item. |
| 9 | Resize a group, proportionally | L | Every member type scales differently (tiles, drawings, walls, regions, light and sound radius, riders, the body). Easy to get subtly wrong. |
| 10 | Damage levels | L | Wants events as a trigger and a group that can swap its images. Best as a use of events, not its own system. |
| 11 | Smoother movement for lights, walls, sounds, regions and the body | L | Foundry works out sight from their saved positions, so only small stepped writes are possible. Low value for the cost. |
| 12 | Decisions and waiting on others | S | Levels, snapping, a deleted pin, screenshots, and the Blacksmith items. Not ours to start, or a decision rather than work. |

---

Each entry says what and why, the files it touches, and how it will be verified.

**Library: edit and update entries**

Save to Library always adds a new entry; an entry cannot be renamed, replaced or edited, only deleted, or exported and imported again as a new entry. Add rename, and Update from a group on the scene that replaces the entry's parts, with a warning that copies already placed are not changed. Touches `scripts/library.js` and `scripts/group-editor.js`. Verify with a test in `tests/library.test.mjs` that an update replaces the entry and leaves placed groups alone, then by walking it in Foundry.

**Library: description, thumbnail, rename Stamp**

Add a description and a thumbnail to each entry, and rename Stamp to something that says fabricate or build. The thumbnail could be a snapshot of the group taken when it is saved, or an image the GM picks. Touches `scripts/library.js`, `scripts/template.js`, `scripts/group-editor.js` and `documentation/userguides/userguide-library.md`. Verify with tests that old entries without the new fields still list and stamp, then in Foundry.

**Group Editor: layout, and expand or collapse the group**

Clean up the layout, and make the group's own card expand and collapse rather than the list of items in it. Touches `scripts/group-editor.js` and `styles/group-editor.css`. Verify in Foundry at the default width and a narrow one.

**Hide and show a group and its members**

Hide and show a whole group, and individual members. Touches a new module beside `scripts/groups.js`, `scripts/group-editor.js` and `scripts/follower.js` (a hidden member must still follow). Verify with a test for each member type, then in Foundry as GM and as a player.

**Pin context menu actions**

Add actions that apply to the group to the pin's right-click menu: hide or show, lights on or off, and a sound submenu. Touches `scripts/ui.js`. Verify in Foundry.

**Face the direction of travel**

An option to turn the group to face the way it was moved. Touches `scripts/follower.js`, `scripts/anchor.js` and the Behaviour section of `scripts/group-editor.js`. Verify with a test of a drag in each direction, then in Foundry.

**Public API: what else to expose**

Decide what else macros and scenes should be able to use. Example: an animated scene may want to change the sound playing in a group according to how fast the group is moving. Touches `scripts/puppeteer.js` and `documentation/api/api-puppeteer.md`. Verify with a macro that reads the value while a group moves.

**Group events**

Let a group run something when something happens, such as mount then play a sound, or move then run a macro. Needs a list of event names and an action for each (sound, macro, and so on). Touches `scripts/follower.js`, `scripts/groups.js`, `scripts/boarding.js` and the editor. Verify with tests that each event fires once per occurrence, then in Foundry.

**Resize a group, proportionally**

Scale every member about the pin, and the body and riders with it. Touches `scripts/geometry.js`, `scripts/region-shapes.js` and `scripts/groups.js`. Verify with tests that scaling by two then by one half returns every member to where it was, then in Foundry.

**Damage levels**

A group with states, such as a cart whose image becomes a broken cart at a damage threshold. Wants group events first. Verify in Foundry by damaging a body and watching the image change.

**Smoother movement for lights, walls, sounds, regions and the body**

They still jump. Possibly paths and speed as well. Touches `scripts/tween.js`. Verify in Foundry that sight and sound stay correct while a group moves.

**Decisions and waiting on others**

- Levels: should a group follow its pin between levels, or stay put? Tiles, drawings, lights, sounds, walls and notes carry a set of levels and a token has one. Decide, then touch `scripts/follower.js`.
- Snapping: a snapped pin with unsnapped member offsets must be allowed. Decide whether anything needs to change.
- A group whose pin was deleted is flagged in the editor and nothing removes it. Decide on automatic removal; touches `scripts/prune.js`.
- Raise the Blacksmith minimum in `module.json` when the release with area pick and pin rotation ships. Not before.
- Regions in Capture Area once Blacksmith's area pick lists them (requested). Touches `scripts/groups.js`.
- Screenshots for the README and `home.md`, taken in a scratch world so no player or character names appear, saved as WebP under `documentation/assets/`.
- Delete `documentation/plans/plan-puppeteer-groups.md`. It is absorbed and marked complete.
