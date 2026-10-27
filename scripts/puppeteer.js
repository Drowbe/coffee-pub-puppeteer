// Entry point. The one native hook: it is how a module reaches Blacksmith's ready signal at all.
// Everything else registers through Blacksmith once bootstrap has succeeded.
// See documentation/plans/plan-puppeteer-groups.md.
import { MODULE_ID, TOAST_CHANNEL } from './constants.js';
import { bootstrap } from './bootstrap.js';
import { groupState } from './state.js';
import { registerPinType, createGroup, captureArea, recenterPivot, exportGroup, renameMember, diagnoseGroup, addSelected, addMembers, removeMember, setHeading, rotateBy, deleteGroup, listGroups, setBody, adoptBody, clearBody, setBodyLinked, mountTokens, dismountToken, setMountable, setMovePivot, setBehaviour, setGroupHidden, setMemberHidden, setEmittersOn, replacePin, addEvent, removeEvent, scaleGroup } from './groups.js';
import { registerFollower } from './follower.js';
import { registerPruning } from './prune.js';
import { registerUi } from './ui.js';
import { registerOverlay, toggleBounds, setBoundsShown } from './overlay.js';
import { migrateGroups } from './migrate.js';
import { registerTween } from './tween.js';
import { registerBoarding } from './boarding.js';
import { registerHealth } from './health.js';
import { syncAllGroups } from './follower.js';
import { registerLibrarySetting, listTemplates, saveGroupToLibrary, stampTemplate, deleteTemplate, importTemplate, renameTemplate, setTemplateDescription, updateTemplateFromGroup, duplicateGroup } from './library.js';

Hooks.once('ready', async () => {
    const blacksmith = await bootstrap();
    if (!blacksmith) return;

    registerLibrarySetting();
    // Every Puppeteer toast goes out on one channel, so a GM can switch them off in Blacksmith's notification settings.
    blacksmith.toast.registerChannel(TOAST_CHANNEL, {
        moduleId: MODULE_ID,
        label: 'Puppeteer',
        description: 'Groups created, members added, boarding and dismounting'
    });
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
    await registerUi();
    registerOverlay();
    registerTween();
    registerBoarding();
    registerHealth();

    // The scripting surface, for macros and for the toolbar and Group Editor, which call the same functions.
    // Every function takes the scene first so a macro can address any scene; `scene()` is the one in view.
    game.modules.get(MODULE_ID).api = {
        scene: () => canvas.scene,
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
            rename: (templateId, name) => renameTemplate(templateId, name),
            describe: (templateId, text) => setTemplateDescription(templateId, text),
            updateFromGroup: (templateId, groupId, scene = canvas.scene) => updateTemplateFromGroup(scene, groupId, templateId),
            import: (jsonText) => importTemplate(jsonText)
        },
        showBounds: (value) => (value === undefined ? toggleBounds() : setBoundsShown(value)),
        /** Make the group targetable: a transparent, locked token of this actor that covers it and moves with it. */
        setBody: (groupId, actorId, options = {}) => setBody(options.scene ?? canvas.scene, groupId, actorId, { linked: options.linked }),
        /** Use a token already on the scene as the group's body. */
        adoptBody: (groupId, token, scene = token.parent) => adoptBody(scene, groupId, token),
        clearBody: (groupId, scene = canvas.scene) => clearBody(scene, groupId),
        setBodyLinked: (groupId, linked, scene = canvas.scene) => setBodyLinked(scene, groupId, linked),
        /**
         * How a group behaves: `{ ease: { mode: 'ease' | 'jump', ms }, rotates: boolean, facesTravel: boolean, ridersFree: boolean, solidOnly: boolean }`. Any of
         * them may be left out. See the API document.
         */
        setBehaviour: (groupId, options, scene = canvas.scene) => setBehaviour(scene, groupId, options),
        /** While on, dragging or turning the group's pin moves only the grip; nothing else moves. Off, the pin takes the group. */
        setMovePivot: (groupId, on, scene = canvas.scene) => setMovePivot(scene, groupId, on),
        /** Copy a group on its scene: new parts and pin two squares to the right, the same heading, behaviour and, if it has one, body. */
        duplicate: (groupId, options = {}, scene = canvas.scene) => duplicateGroup(scene, groupId, { name: options.name }),
        /** Give a group whose pin was deleted a new one where it last was, facing as it faced. Nothing moves. */
        replacePin: (groupId, scene = canvas.scene) => replacePin(scene, groupId),
        /** Hide or show a whole group: tiles, drawings, lights, sounds, regions and body. Walls and notes cannot be hidden. */
        setHidden: (groupId, hidden, scene = canvas.scene) => setGroupHidden(scene, groupId, hidden),
        setMemberHidden: (groupId, type, id, hidden, scene = canvas.scene) => setMemberHidden(scene, groupId, type, id, hidden),
        /** Resize a group about its pin by a factor between 0.1 and 10: parts, riders' places and the token's fit. */
        scale: (groupId, factor, scene = canvas.scene) => scaleGroup(scene, groupId, factor),
        /** Switch a group's lights (`'AmbientLight'`) or sounds (`'AmbientSound'`) on or off together; `on` left out flips them. */
        setEmittersOn: (groupId, type, on, scene = canvas.scene) => setEmittersOn(scene, groupId, type, on),
        /** Put tokens (documents) aboard a group. They must be on it. Returns how many boarded and why others did not. */
        mount: (groupId, tokens, scene = canvas.scene) => mountTokens(scene, groupId, tokens),
        dismount: (groupId, tokenId, scene = canvas.scene) => dismountToken(scene, groupId, tokenId),
        /** Whether tokens created (dropped) on the group board it. */
        setMountable: (groupId, mountable, scene = canvas.scene) => setMountable(scene, groupId, mountable),
        addSelected: (groupId, scene = canvas.scene) => addSelected(scene, groupId),
        addMembers: (groupId, documents, scene = canvas.scene) => addMembers(scene, groupId, documents),
        removeMember: (groupId, type, id, scene = canvas.scene) => removeMember(scene, groupId, type, id),
        setHeading: (groupId, degrees, scene = canvas.scene) => setHeading(scene, groupId, degrees),
        rotateBy: (groupId, degrees, scene = canvas.scene) => rotateBy(scene, groupId, degrees),
        deleteGroup: (groupId, scene = canvas.scene) => deleteGroup(scene, groupId),
        listGroups: (scene = canvas.scene) => listGroups(scene),
        /**
         * What a group is doing now: `{ x, y, heading, moving, speed, progress, hidden, members, riders, hasToken }`, or null.
         * `speed` is squares a second while it moves and 0 when still. Read it each frame or on an interval; there is no event.
         */
        getState: (groupId, scene = canvas.scene) => groupState(scene, groupId),
        /**
         * Do something when something happens to a group: `{ on: 'board' | 'leave' | 'move' | 'hide' | 'show' | 'health', do: 'sound' | 'macro' | 'image', value }`,
         * where value is a sound path, a macro's id or a picture path. A `health` rule also takes `at` (`'healthy'`, `'injured'`, `'bloodied'`,
         * `'critical'` or `'dead'`), and an `image` rule takes `target`, the id of one of the group's tiles. Returns the stored rule; see `removeEvent`.
         */
        addEvent: (groupId, rule, scene = canvas.scene) => addEvent(scene, groupId, rule),
        removeEvent: (groupId, eventId, scene = canvas.scene) => removeEvent(scene, groupId, eventId)
    };
});
