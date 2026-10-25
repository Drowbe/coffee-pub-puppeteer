# Coffee Pub Puppeteer

Foundry VTT module (`coffee-pub-puppeteer`) that groups scene elements so they move and turn as one, gripped by a Blacksmith pin. A satellite of the Coffee Pub suite: Coffee Pub Blacksmith is its hub and a hard dependency.

Foundry v14 only (`minimum`, `verified` and `maximum` are all 14). The module version matches the Foundry generation, so the first release is 14.0.0.

**Before starting: confirm the session's working directory is this module's folder.** A session can silently inherit an unrelated project's directory, and then reads and writes the wrong project's memory and scratchpad.

## Read these first

- **The documentation standard** is `coffee-pub-blacksmith/documentation/global/global-documentation-standard.md`. It governs folder layout, naming, the document kinds, the README, the CHANGELOG, TODO, known-issues, plans and testing documents, and says documentation is part of the change, not a chore after it. Read it before writing, moving or deleting a document, and run `node tools/check-docs-structure.mjs` after.
- **`documentation/architecture/`** says how it is built. Read the Groups document before changing the follower, the data or riders; it records what was learned the hard way.
- **The suite's traps** are in `coffee-pub-blacksmith/documentation/global/`: `global-applicationv2-traps.md` for windows and `global-css-traps.md` for stylesheets.

## Rules that hold in this repository

- **Blacksmith is used directly and never wrapped.** No fallback path. No native `Hooks.on` (use `HookManager.registerHook`), `game.socket`, `ui.notifications`, `AudioHelper`, raw `ChatMessage.create` or hand-built `Dialog`. The one native hook is `Hooks.once('ready')`. `node tools/check-blacksmith-only.mjs` enforces it. Read the relevant Blacksmith API document before using a surface.
- **Use Blacksmith's components in windows, and ask for what is missing.** Tabs, list rows, toggle switches and badges are Blacksmith's shared classes (see `coffee-pub-blacksmith/documentation/designsystem/design-components.md`); do not rebuild them. Where one does not exist, write the least that is needed from the `--blacksmith-tool-*` variables and add a request to "Owed to the hub" in `documentation/TODO.md`.
- **No debug system of our own.** Log with `utils.postConsoleAndNotification(MODULE_NAME, message, result, blnDebug, blnNotification)`.
- **The author commits.** Stage reviewable changes and say how to test them; do not commit, push, tag or bump the version. **Never change the Blacksmith minimum in `module.json` unless told to.** Do not add commit or check-in items to the TODO.
- **Foundry writes onto the options it is given.** Build a fresh options object for every update; never share or freeze one.
- **Read a token's `_source`, not its document fields,** inside an update hook, because the document's own `x`, `y` and `rotation` lag while a move animates.
- **No emoji, no em dashes, ASCII quotes** in anything written. Use `--` where a dash is truly wanted.

## Checks

| Command | Guards |
|---|---|
| `node --test tests/*.test.mjs` | The logic, against a stand-in for Foundry (`tests/support/fake-foundry.mjs`). The glob is required. |
| `node tools/check-scripts.mjs` | Every script parses as an ES module and every import resolves. |
| `node tools/check-blacksmith-only.mjs` | No core call that Blacksmith replaces. |
| `node tools/check-docs-structure.mjs` | The documentation standard. |

Nothing runs these but you; the release workflow only zips and releases on a tag. Passing tests under Node are not proof in Foundry: what is unproven is recorded in `testing/`.

## Conventions

- `scripts/` is flat. ES modules, semicolons, 4-space indent, JSDoc on exported members.
- A new stylesheet needs an `@import` in `styles/default.css`, or it is silently unstyled.
- Tooltips use `data-tooltip` and never `title`.
- Edit files with the file tools rather than shell heredocs; quoting in a heredoc has failed repeatedly here.
