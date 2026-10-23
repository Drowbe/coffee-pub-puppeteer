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

1. Capture by rectangle, add selected and remove member, through the toolbar and a Group Editor window, with
   a rotate action (numeric heading and steps). Prune members through the delete hooks, and handle a deleted
   anchor pin. Today these are only reachable from the console API.

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
