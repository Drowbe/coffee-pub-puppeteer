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

0. Confirm the manual-edit fix in Foundry: capture a tile and lights, drag the tile to a new spot by hand,
   then move and rotate the group. The tile should keep the spot you gave it relative to the pin. (The earlier
   rotation report was a tile dragged by hand after capture; its saved offset was stale.)
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

4. Prefab stamping: a world-setting library for set pieces and a template on an Actor for vehicles (drop the actor, the GM stamps the group around the token). `exportGroup`, `stampMembers` and JSON export already exist; what is left is the library, the stamp action and the Actor link.

**Phase 4: polish**

5. Menubar tool and secondary bar for capture mode, sounds, toast channel, Scene Config tab.
