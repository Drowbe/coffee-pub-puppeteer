// Entry point. The one native hook: it is how a module reaches Blacksmith's ready signal at all.
// Everything else registers through Blacksmith once bootstrap has succeeded.
// See documentation/plans/plan-puppeteer-groups.md.
import { MODULE_ID } from './constants.js';
import { bootstrap } from './bootstrap.js';
import { registerPinType, createGroup, createTokenGroup, attachToToken, detachToPin, captureArea, recenterPivot, exportGroup, renameMember, diagnoseGroup, addSelected, addMembers, removeMember, setHeading, rotateBy, deleteGroup, listGroups, setBody, adoptBody, clearBody, setBodyLinked } from './groups.js';
import { registerFollower } from './follower.js';
import { registerPruning } from './prune.js';
import { registerUi } from './ui.js';
import { registerOverlay, toggleBounds, setBoundsShown } from './overlay.js';
import { migrateGroups } from './migrate.js';
import { registerTokenRemoval } from './token-removed.js';
import { registerTween } from './tween.js';
import { syncAllGroups } from './follower.js';
import { registerLibrarySetting, listTemplates, saveGroupToLibrary, stampTemplate, deleteTemplate, importTemplate } from './library.js';

Hooks.once('ready', async () => {
    const blacksmith = await bootstrap();
    if (!blacksmith) return;

    registerLibrarySetting();
    registerPinType();

    // Older groups are brought up to date before anything listens for changes. Otherwise a scene update that lands
    // first would read a group's pin by the new rules while its record still follows the old ones, and swing the
    // group, before the migration had handed its heading to the pin.
    try {
        await migrateGroups();
        // Anything that moved while no GM could write its parts catches up now.
        await syncAllGroups();
    } catch (error) {
        console.error(`${MODULE_ID}: updating older groups failed`, error);
        blacksmith.utils.postConsoleAndNotification('PUPPETEER', `Could not update an older group: ${error.message}`, null, false, true);
    }

    registerFollower();
    registerPruning();
    registerUi();
    registerOverlay();
    registerTokenRemoval();
    registerTween();

    // The scripting surface, for macros and for the toolbar and Group Editor, which call the same functions.
    // Every function takes the scene first so a macro can address any scene; `scene()` is the one in view.
    game.modules.get(MODULE_ID).api = {
        scene: () => canvas.scene,
        /** Make a group that follows a token, by token document. */
        createTokenGroup: (token, options = {}) => createTokenGroup(options.scene ?? token.parent, token, { name: options.name }),
        /** Hang an existing group from a token, or give it back a pin. Nothing in the scene moves. */
        attachToToken: (groupId, token, scene = token.parent) => attachToToken(scene, groupId, token),
        detachToPin: (groupId, scene = canvas.scene) => detachToPin(scene, groupId),
        /** Create a group on a new pin at `point`, or at the centre of the view. */
        createGroup: (options = {}) => createGroup(
            options.scene ?? canvas.scene,
            options.point ?? { x: canvas.stage.pivot.x, y: canvas.stage.pivot.y },
            { name: options.name }
        ),
        captureArea: (groupId, options = {}, scene = canvas.scene) => captureArea(scene, groupId, options),
        recenterPivot: (groupId, scene = canvas.scene) => recenterPivot(scene, groupId),
        exportGroup: (groupId, scene = canvas.scene) => exportGroup(scene, groupId),
        renameMember: (groupId, type, id, label, scene = canvas.scene) => renameMember(scene, groupId, type, id, label),
        diagnose: (groupId, scene = canvas.scene) => diagnoseGroup(scene, groupId),
        library: {
            list: () => listTemplates(),
            save: (groupId, scene = canvas.scene) => saveGroupToLibrary(scene, groupId),
            stamp: (templateId, options = {}) => stampTemplate(
                options.scene ?? canvas.scene,
                templateId,
                options.point ?? { x: canvas.stage.pivot.x, y: canvas.stage.pivot.y },
                { heading: options.heading, name: options.name }
            ),
            remove: (templateId) => deleteTemplate(templateId),
            import: (jsonText) => importTemplate(jsonText)
        },
        showBounds: (value) => (value === undefined ? toggleBounds() : setBoundsShown(value)),
        /** Make the group targetable: a transparent, locked token of this actor that covers it and moves with it. */
        setBody: (groupId, actorId, options = {}) => setBody(options.scene ?? canvas.scene, groupId, actorId, { linked: options.linked }),
        /** Use a token already on the scene as the group's body. */
        adoptBody: (groupId, token, scene = token.parent) => adoptBody(scene, groupId, token),
        clearBody: (groupId, scene = canvas.scene) => clearBody(scene, groupId),
        setBodyLinked: (groupId, linked, scene = canvas.scene) => setBodyLinked(scene, groupId, linked),
        addSelected: (groupId, scene = canvas.scene) => addSelected(scene, groupId),
        addMembers: (groupId, documents, scene = canvas.scene) => addMembers(scene, groupId, documents),
        removeMember: (groupId, type, id, scene = canvas.scene) => removeMember(scene, groupId, type, id),
        setHeading: (groupId, degrees, scene = canvas.scene) => setHeading(scene, groupId, degrees),
        rotateBy: (groupId, degrees, scene = canvas.scene) => rotateBy(scene, groupId, degrees),
        deleteGroup: (groupId, scene = canvas.scene) => deleteGroup(scene, groupId),
        listGroups: (scene = canvas.scene) => listGroups(scene)
    };
});
