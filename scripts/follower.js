// The follower. When a group's anchor moves or turns, move its members to match.
//
// A pin-anchored group is followed from Foundry's updateScene, because Blacksmith's own pin events fire on
// the client that performed the write, so a second GM dragging a pin would never reach the active GM that
// way. A token-anchored group is followed from updateToken. Either way only the active GM writes, and every
// position is computed from committed state (the anchor as stored, via anchor.js), never from a position
// that is still being dragged or animated.
import { MODULE_ID, MODULE_NAME, BLACKSMITH_ID } from './constants.js';
import { getBlacksmith } from './blacksmith.js';
import { MEMBER_TYPES, recaptureMember, memberUpdate, memberOutOfStep, sameAnchor, poseDiffers as differs } from './geometry.js';
import { getGroup, getGroups, patchGroup } from './store.js';
import { anchorState } from './anchor.js';
import { glideOptions } from './tween.js';

// One chain per group, so a move and the rotation that follows it a moment later never write concurrently.
// Hook Manager callbacks are started back to back and not awaited.
const chains = new Map();

// What counts as a token moving: Foundry's own movement fields, and its rotation (its heading).
const TOKEN_FIELDS = [
    ...(globalThis.TokenDocument?.MOVEMENT_FIELDS ?? ['x', 'y', 'elevation', 'width', 'height', 'depth', 'shape', 'level']),
    'rotation'
];

// The mover is told once in a while, not on every step of a long drag.
let lastNoGmWarning = 0;
const NO_GM_COOLDOWN_MS = 15000;

function warnNoGm(userId) {
    if (userId !== game.user?.id) return;
    const now = Date.now();
    if (now - lastNoGmWarning < NO_GM_COOLDOWN_MS) return;
    lastNoGmWarning = now;
    getBlacksmith().toast.show({
        title: 'No GM is connected',
        subtitle: 'The parts of this vehicle will not follow it until a GM is online.',
        icon: 'fa-solid fa-triangle-exclamation',
        duration: 8
    });
}

export function registerFollower() {
    const { HookManager } = getBlacksmith();

    // A token-anchored group follows its token. The flag on the token only says which group to look at; the
    // group's own record must name this token as its anchor, so a copied token does not drive the original's parts.
    HookManager.registerHook({
        name: 'updateToken',
        description: 'Puppeteer: move group members when their anchor token moves or turns',
        context: MODULE_ID,
        priority: 3,
        key: `${MODULE_ID}-token-follower`,
        callback: (token, changes, options, userId) => {
            if (!TOKEN_FIELDS.some((field) => field in changes)) return;
            const groupId = token.getFlag(MODULE_ID, 'groupId');
            if (!groupId) return;
            if (!game.users.activeGM) { warnNoGm(userId); return; }
            if (!game.users.activeGM.isSelf) return;
            if (options?.puppeteer?.follower) return;
            const scene = token.parent;
            const group = scene && getGroup(scene, groupId);
            if (!group || group.anchor.type !== 'token' || group.anchor.id !== token.id) return;
            syncGroup(scene, groupId);
        }
    });

    // A GM coming online finds vehicles that moved while nobody could write their parts.
    HookManager.registerHook({
        name: 'userConnected',
        description: 'Puppeteer: bring groups up to date when a GM comes online',
        context: MODULE_ID,
        priority: 4,
        key: `${MODULE_ID}-gm-online`,
        callback: (user, connected) => {
            if (connected && user.isGM && game.users.activeGM?.isSelf) syncAllGroups();
        }
    });

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
    Note: ['x', 'y'],
    Region: ['shapes']
};

/**
 * Run `task` after everything already queued for this group, and before anything queued later. The caller
 * gets the task's result, or its error: it asked, so it is the one to say what went wrong.
 */
export function runExclusive(scene, groupId, task) {
    return enqueue(scene, groupId, task, true);
}

// One failing task must not stop the ones behind it, so the chain always continues. Work nobody is waiting
// on (a hook reacting to a change) reports its own failure to the GM; work someone awaits hands the error back.
function enqueue(scene, groupId, task, handBackErrors = false) {
    const key = `${scene.id}:${groupId}`;
    const result = (chains.get(key) ?? Promise.resolve()).then(task);
    const link = result.catch((error) => {
        if (handBackErrors) return;
        console.error(`${MODULE_ID}: updating group ${groupId} failed`, error);
        getBlacksmith().utils.postConsoleAndNotification(MODULE_NAME, `A group could not be updated: ${error.message}`, null, false, true);
    });
    chains.set(key, link);
    link.finally(() => { if (chains.get(key) === link) chains.delete(key); });
    return handBackErrors ? result : link;
}

