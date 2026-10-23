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

1. Test the Group Editor, toolbar tools, pin right-click menu and delete-pruning in Foundry (written, not yet
   run). Then handle a deleted anchor pin (the group record is left behind today).
   Capture Area uses Blacksmith's `canvas.pickArea`, which is in Blacksmith's working tree and not yet
   released, so it is untested too. Add Selected stays as a separate way to build a group from a selection.

**Phase 2: tokens**

2. Token anchors: the token follower (read `_source`, loop guard, no-GM toast)
   and the smoothness tween.
3. Token members and passengers: footprint plus explicit boarded toggle, boarding through `gmRequest`, and the
   constraint-bypass check (constraints off versus the displace path). Chat card announcements.

**Phase 3: prefabs**

4. Prefab stamping from an unplaced Blacksmith pin.

**Phase 4: polish**

5. Menubar tool and secondary bar for capture mode, sounds, toast channel, Scene Config tab.
6. A check in `tools/` that fails on core calls that have a Blacksmith equivalent (`Hooks.on`,
   `game.socket`, `ui.notifications`, `AudioHelper`, `ChatMessage.create`, `Dialog`). Start this in
   phase 1 if the module code is growing without it.
