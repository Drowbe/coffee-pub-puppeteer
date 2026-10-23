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

0. Confirm the tile fix in Foundry (rotation and Centre Pivot were reported not working). The cause found: Puppeteer
   read a v14 tile's `x, y` as its top-left corner, but it is the texture anchor point (the centre by default), so
   tiles were half their size out. Tile maths, group records (migrated on load) and templates (now version 2) are
   corrected and covered by tests that run the follower against a simulated scene. Check: with Show group bounds
   on, every cyan outline should sit on its object; Centre Pivot should put the pin in the middle of the cart;
   rotating 90 and back should leave everything where it was. If not, `api.diagnose(groupId)` says where each
   member is.
1. The Group Editor, toolbar tools, pin menu, delete-pruning and Capture Area are in and mostly checked in
   Foundry. Still to do: automatically drop a group whose anchor pin was deleted (the editor flags it and
   Delete now works, but nothing removes it for you).
   Capture Area uses Blacksmith's `canvas.pickArea`, which is in Blacksmith's working tree and not yet
   released, so it is untested too. Add Selected stays as a separate way to build a group from a selection.

**Phase 2: tokens**

2. Token anchors: the token follower (read `_source`, loop guard, no-GM toast)
   and the smoothness tween.
3. Token members and passengers: footprint plus explicit boarded toggle, boarding through `gmRequest`, and the
   constraint-bypass check (constraints off versus the displace path). Chat card announcements.

**Phase 3: prefabs**

4. Prefabs on an Actor for vehicles: a template in the actor's prototype-token flags, so dropping the actor onto
   a scene lets the active GM stamp the group around the token. The library, Save to Library, Stamp, Import
   and JSON export for set pieces are built (written and simulated, not yet run in Foundry).

**Phase 4: polish**

5. Menubar tool and secondary bar for capture mode, sounds, toast channel, Scene Config tab.