/** Bring a group's members to where its anchor says they belong, and resolve when that is done. */
export function syncGroup(scene, groupId) {
    return enqueue(scene, groupId, () => apply(scene, groupId));
}

/** Bring every group on every scene up to date. Only the active GM writes. */
export function syncAllGroups() {
    if (!game.users.activeGM?.isSelf) return Promise.resolve();
    const jobs = [];
    for (const scene of game.scenes) {
        for (const groupId of Object.keys(getGroups(scene))) jobs.push(syncGroup(scene, groupId));
    }
    return Promise.all(jobs);
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
    const state = anchorState(scene, group);
    const atApplied = !differs(memberUpdate(current, doc._source, { ...group.applied }), doc._source);
    const atAnchor = !!state && !differs(memberUpdate(current, doc._source, state), doc._source);
    if (atApplied || atAnchor) return;

    const member = recaptureMember(current, doc._source, { ...group.applied });
    const members = group.members.map((m, i) => (i === index ? member : m));
    await patchGroup(scene, groupId, { members });
    utils.postConsoleAndNotification(MODULE_NAME, `Group "${group.name}": re-recorded ${type} ${id} after a manual edit`, member, true, false);
}

// Something else (another module's hook, a constraint) can change or refuse a member's move after we ask for
// it. Count and log those, so the caller can say so instead of leaving a group that quietly drifts apart.
function countNotTaken(scene, type, batch) {
    let count = 0;
    for (const wanted of batch) {
        const actual = scene.getEmbeddedCollection(type).get(wanted._id)?._source;
        if (!actual || !differs(wanted, actual)) continue;
        count += 1;
        console.warn(`${MODULE_ID}: ${type} ${wanted._id} did not take the position Puppeteer wrote`, {
            requested: wanted,
            actual: { x: actual.x, y: actual.y, rotation: actual.rotation, c: actual.c, shapes: actual.shapes }
        });
    }
    return count;
}

/** Move a group's members to its anchor now. Only call from inside `runExclusive`. */
export async function apply(scene, groupId) {
    const { utils } = getBlacksmith();
    const group = getGroup(scene, groupId);
    if (!group) return;

    const anchor = anchorState(scene, group);
    if (!anchor) return;
    if (sameAnchor(group.applied, anchor)) return;

    // A region whose shapes were changed by hand since it was recorded (a cutout adds or reshapes shapes) is
    // recorded again where it stands, before anything is carried, so old geometry is never mixed with new.
    let rerecorded = false;
    const recorded = group.members.map((member) => {
        const doc = scene.getEmbeddedCollection(member.type).get(member.id);
        if (!doc || !memberOutOfStep(member, doc._source)) return member;
        rerecorded = true;
        return recaptureMember(member, doc._source, { ...group.applied });
    });

    // Build one update per document type; a member whose document is gone is dropped from the record.
    const updates = new Map();
    const keep = [];
    for (const member of recorded) {
        const doc = scene.getEmbeddedCollection(member.type).get(member.id);
        if (!doc) continue;
        keep.push(member);
        if (!updates.has(member.type)) updates.set(member.type, []);
        updates.get(member.type).push({ _id: member.id, ...memberUpdate(member, doc._source, anchor) });
    }
    utils.postConsoleAndNotification(MODULE_NAME, `Group "${group.name}" writing members`, { anchor, updates: Object.fromEntries(updates) }, true, false);
    // Where the group was, so every client can ease from there to where it is now (pin groups only; a token
    // already animates itself). It is read before the record is changed below.
    const glide = glideOptions(group);
    let refused = 0;
    for (const [type, batch] of updates) {
        await scene.updateEmbeddedDocuments(type, batch, { puppeteer: { follower: true, ...(glide ? { glide } : {}) } });
        refused += countNotTaken(scene, type, batch);
    }
    if (refused) {
        utils.postConsoleAndNotification(MODULE_NAME, `${refused} member(s) of "${group.name}" did not move where the group asked. Something else, such as another module, is changing them; see the console.`, null, false, true);
    }

    const patch = { applied: anchor };
    // The record shows which way the group faces, which is where its pin or token faces.
    patch.heading = anchor.heading;
    if (rerecorded || keep.length !== group.members.length) patch.members = keep;
    await patchGroup(scene, groupId, patch);
    utils.postConsoleAndNotification(MODULE_NAME, `Group "${group.name}" moved ${keep.length} member(s)`, anchor, true, false);
}
