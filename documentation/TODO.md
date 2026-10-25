# TODO

**What is open, ranked.** Nothing else belongs here.

| Looking for | It lives in |
|---|---|
| What shipped, and why | `CHANGELOG.md` |
| The design and its open questions | `plans/plan-puppeteer-groups.md` |
| What is broken and not yet fixed | `known-issues.md` |

**When something is finished, log it where it belongs and delete it from here.**

---

**Model: pin is the grip, optional body token (agreed)**

1. Check the body token in Foundry (built and simulated, not yet run there): drag an actor onto a group's body row,
   Use Selected Token, Linked, the Remove cross, and that the body follows a drag, a turn and added or removed
   parts. Also still unseen: whether a truly transparent token draws any shadow or border, whether a tile or light
   under the footprint can still be clicked, and whether a teleport move counts against combat movement.
2. Stamping a library entry that names an actor is built and simulated, not yet run in Foundry: save a group that
   has a body, stamp it twice (one turned), and check each copy has its own body. Also stamp it in a world
   without that actor. (Dropping an actor on the map over a group is reserved for riders.)
3. Convert token-anchored groups on load (pin at the token's centre, token becomes the body), then remove Attach to
   Token, On Selected Token, detach, the token follower and the token-removed question.
4. Riders: tokens as members, moved free inside the group, dismount outside the footprint, boarding through
   `gmRequest`, chat card announcements.
5. Group behaviour options: turns with the pin or on request, facing offset, easing (glide or jump, and how long),
   mountable, riders move free. Easing includes the body token, which jumps today.

**Check in Foundry (built, not yet run there)**

7. Pin Shift + wheel rotation, the tool window and its tabs, delete flows, member select, Library (Save, Stamp,
   Import), Capture Area, and the smooth tween (token glide, pin drag, pin glide). Token-group checks (multi-waypoint
   path, undo, player moves, no-GM warning) only matter until item 4 retires that mode.

**Polish**

8. Menubar tool and secondary bar for capture mode, sounds, toast channel, Scene Config tab, events for other modules.
9. Regions in Capture Area once Blacksmith's area pick lists them (requested).
10. Raise the Blacksmith minimum in `module.json` when the release with area pick and pin rotation ships. Not before.
11. A group whose pin was deleted is flagged in the editor and nothing removes it; decide on automatic removal.
