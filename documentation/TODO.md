# TODO

**What is open, ranked.** Nothing else belongs here.

| Looking for | It lives in |
|---|---|
| What shipped, and why | `CHANGELOG.md` |
| The design and its open questions | `plans/plan-puppeteer-groups.md` |
| What is broken and not yet fixed | `known-issues.md` |

**When something is finished, log it where it belongs and delete it from here.**

---

**Phase 1: a vehicle that drags its parts (token-anchored, no passengers)**

1. Bootstrap: wait for Blacksmith, check every member Puppeteer uses, register the module, and refuse to
   initialise loudly if one is missing. Register settings only after that check.
2. Group data model (member ids, not UUIDs) and the follower hook, with the loop guard, the
   `preCreateToken` flag strip, and the no-GM toast.
3. Capture by rectangle, add selected and remove member, through the toolbar and a Group Editor window.

**Phase 2: set pieces and reuse**

4. Prefab stamping from an unplaced Blacksmith pin.
5. Pin-anchored groups for GM set pieces, with a stored heading.

**Phase 3: passengers**

6. Passenger carry: footprint plus explicit boarded toggle, boarding through `gmRequest`, and the
   constraint-bypass check (constraints off versus the displace path).
7. Chat card announcements for boarding and disembarking.

**Phase 4: polish**

8. Menubar tool and secondary bar for capture mode, sounds, toast channel, Scene Config tab.
9. A check in `tools/` that fails on core calls that have a Blacksmith equivalent (`Hooks.on`,
    `game.socket`, `ui.notifications`, `AudioHelper`, `ChatMessage.create`, `Dialog`). Start this in
    phase 1 if the module code is growing without it.
