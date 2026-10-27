// When a member's document is deleted, drop it from every group on its scene, so a group never lists
// something that is gone. Only the active GM writes, and writes are queued so deleting a whole selection
// at once does not have each prune overwrite the last.
//
// A group is its pin: when the pin is deleted, the group is deleted with it, parts and all, by the same route as the Delete button.
import { MODULE_ID, TOAST_CHANNEL } from './constants.js';
import { getBlacksmith } from './blacksmith.js';
import { MEMBER_TYPES } from './geometry.js';
import { getGroups, patchGroup } from './store.js';
import { fitBody } from './body.js';
import { anchorExists } from './anchor.js';
import { runExclusive } from './follower.js';
import { deleteGroup } from './groups.js';

let queue = Promise.resolve();

export function registerPruning() {
    const { HookManager } = getBlacksmith();
    for (const type of MEMBER_TYPES) {
        HookManager.registerHook({
            name: `delete${type}`,
            description: `Puppeteer: remove a deleted ${type} from its groups`,
            context: MODULE_ID,
            priority: 3,
            key: `${MODULE_ID}-prune-${type}`,
            callback: (document) => {
                if (!game.users.activeGM?.isSelf) return;
                queue = queue.then(() => prune(document)).catch((error) => {
                    console.error(`${MODULE_ID}: pruning ${type} ${document.id} failed`, error);
                });
            }
        });
    }
    // The pin is the group's grip. Deleting it deletes the group: its record, its body and its parts go, and its riders
    // are let go where they stand. Blacksmith says so for one pin, and for a bulk delete it says which scene.
    HookManager.registerHook({
        name: 'blacksmith.pins.deleted',
        description: 'Puppeteer: a group whose pin was deleted is deleted',
        context: MODULE_ID,
        priority: 3,
        key: `${MODULE_ID}-pin-deleted`,
        callback: ({ pinId, sceneId } = {}) => {
            if (!game.users.activeGM?.isSelf) return;
            const scene = game.scenes.get(sceneId);
            if (scene) queued(() => dropGroups(scene, (group) => group.anchor?.type === 'pin' && group.anchor.id === pinId), 'a deleted pin');
        }
    });
    for (const name of ['blacksmith.pins.deletedAll', 'blacksmith.pins.deletedAllByType']) {
        HookManager.registerHook({
            name,
            description: 'Puppeteer: groups whose pins were deleted in bulk are deleted',
            context: MODULE_ID,
            priority: 3,
            key: `${MODULE_ID}-${name}`,
            callback: ({ sceneId } = {}) => {
                if (!game.users.activeGM?.isSelf) return;
                const scene = game.scenes.get(sceneId);
                if (scene) queued(() => dropGroups(scene, (group) => !anchorExists(scene, group)), 'deleted pins');
            }
        });
    }
    // A body token someone deleted leaves the group as it was, without a body; a rider deleted is no longer aboard.
    HookManager.registerHook({
        name: 'deleteToken',
        description: 'Puppeteer: a group whose body token was deleted has no body',
        context: MODULE_ID,
        priority: 3,
        key: `${MODULE_ID}-prune-body`,
        callback: (token) => {
            if (!game.users.activeGM?.isSelf) return;
            queue = queue.then(() => pruneBody(token)).catch((error) => {
                console.error(`${MODULE_ID}: pruning body ${token.id} failed`, error);
            });
        }
    });
}

const queued = (work, what) => {
    queue = queue.then(work).catch((error) => console.error(`${MODULE_ID}: deleting the groups of ${what} failed`, error));
};

/** Delete every group on the scene that `lost` says has lost its pin, with its parts. */
async function dropGroups(scene, lost) {
    for (const group of Object.values(getGroups(scene)).filter(lost)) {
        await runExclusive(scene, group.id, () => deleteGroup(scene, group.id, { removeMembers: true }));
        getBlacksmith().toast.show({
            title: 'Group deleted',
            subtitle: `${group.name} lost its pin, so the group and its parts were deleted.`,
            icon: 'fa-solid fa-trash',
            channel: TOAST_CHANNEL,
            duration: 6
        });
    }
}

async function pruneBody(token) {
    const scene = token.parent;
    if (!scene) return;
    for (const group of Object.values(getGroups(scene))) {
        if (group.body?.tokenId === token.id) await patchGroup(scene, group.id, { '-=body': null });
        if (group.riders?.some((rider) => rider.tokenId === token.id)) {
            await patchGroup(scene, group.id, { riders: group.riders.filter((rider) => rider.tokenId !== token.id) });
        }
    }
}

async function prune(document) {
    const scene = document.parent;
    if (!scene) return;
    for (const group of Object.values(getGroups(scene))) {
        const members = group.members.filter((m) => !(m.type === document.documentName && m.id === document.id));
        if (members.length === group.members.length) continue;
        await patchGroup(scene, group.id, { members });
        await fitBody(scene, group.id);
    }
}
