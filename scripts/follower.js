// The follower. When a group's anchor moves or turns, move its members to match.
//
// A group is followed from Foundry's updateScene, because Blacksmith's own pin events fire on the client that
// performed the write, so a second GM dragging a pin would never reach the active GM that way. Only the active
// GM writes, and every position is computed from committed state (the pin as stored, via anchor.js), never from
// a position that is still being dragged.
import { MODULE_ID, MODULE_NAME, BLACKSMITH_ID } from './constants.js';
import { getBlacksmith } from './blacksmith.js';
import { MEMBER_TYPES, recaptureMember, memberUpdate, memberOutOfStep, sameAnchor, snapToGrid, poseDiffers as differs } from './geometry.js';
import { getGroup, getGroups, patchGroup } from './store.js';
import { anchorState, travelHeading } from './anchor.js';
import { glideOptions } from './tween.js';
import { fitBody } from './body.js';
import { carryRiders, captureRider } from './riders.js';
import { fireEvent } from './events.js';
import { normAngle } from './frame.js';

// One chain per group, so a move and the rotation that follows it a moment later never write concurrently.
// Hook Manager callbacks are started back to back and not awaited.
const chains = new Map();

export function registerFollower() {
    const { HookManager } = getBlacksmith();

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
    await fitBody(scene, groupId);
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

/**
 * Record every member and rider again against a pin that has moved, leaving all of them where they are. The same
 * thing Centre Pivot does, for wherever the pin was put.
 */
export async function repivot(scene, group, anchor) {
    const { utils } = getBlacksmith();
    const members = group.members.map((member) => {
        const doc = scene.getEmbeddedCollection(member.type).get(member.id);
        return doc ? recaptureMember(member, doc._source, anchor) : member;
    });
    const riders = (group.riders ?? []).map((rider) => {
        const token = scene.tokens.get(rider.tokenId);
        return token ? captureRider(scene, rider.tokenId, token._source, anchor) : rider;
    });
    // The mode stays on until it is switched off, so the pin can be moved and then turned (a turn is many writes) without
    // the first of them handing the group back to the pin.
    const patch = { members, applied: anchor, heading: anchor.heading };
    if (group.riders) patch.riders = riders;
    // The picture has not moved, so if the pin's heading has, the front of the picture is the same way round from it.
    const turned = anchor.heading - (group.applied?.heading ?? anchor.heading);
    if (Math.abs(normAngle(turned)) > 0.005 && (group.front || group.facesTravel)) {
        const front = Math.round(normAngle((Number(group.front) || 0) - turned) * 100) / 100;
        if (front) patch.front = front;
        else patch['-=front'] = null;
    }
    await patchGroup(scene, group.id, patch);
    utils.postConsoleAndNotification(MODULE_NAME, `Group "${group.name}": pivot moved to ${Math.round(anchor.x)}, ${Math.round(anchor.y)}; ${members.length} member(s) re-recorded, none moved`, anchor, true, false);
}

/** Move a group's members to its anchor now. Only call from inside `runExclusive`. */
export async function apply(scene, groupId) {
    const { utils } = getBlacksmith();
    const group = getGroup(scene, groupId);
    if (!group) return;

    let anchor = anchorState(scene, group);
    if (!anchor) return;
    if (sameAnchor(group.applied, anchor)) return;

    // Move Pivot is on: the pin was moved to be the grip somewhere else, not to take the group with it. Nothing is
    // written to the scene; every part is recorded again against where the pin now is.
    if (group.movePivot) {
        await repivot(scene, group, anchor);
        return;
    }

    // A group that snaps goes to the grid point nearest where its pin was dropped, and the pin goes there too, so what
    // the pin shows and where the group is stay the same.
    const pinPatch = {};
    if (group.snap) {
        const at = snapToGrid(scene, anchor);
        if (Math.abs(at.x - anchor.x) > 0.5 || Math.abs(at.y - anchor.y) > 0.5) {
            pinPatch.x = at.x;
            pinPatch.y = at.y;
            anchor = { ...anchor, x: at.x, y: at.y };
        }
        // The pin was dropped back on the grid point the group already holds: only the pin needs to move.
        if (sameAnchor(group.applied, anchor)) {
            if (pinPatch.x !== undefined && group.anchor.type === 'pin') await getBlacksmith().pins.update(group.anchor.id, pinPatch, { sceneId: scene.id });
            return;
        }
    }

    // A group that faces its travel turns to the way it was moved. The pin is turned to match once the group is there,
    // so what the pin shows and what the group does stay the same.
    const facing = travelHeading(group, group.applied, anchor, scene.grid.sizeX ?? scene.grid.size);
    if (facing !== null) anchor = { ...anchor, heading: facing };

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
    const glide = glideOptions(group, anchor);
    let refused = 0;
    for (const [type, batch] of updates) {
        await scene.updateEmbeddedDocuments(type, batch, { puppeteer: { follower: true, ...(glide ? { glide } : {}) } });
        refused += countNotTaken(scene, type, batch);
    }
    if (refused) {
        utils.postConsoleAndNotification(MODULE_NAME, `${refused} member(s) of "${group.name}" did not move where the group asked. Something else, such as another module, is changing them; see the console.`, null, false, true);
    }

    // Tokens the group carries go where it went. One that is gone from the scene is left out of the record.
    const carried = await carryRiders(scene, group, anchor, glide);

    const patch = { applied: anchor };
    if (carried.riders.length !== (group.riders ?? []).length) patch.riders = carried.riders;
    // The record shows which way the group faces, which is where its pin or token faces.
    patch.heading = anchor.heading;
    if (rerecorded || keep.length !== group.members.length) patch.members = keep;
    await patchGroup(scene, groupId, patch);
    // The body covers the members, so it goes where they went.
    await fitBody(scene, groupId);
    if (facing !== null) pinPatch.rotation = facing;
    if (Object.keys(pinPatch).length && group.anchor.type === 'pin') await getBlacksmith().pins.update(group.anchor.id, pinPatch, { sceneId: scene.id });
    utils.postConsoleAndNotification(MODULE_NAME, `Group "${group.name}" moved ${keep.length} member(s)`, anchor, true, false);
    await fireEvent(scene, group, 'move', { from: group.applied, to: anchor });
}
