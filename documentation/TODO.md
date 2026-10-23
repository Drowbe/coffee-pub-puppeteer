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

1. Regions as members are written and simulated, not yet run in Foundry: add a region with Add Selected, then move and turn the group. Capture Area cannot pick Regions until Blacksmith's area pick lists them (requested).
   Phase 1 is working in Foundry: groups, drag and rotate, Centre Pivot, hand edits, names, the bounds overlay
   and the Group Editor. Not yet checked there: the Library (Save, Stamp, Import) and Capture Area, which
   uses Blacksmith's `canvas.pickArea` (in Blacksmith's working tree, not released). A group whose anchor pin was
   deleted is flagged in the editor and can be deleted there; nothing removes it automatically.

**Phase 2: tokens**

2. Token anchors are written and simulated, not yet run in Foundry: a group on a token follows its position and
   heading, with the no-GM warning and catch-up when a GM connects. Check with a real token: drag it along a
   multi-waypoint path, turn it, undo a move (Ctrl+Z), and move it as a player with the GM connected. Still to
   do: the smoothness tween (members land at the start of the token's glide), and the Actor link for prefabs.
3. Token members and passengers: footprint plus explicit boarded toggle, boarding through `gmRequest`, and the
   constraint-bypass check (constraints off versus the displace path). Chat card announcements.

**Phase 3: prefabs**

4. Prefabs on an Actor for vehicles: a template in the actor's prototype-token flags, so dropping the actor onto
   a scene lets the active GM stamp the group around the token. The library, Save to Library, Stamp, Import
   and JSON export for set pieces are built (written and simulated, not yet run in Foundry).

**Phase 4: polish**

5. Menubar tool and secondary bar for capture mode, sounds, toast channel, Scene Config tab.
