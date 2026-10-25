// Blacksmith is a hard dependency. Nothing in Puppeteer runs unless this succeeds, and there is no
// fallback path: a half-working vehicle that strands its parts is worse than no vehicle.
import { BlacksmithAPI } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';
import { MODULE_ID, MODULE_NAME, BLACKSMITH_ID } from './constants.js';
import { setBlacksmith } from './blacksmith.js';

// Every member of the Blacksmith API that Puppeteer uses, as a path from `module.api`. The toolbar, window,
// menubar and scene-config members start as null placeholders, so a non-null test is the right one.
// Keep this list in step with the "Blacksmith surface" table in the plan.
const REQUIRED = [
    'registerModule',
    'HookManager',
    'utils.postConsoleAndNotification',
    'utils.registerLogStyle',
    'utils.getSettingSafely',
    'utils.setSettingSafely',
    'utils.playSound',
    'gmRequest',
    'dialog',
    'canvas.pickArea',
    'toast',
    'toast.registerChannel',
    'chatCards',
    'chatCards.post',
    'pins',
    'uiContextMenu',
    'registerWindow',
    'openWindow',
    'registerToolbarTool',
    'registerMenubarTool',
    'registerSecondaryBarType',
    'registerSecondaryBarItem',
    'registerSecondaryBarTool',
    'toggleSecondaryBar',
    'updateSecondaryBarItemActive',
    'registerSceneConfigTab'
];

// Console hue for our log label, 0-360. Blacksmith derives the rest of the colours from it.
const LOG_HUE = 25;


/**
 * Wait for Blacksmith, check that everything Puppeteer uses is present, register the module.
 * @returns {Promise<object|null>} The Blacksmith API, or null when Puppeteer must not start.
 */
export async function bootstrap() {
    const api = game.modules.get(BLACKSMITH_ID)?.api;

    // `waitForReady` only ever resolves, even when Blacksmith's ready stage threw, so the status is what
    // says whether anything we need exists.
    const { status, failedStage } = await BlacksmithAPI.waitForReadyStatus();
    if (status !== 'ok') return refuse(api, `Blacksmith did not finish starting (stage: ${failedStage})`);

    const missing = REQUIRED.filter((path) => foundry.utils.getProperty(api, path) == null);
    if (missing.length) return refuse(api, `Blacksmith is missing ${missing.join(', ')}`);

    // The socket API is assigned asynchronously after module.api, so it has its own wait.
    try {
        const sockets = await BlacksmithAPI.getSockets();
        await sockets.waitForReady();
    } catch (error) {
        return refuse(api, `Blacksmith sockets are not ready (${error.message})`);
    }

    // The label colours must be registered before the first log line.
    api.utils.registerLogStyle(MODULE_NAME, LOG_HUE);
    api.registerModule(MODULE_ID, { name: MODULE_NAME, version: game.modules.get(MODULE_ID).version });
    setBlacksmith(api);
    api.utils.postConsoleAndNotification(MODULE_NAME, `Module initialized (Blacksmith ${game.modules.get(BLACKSMITH_ID).version}, API ${api.version})`, null, false, false);
    return api;
}

// Say why we stopped. Registration of anything unretryable (settings) happens only after bootstrap
// succeeds, so stopping here leaves nothing half-registered. Errors go to console.error, as the Blacksmith
// logging guide says; the logger adds the notification.
function refuse(api, reason) {
    const message = `${MODULE_ID} will not start: ${reason}.`;
    console.error(message);
    api?.utils?.postConsoleAndNotification?.(MODULE_NAME, message, null, false, true);
    return null;
}
