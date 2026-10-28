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
- Pin context menu: `pins.registerContextMenuItem` accepts a `submenu` (one level, rows `{ name, icon, description, onClick, gmOnly }`) but `api-pins.md` still says `onClick` is required and does not describe it; document it. Rows in a submenu also have no `visible`, so a module cannot hide one per pin; ask for it (Puppeteer would hide the lights and sounds rows on a group that has none).
- A larger list row title. `.blacksmith-list-row-title` is 0.9em, right for one line, small for a row with a picture, a count line and a description (the Puppeteer Library). Puppeteer sets 1.15em on its Library entries only; a shared variant, such as `blacksmith-list-row-title-lg`, would let it drop that.
- Click-to-place for modules. `canvas.pickArea` has no companion for a point: a module that wants the GM to click the map and have a thing under the pointer until then must write its own crosshair, pointer-follow, Escape and clean-up (Puppeteer's is `scripts/placement.js`; Blacksmith's own journal pin placement is private to `ui-journal-pins.js`). Ask for `canvas.pickPoint({ preview, prompt })`, resolving the scene point or null, with `preview` a PIXI display object or a function returning one that the helper positions at the pointer. When it ships, `pickPlacement` calls it and keeps only what draws the group.

**Decisions and waiting on others**

- Raise the Blacksmith minimum in `module.json` when the release with area pick, pin rotation, tool-themed toggles and badges, and the health readers (`getHealthPercent`, `getHealthSeverity`) ships. Not before.
- Screenshots for the README and `home.md`, taken in a scratch world so no player or character names appear, saved as WebP under `documentation/assets/`.
