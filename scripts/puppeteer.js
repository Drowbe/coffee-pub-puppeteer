// Entry point. The one native hook: it is how a module reaches Blacksmith's ready signal at all.
// Everything else registers through Blacksmith once bootstrap has succeeded.
// See documentation/plans/plan-puppeteer-groups.md.
import { MODULE_ID } from './constants.js';
import { bootstrap } from './bootstrap.js';
import { registerPinType, createGroup, addSelected, addMembers, removeMember, setHeading, rotateBy, deleteGroup, listGroups } from './groups.js';
import { registerFollower } from './follower.js';

Hooks.once('ready', async () => {
    const blacksmith = await bootstrap();
    if (!blacksmith) return;

    registerPinType();
    registerFollower();

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
        addSelected: (groupId, scene = canvas.scene) => addSelected(scene, groupId),
        addMembers: (groupId, documents, scene = canvas.scene) => addMembers(scene, groupId, documents),
        removeMember: (groupId, type, id, scene = canvas.scene) => removeMember(scene, groupId, type, id),
        setHeading: (groupId, degrees, scene = canvas.scene) => setHeading(scene, groupId, degrees),
        rotateBy: (groupId, degrees, scene = canvas.scene) => rotateBy(scene, groupId, degrees),
        deleteGroup: (groupId, scene = canvas.scene) => deleteGroup(scene, groupId),
        listGroups: (scene = canvas.scene) => listGroups(scene)
    };
});
