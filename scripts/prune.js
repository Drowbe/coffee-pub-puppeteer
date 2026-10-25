// When a member's document is deleted, drop it from every group on its scene, so a group never lists
// something that is gone. Only the active GM writes, and writes are queued so deleting a whole selection
// at once does not have each prune overwrite the last.
import { MODULE_ID } from './constants.js';
import { getBlacksmith } from './blacksmith.js';
import { MEMBER_TYPES } from './geometry.js';
import { getGroups, patchGroup } from './store.js';
import { fitBody } from './body.js';

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
