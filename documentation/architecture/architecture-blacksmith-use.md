# How Puppeteer Uses Blacksmith

**Audience:** contributors changing how Puppeteer starts, listens, windows, posts or plays.

Puppeteer targets Foundry v14 only, and Coffee Pub Blacksmith is a hard dependency. This document says which Blacksmith surfaces Puppeteer uses and why, which it does not, and what was learned about their behaviour. Blacksmith's own documentation is authoritative for the surfaces themselves.

## Ground rules

- **Foundry v14 only.** The first release is 14.0.0 and the module version matches the Foundry generation it supports. `module.json` compatibility is minimum 14, verified 14, maximum 14. Nothing is written to work on v13.
- **Blacksmith is a hard dependency.** Without it Puppeteer does not run, and there is no fallback path: no native `Hooks.on`, no `game.socket`, no `ui.notifications`, no `AudioHelper`, no raw `ChatMessage.create`, no hand-built `Dialog`. If Blacksmith is missing, or its ready stage failed, or any member Puppeteer uses is absent, Puppeteer refuses to start and says why (`scripts/bootstrap.js`), because a half-working group that strands its riders is worse than none. `tools/check-blacksmith-only.mjs` fails on a core call that has a Blacksmith equivalent.
- **Core is used directly only where Blacksmith offers no equivalent:** document reads and writes, settings registration, localisation, and the PIXI display objects of placeables. The one native hook is `ready`, which is how a module reaches Blacksmith's ready signal at all.
- **Plain data, plain updates.** Puppeteer does not hook placeable internals or wrap anything in core, because that coupling is what breaks when Foundry changes movement. The one exception is drawing a moving group between two saved poses, which sets display objects Foundry's own refresh overwrites (`scripts/tween.js`).
- **Blacksmith is used directly, never wrapped.** `scripts/blacksmith.js` only holds the API object once bootstrap has checked it.

## Surfaces used

| Surface | Puppeteer uses it for |
|---|---|
| Bootstrap | In `ready`: wait for Blacksmith's ready status, check every member listed in `REQUIRED`, then `registerModule` and register the console label. Settings are registered only after the check passes, because registration cannot be redone. |
| `HookManager` | Every hook Puppeteer listens to, under one context with a `key` on each registration: `updateScene` (the follower), the per-type update hooks (hand edits, tween holds), the delete hooks that prune members, riders and bodies, `updateToken` and `createToken` (boarding), `refresh<Type>` (holding a drawn pose), `userConnected`, `canvasReady`. The follower is never throttled or debounced, because that drops the intermediate updates it must act on. |
| Windows | `BlacksmithToolWindowBaseV2` for the Group Editor, because it is a palette kept open over the canvas while the GM selects objects and drags pins. It brings the Light, Dark and Glass themes, the compact title bar and a title-bar icon with an on and off state (Show group bounds). The classes are imported from `/modules/coffee-pub-blacksmith/api/blacksmith-api.js`, never read from `module.api` at class-definition time, and the window is registered with `registerWindow` so the toolbar, menubar and macros open it by id. |
| Toolbar | `registerToolbarTool` for the Group Editor, Show group bounds and New Group. GM only. |
| Menubar | One `registerMenubarTool` button, titled Puppeteer, in the middle zone and the `utility` group beside the other Coffee Pub tools. It toggles a secondary bar (`registerSecondaryBarType`, `registerSecondaryBarItem`, `toggleSecondaryBar`, linked to the button with `registerSecondaryBarTool` so the button lights while the bar is open). The bar holds the actions that need no group chosen: Group Editor, New Group, Update All Groups and a Group Bounds switch, kept in step with the editor's and toolbar's switches through `updateSecondaryBarItemActive`. Nothing of Puppeteer sits in the left zone. |
| Canvas | `canvas.pickArea` for Capture Area: the GM drags a box and every supported placeable whose centre is inside becomes a member, across all layers, leaving the selection and active layer alone. Blacksmith added it at Puppeteer's request. Regions are not in its list of pickable types yet. |
| Pins | The grip of every group. `registerPinType` and `registerPinTaxonomy` (`copyable: false`, `rotatable: true`), `pins.create`, `update`, `get`, `delete`, `exists`, `panTo`, `on('dragMove')` for the live follow, `on('doubleClick')` to open the editor, and `registerContextMenuItem` for the pin menu. |
| Dialogs | `dialog.wait` and `dialog.confirm` for the delete choices. |
| Chat cards | `chatCards.post` for the boarded and disembarked announcements, public, when a group asks for them. |
| Toast | `toast.show` on a registered `puppeteer` channel, so a GM can switch Puppeteer's toasts off in Blacksmith's notification settings. |
| Sounds | `utils.playSound` with `BlacksmithConstants`, softly: locally after a stamp or a Capture Area, to everyone for an announced boarding. Never a raw path. |
| Logging and settings | `utils.postConsoleAndNotification` with the module's registered label, and `utils.getSettingSafely` and `setSettingSafely` for the library. |
| Handlebars helpers | Available because Blacksmith is active. |

## Surfaces not used

- **`sockets`.** Nothing needs a cosmetic channel: every client sees the same document updates and draws the movement itself.
- **`gmRequest`.** A player boards by moving onto the group, and the active GM's client sees the committed move, so no request to the GM is needed.
- **`registerSceneConfigTab`.** There is no per-scene setting worth a tab. Behaviour is chosen per group.
- **`tokens.registerInteraction`.** The only gestures it can claim are double-clicks, which Foundry already uses to open a token's sheet.
- **`rolls`, `requestRoll`, `party`, `inventory`, `effects`, `stats`, `worldclock`, `notes`, `tags`.** None has a job in grouped movement.

## What was learned about Blacksmith's behaviour

Read from its code, not run live.

- **Hook Manager.** Callbacks run in priority order from one Foundry handler, and async callbacks are not awaited. A throw is caught and logged per callback, so the others still run. `throttleMs` is leading-edge and per registration, so it drops calls, and `debounceMs` keeps only the last: Puppeteer sets neither. There is no supported active-GM pattern; the check `game.users.activeGM?.isSelf` inside the callback is the intended way.
- **Pin storage.** A pin's `config` is a free-form bag persisted in one scene flag shared by every pin of the scene and every module, and `update()` shallow-merges it, so a nested object under Puppeteer's key is replaced whole. Puppeteer keeps only `config.puppeteer = { groupId }` there.
- **Pin events.** `dragEnd` fires after the save resolves, on the dragging client only. `dragMove` fires continuously on the dragging client only and needs `{ dragEvents: true }`; it can drive a visual preview but must not write documents. `updated` fires on the client that performed the write and is not broadcast, so the follower is driven by Foundry's `updateScene` on the active GM instead.
- **Pin rotation.** An optional `rotation` in degrees clockwise (0 faces down, two decimals), turned with Shift and the mouse wheel over a selected pin, 5 degrees a notch, saved once 400 ms after the last notch. A pin type opts in with `rotatable: true`.
- **Writes.** Only a GM writes pins. Puppeteer writes only from the active GM.
- **Windows.** A redraw replaces the contents of the window, not the element, so listeners are bound to inner markup in `_onRender` and need no guard.
