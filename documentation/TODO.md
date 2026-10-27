# TODO

**What is open, ranked.** Nothing else belongs here.

| Looking for | It lives in |
|---|---|
| What shipped, and why | `CHANGELOG.md` |
| What is built and not yet proven in a running world | `testing/testing-foundry-verification.md` |
| How it works | `documentation/architecture/` |
| What is broken and not yet fixed | `known-issues.md` |

**When something is finished, log it where it belongs and delete it from here.**

---

**Stack rank (proposed)**

Effort is for building and testing under Node, not for checking in Foundry. **S** is about an hour, **M** is a few hours, **L** is a day or more or needs design or something from Blacksmith first.

| Rank | Todo | Effort | Why here |
|---|---|---|---|
| 1 | Decisions and waiting on others | S | Screenshots and the Blacksmith items. Not ours to start. |

---

Each entry says what and why, the files it touches, and how it will be verified.

**Owed to the hub**

Requests for Blacksmith, to hand to the hub's own TODO. Each empties once the hub has taken it.

- Blacksmith's shared tool-window controls are complete in its working tree (not committed or released, not yet seen in a window by the author), all `blacksmith-tool-*`. The Group Editor has adopted all of them it has a use for: button and button group, segmented control, toggle, section, card with the title field and notice slot, editable label, underline tabs with count, and the drop zone. Chips have no use here. Once the author has looked at the editor on Light, Dark and Glass, each finding goes to the Blacksmith session as control, theme and what was seen. Blacksmith also re-themed `blacksmith-tag`, `blacksmith-panel-card`, `blacksmith-window-section` and `blacksmith-icon-action` inside tool windows; Puppeteer uses none of them.

**Decisions and waiting on others**

- Raise the Blacksmith minimum in `module.json` when the release with area pick, pin rotation, tool-themed toggles and badges, and the health readers (`getHealthPercent`, `getHealthSeverity`) ships. Not before.
- Screenshots for the README and `home.md`, taken in a scratch world so no player or character names appear, saved as WebP under `documentation/assets/`.
- Delete `documentation/plans/plan-puppeteer-groups.md`. It is absorbed and marked complete.
