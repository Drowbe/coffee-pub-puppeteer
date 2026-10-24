# TODO

**What is open, ranked.** Nothing else belongs here.

| Looking for | It lives in |
|---|---|
| What shipped, and why | `CHANGELOG.md` |
| The design and its open questions | `plans/plan-puppeteer-groups.md` |
| What is broken and not yet fixed | `known-issues.md` |

**When something is finished, log it where it belongs and delete it from here.**

---

**Phase 1: pin-anchored groups of scene elements (no tokens)**

1. Regions as members work in Foundry. Capture Area cannot pick Regions until Blacksmith's area pick lists them (requested); use Add Selected.
   Phase 1 is working in Foundry: groups, drag and rotate, Centre Pivot, hand edits, names, the bounds overlay
   and the Group Editor. Not yet checked there: the Library (Save, Stamp, Import) and Capture Area, which
   uses Blacksmith's `canvas.pickArea` (in Blacksmith's working tree, not released). A group whose anchor pin was
   deleted is flagged in the editor and can be deleted there; nothing removes it automatically.

**Pin rotation is in, and needs a real canvas.** Blacksmith's pin rotation is built in its working tree (not run
on a canvas, not released) and Puppeteer reads a pin group's heading from it. Check: select a group's pin and
Shift + wheel over the board; the whole group should turn about the pin, 5 degrees a notch, and the editor's
heading field should follow. Puppeteer then needs a Blacksmith version that has it, so the Blacksmith minimum in
`module.json` has to be raised when that is released.

**Phase 2: tokens**

2. Token anchors work in Foundry for a GM moving and turning the token, including attach and detach. Still to check:
   a multi-waypoint path, undo (Ctrl+Z), a player moving the token with the GM connected, and the no-GM warning.
   The smoothness tween is written and simulated: tiles, drawings and notes should glide with the token, follow
   a pin as it is dragged, and ease when a pin moves or turns; lights, walls, sounds and regions still jump at the
   start of the move. Still to do: the Actor link for prefabs.
3. Token members and passengers: footprint plus explicit boarded toggle, boarding through `gmRequest`, and the
   constraint-bypass check (constraints off versus the displace path). Chat card announcements.

**Phase 3: prefabs**

4. Prefabs on an Actor for vehicles: a template in the actor's prototype-token flags, so dropping the actor onto
   a scene lets the active GM stamp the group around the token. The library, Save to Library, Stamp, Import
   and JSON export for set pieces are built (written and simulated, not yet run in Foundry).

**Phase 4: polish**

5. Menubar tool and secondary bar for capture mode, sounds, toast channel, Scene Config tab.
