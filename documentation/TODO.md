# TODO

**What is open, ranked.** Nothing else belongs here.

| Looking for | It lives in |
|---|---|
| What shipped, and why | `CHANGELOG.md` |
| The design and its open questions | `plans/plan-puppeteer-groups.md` |
| What is broken and not yet fixed | `known-issues.md` |

**When something is finished, log it where it belongs and delete it from here.**

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
7. Capture Area, the pin menu, the Shift + wheel turn, the Group Editor tabs and delete flows, and the menubar
   buttons (the bounds button should light while the overlay is on).

**Housekeeping and waiting on others**

8. Raise the Blacksmith minimum in `module.json` when the release with area pick and pin rotation ships. Not before.
9. Regions in Capture Area once Blacksmith's area pick lists them (requested).
10. A group whose pin was deleted is flagged in the editor and nothing removes it; decide on automatic removal.
11. Delete `probe/` (the probe's uploaded image) and `tools/probes/` once the body token has been seen working.
12. Commit. Nothing from this work has been committed.
