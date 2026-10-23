// The pin follower. When a group's anchor pin or heading changes, move its members to match.
//
// It runs from Foundry's updateScene on the active GM only. Blacksmith's own pin events fire on the client
// that performed the write, so a second GM dragging a pin would never reach the active GM that way.
// Every position is computed from committed state (the pin as stored, the heading as stored), never from
// a position that is still being dragged.
import { MODULE_ID, MODULE_NAME, BLACKSMITH_ID } from './constants.js';
import { getBlacksmith } from './bootstrap.js';
import { MEMBER_TYPES, captureMember, memberUpdate, sameAnchor } from './geometry.js';
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
            for (const groupId of Object.keys(getGroups(scene))) syncGroup(scene, groupId);
        }
    });

    // A member the GM moves, turns or resizes by hand is the GM redefining where it sits in the group.
    // Without this the record keeps the old offset and the next move snaps the member back to it.
    for (const type of MEMBER_TYPES) {
        HookManager.registerHook({
            name: `update${type}`,
            description: `Puppeteer: re-record a ${type} the GM edited by hand`,
            context: MODULE_ID,
            priority: 3,
            key: `${MODULE_ID}-recapture-${type}`,
            callback: (document, changes, options) => {
                if (!game.users.activeGM?.isSelf) return;
                if (options?.puppeteer?.follower) return;
                if (!EDIT_FIELDS[type].some((field) => field in changes)) return;
                const scene = document.parent;
                if (!scene) return;
                for (const group of Object.values(getGroups(scene))) {
                    if (group.members.some((m) => m.type === type && m.id === document.id)) {
                        enqueue(scene, group.id, () => recapture(scene, group.id, type, document.id));
                    }
                }
            }
        });
    }
}

// The fields of each type that change where a member sits relative to the anchor.
const EDIT_FIELDS = {
    Tile: ['x', 'y', 'width', 'height', 'rotation'],
    Drawing: ['x', 'y', 'shape', 'rotation'],
    AmbientLight: ['x', 'y', 'rotation'],
    AmbientSound: ['x', 'y'],
    Wall: ['c'],
    Note: ['x', 'y']
};

/** Run `task` after everything already queued for this group, and before anything queued later. */
export function runExclusive(scene, groupId, task) {
    return enqueue(scene, groupId, task);
}

function enqueue(scene, groupId, task) {
    const key = `${scene.id}:${groupId}`;
    const next = (chains.get(key) ?? Promise.resolve())
        .then(task)
        .catch((error) => {
            console.error(`${MODULE_ID}: updating group ${groupId} failed`, error);
        });
    chains.set(key, next);
    next.finally(() => { if (chains.get(key) === next) chains.delete(key); });
    return next;
}

/** Bring a group's members to where its anchor says they belong, and resolve when that is done. */
export function syncGroup(scene, groupId) {
    return enqueue(scene, groupId, () => apply(scene, groupId));
}

// Re-record one member's offset against the anchor state the group's members currently occupy.
async function recapture(scene, groupId, type, id) {
    const { utils } = getBlacksmith();
    const group = getGroup(scene, groupId);
    const doc = scene.getEmbeddedCollection(type).get(id);
    if (!group || !doc) return;
    const index = group.members.findIndex((m) => m.type === type && m.id === id);
    if (index === -1) return;

    // A member sitting where the record puts it, for the anchor as applied or as the pin now stands, was
    // put there by the follower and is not an edit. This holds even if the follower's own marker on its
    // writes were ever lost on the way to this hook, so a follower write can never be re-recorded.
    const current = group.members[index];
    const pin = group.anchor.type === 'pin' ? getBlacksmith().pins.get(group.anchor.id, { sceneId: scene.id }) : null;
    const atApplied = !differs(memberUpdate(current, doc._source, { ...group.applied }), doc._source);
    const atPin = !!pin && !differs(memberUpdate(current, doc._source, { x: pin.x, y: pin.y, heading: group.heading }), doc._source);
    if (atApplied || atPin) return;

    const member = captureMember(type, id, doc._source, { ...group.applied });
    const members = group.members.map((m, i) => (i === index ? member : m));
    await patchGroup(scene, groupId, { members });
    utils.postConsoleAndNotification(MODULE_NAME, `Group "${group.name}": re-recorded ${type} ${id} after a manual edit`, member, true, false);
}

// Whether a document's saved pose differs from the pose an update asked for (a pixel, half a degree).
function differs(wanted, actual) {
    const off = (a, b) => !(Math.abs(a - b) <= 1);
    const turned = (a, b) => {
        const d = Math.abs((((a - b) % 360) + 360) % 360);
        return Math.min(d, 360 - d) > 0.5;
    };
    return ('x' in wanted && off(actual.x, wanted.x))
        || ('y' in wanted && off(actual.y, wanted.y))
        || ('rotation' in wanted && turned(actual.rotation, wanted.rotation))
        || (!!wanted.c && wanted.c.some((value, i) => off(actual.c[i], value)));
}

// Something else (another module, a hook, a constraint) can change a member after we write it. Say so,
// rather than leaving a group that quietly drifts apart.
function warnIfNotTaken(scene, type, batch) {
    for (const wanted of batch) {
        const actual = scene.getEmbeddedCollection(type).get(wanted._id)?._source;
        if (!actual) continue;
        if (differs(wanted, actual)) {
            console.warn(`${MODULE_ID}: ${type} ${wanted._id} did not take the position Puppeteer wrote`, {
                requested: wanted,
                actual: { x: actual.x, y: actual.y, rotation: actual.rotation, c: actual.c }
            });
        }
    }
}

/** Move a group's members to its anchor now. Only call from inside `runExclusive`. */
export async function apply(scene, groupId) {
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
    utils.postConsoleAndNotification(MODULE_NAME, `Group "${group.name}" writing members`, { anchor, updates: Object.fromEntries(updates) }, true, false);
    for (const [type, batch] of updates) {
        await scene.updateEmbeddedDocuments(type, batch, { puppeteer: { follower: true } });
        warnIfNotTaken(scene, type, batch);
    }

    const patch = { applied: anchor };
    if (keep.length !== group.members.length) patch.members = keep;
    await patchGroup(scene, groupId, patch);
    utils.postConsoleAndNotification(MODULE_NAME, `Group "${group.name}" moved ${keep.length} member(s)`, anchor, true, false);
}
