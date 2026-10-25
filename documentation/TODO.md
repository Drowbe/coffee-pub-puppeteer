# TODO

**What is open, ranked.** Nothing else belongs here.

| Looking for | It lives in |
|---|---|
| What shipped, and why | `CHANGELOG.md` |
| The design and its open questions | `plans/plan-puppeteer-groups.md` |
| What is broken and not yet fixed | `known-issues.md` |

**When something is finished, log it where it belongs and delete it from here.**

---

**Stack rank (proposed)**

Effort is for building and testing under Node, not for checking in Foundry. **S** is about an hour, **M** is a few hours, **L** is a day or more or needs design or something from Blacksmith first. Numbers are the items below.

| Rank | Todo | Effort | Why here |
|---|---|---|---|
| 1 | Check everything in Foundry (1 to 7) | M, yours | Everything below sits on it. The body, riders, behaviour and Move Pivot have only been simulated, and a bug found now is cheaper than one found under a feature. |
| 2 | Commit (11) | S | A large amount is uncommitted. Best done after rank 1, so fixes land in the right commit. |
| 3 | Library: edit and update entries (22) | M | An entry cannot be renamed or replaced today, so every fix means a new entry. The other library items build on it. |
| 4 | Library: description, thumbnail, rename Stamp (21) | M | Description and the rename are S; the thumbnail is the M. Cheap, visible, and makes the library usable. |
| 5 | Editor: clean up layout, expand and collapse the group (20) | M | The editor now carries body, riders, behaviour and members on every card, and it is the main surface. Do before adding more to it. |
| 6 | Hide and show a group and its members (17) | M | High value for set pieces (a bridge that is up or down). Different document types hide differently, so it needs a per-type rule. |
| 7 | Pin context menu actions (19) | M | Mostly wiring once 17 exists, and a sound submenu needs 12. Do hide, show and lights first. |
| 8 | Face the direction of travel (14) | S | One option in Behaviour, with the pin's drag direction as input. Small, and it makes carts and boats feel right. |
| 9 | Public API: what else to expose (12) | M | Needs a short design pass (what would an animated scene want?) before code. Cheap to start with a read-only speed and heading. |
| 10 | Group events, such as mount then play a sound (13) | L | Wants 12 first, plus a list of event names and a set of actions. The most open-ended item. |
| 11 | Resize a group, proportionally (18) | L | Every member type scales differently (tiles, drawings, walls, regions, light radius, sound radius, riders and the body). Easy to get subtly wrong. |
| 12 | Damage levels (16) | L | Wants 13 (a trigger) and a group that can swap its images. Best as a use of events, not its own system. |
| 13 | Smoother movement for lights, walls, sounds, regions, the body (15) | L | Foundry recalculates sight from their saved positions, so only small stepped writes are possible. Low value for the cost. |
| 14 | Wait on Blacksmith (8, 9) and decide on a deleted pin (10) | S | Not ours to start; 10 is a decision, not work. |

---

**Everything on the roadmap is built and simulated under Node. These are the checks that need Foundry.**

1. Move Pivot: turn it on, drag the pin to the prow or hinge, check nothing moves and the mode switches itself off;
   then drag and turn, and check the group goes about the new grip. Riders and the body stay put.
2. Behaviour: Gliding and Jumping, a long glide, riders gliding along, Turns when its pin turns switched off (the pin
   turns, nothing else does) and back on (nothing swings), Riders can move about switched off (a hand move is put
   back), Announce boarding (a card and a soft sound for everyone).
3. Riders: a player dragging their own token onto a group with Tokens board when they move onto it ticked (the GM's
   own drops and the Board Selected button are checked); walking one about inside; walking one off (dismounts,
   toast); Dismount (stays off until it has left and come back); deleting the group.
4. Body token: drag an actor onto the body row, Use Selected Token, Linked, the Remove cross, and that the body
   follows a drag, a turn and added or removed parts. Still unseen: whether a truly transparent token draws any
   shadow or border, whether a tile or light under the footprint can still be clicked, and whether a teleport move
   counts against combat movement.
5. Library: Save, Stamp, Import, Export; a stamp of a group that has a body (one turned), and a stamp in a world
   without that actor.
6. Conversion of token-anchored groups: open a world that has one and confirm it comes up as a pin group where the
   token was, nothing moved, the token left as it was, and one toast.
7. Duplicate a scene that has groups, riders and a body, and move a group on each: both should work and neither
   should disturb the other. Capture Area, the pin menu, the Shift + wheel turn, the Group Editor tabs and delete flows, and the menubar
   buttons (the bounds button should light while the overlay is on).

**Housekeeping and waiting on others**

8. Raise the Blacksmith minimum in `module.json` when the release with area pick and pin rotation ships. Not before.
9. Regions in Capture Area once Blacksmith's area pick lists them (requested).
10. A group whose pin was deleted is flagged in the editor and nothing removes it; decide on automatic removal.
11. Commit. Nothing from this work has been committed.

**Ideas to design and rank (not started)**

12. Public API: decide what else to expose. Example: a scene that animates a group may want to change the sound
    playing in the group according to how fast it is moving.
13. Group events: let a group run something when something happens, such as mount, then play a sound; move, then run
    a macro. Needs a list of event names and an action for each (sound, macro, and so on).
14. Move and rotate in the direction the group was moved: an option to turn the group to face where it is going.
15. Smoother, animated group movement: lights, walls, sounds, regions and the body token still jump. Possibly paths
    and speed.
16. Damage levels: a group with states, such as a cart whose image becomes a broken cart at a damage threshold.
17. Hide and show a whole group, and hide and show individual members.
18. Resize a group, proportionally.
19. Pin context menu: actions that apply to the group, such as hide or show, lights on or off, and a sound submenu.
20. Group Editor: clean up the layout; make the group's own card expand and collapse rather than the items in it.
21. Library: add a description and a thumbnail to each entry, and rename Stamp to something that says fabricate or
    build. The thumbnail could be a snapshot of the group taken when it is saved, or an image the GM picks.
22. Library: edit and update entries. Today Save to Library always adds a new entry; an entry cannot be renamed,
    replaced or edited, only deleted, or exported to JSON and imported again as a new entry. Wanted: rename, edit the
    description and thumbnail, and Update from a group on the scene (replacing the entry's parts, with a warning that
    copies already placed are not changed).
