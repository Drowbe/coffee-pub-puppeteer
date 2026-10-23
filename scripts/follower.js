// The pin follower. When a group's anchor pin or heading changes, move its members to match.
//
// It runs from Foundry's updateScene on the active GM only. Blacksmith's own pin events fire on the client
// that performed the write, so a second GM dragging a pin would never reach the active GM that way.
// Every position is computed from committed state (the pin as stored, the heading as stored), never from
// a position that is still being dragged.
import { MODULE_ID, MODULE_NAME, BLACKSMITH_ID } from './constants.js';
import { getBlacksmith } from './bootstrap.js';
import { memberUpdate, sameAnchor } from './geometry.js';
import { getGroup, getGroups, patchGroup } from './store.js';

// One chain per group, so a move and the rotation that follows it a moment later never write concurrently.
// Hook Manager callbacks are started back to back and not awaited.
const chains = new Map();

export function registerFollower() {
    const { HookManager } = getBlacksmith();
    HookManager.registerHook({
        name: 'updateScene',
        description: 'Puppeteer: move group members when their anchor pin or heading changes',
        context: MODULE_ID,
        priority: 3,
        key: `${MODULE_ID}-pin-follower`,
        callback: (scene, changes) => {
            if (!game.users.activeGM?.isSelf) return;
            const touched = foundry.utils.hasProperty(changes, `flags.${BLACKSMITH_ID}.pins`)
                || foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.groups`);
            if (!touched) return;
            for (const groupId of Object.keys(getGroups(scene))) schedule(scene, groupId);
        }
    });
}

function schedule(scene, groupId) {
    const key = `${scene.id}:${groupId}`;
    const next = (chains.get(key) ?? Promise.resolve())
        .then(() => apply(scene, groupId))
        .catch((error) => {
            console.error(`${MODULE_ID}: following group ${groupId} failed`, error);
        });
    chains.set(key, next);
    next.finally(() => { if (chains.get(key) === next) chains.delete(key); });
}

async function apply(scene, groupId) {
    const { pins, utils } = getBlacksmith();
    const group = getGroup(scene, groupId);
    if (!group || group.anchor.type !== 'pin') return;

    const pin = pins.get(group.anchor.id, { sceneId: scene.id });
    if (!pin) return;

    const anchor = { x: pin.x, y: pin.y, heading: group.heading };
    if (sameAnchor(group.applied, anchor)) return;

    // Build one update per document type; a member whose document is gone is dropped from the record.
    const updates = new Map();
    const keep = [];
    for (const member of group.members) {
        const doc = scene.getEmbeddedCollection(member.type).get(member.id);
        if (!doc) continue;
        keep.push(member);
        if (!updates.has(member.type)) updates.set(member.type, []);
        updates.get(member.type).push({ _id: member.id, ...memberUpdate(member, doc._source, anchor) });
    }
    for (const [type, batch] of updates) {
        await scene.updateEmbeddedDocuments(type, batch, { puppeteer: { follower: true } });
    }

    const patch = { applied: anchor };
    if (keep.length !== group.members.length) patch.members = keep;
    await patchGroup(scene, groupId, patch);
    utils.postConsoleAndNotification(MODULE_NAME, `Group "${group.name}" moved ${keep.length} member(s)`, anchor, true, false);
}
