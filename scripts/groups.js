// Operations on groups: create, add and remove members, rotate, delete. The toolbar, the Group Editor and
// macros all call these, so there is one place that knows how a group is changed.
import { MODULE_ID, MODULE_NAME } from './constants.js';
import { getBlacksmith } from './blacksmith.js';
import {
    MEMBER_TYPES, UnsupportedMemberError, captureMember, recaptureMember, memberExtent, memberUpdate, scaleMember, poseOffset, extentCentre, groupBounds, sameAnchor, normAngle
} from './geometry.js';
import { getGroup, getGroups, saveGroup, patchGroup, deleteGroupRecord } from './store.js';
import { syncGroup, runExclusive, apply, repivot } from './follower.js';
import { anchorState, anchorExists, headingOf } from './anchor.js';
import { EASE_LIMITS, TRAVEL_SPEED_LIMITS, DEFAULT_TRAVEL_SPEED } from './tween.js';
import { announceBoarding, playCue } from './announce.js';
import { fireEvent, normaliseEvent, MAX_EVENTS } from './events.js';
import { buildTemplate } from './template.js';
import { bodyFootprint, bodyTraits, bodyToken, fitBody, bodyMove } from './body.js';
import { RIDER_FLAG, STAYED_FLAG, captureRider, insideGroup, tokenCentre, riderUpdate, riderMove } from './riders.js';

export const PIN_TYPE = 'group';
const PIN_ICON = 'fa-solid fa-up-down-left-right';

/** Tell Blacksmith what a Puppeteer pin is, so its menus and filters can name it. Call once, in ready. */
export function registerPinType() {
    const { pins } = getBlacksmith();
    pins.registerPinType(MODULE_ID, PIN_TYPE, 'Puppeteer Group');
    pins.registerPinTaxonomy(MODULE_ID, {
        pinCategories: {
            // Not copyable: a copied pin would point at the same group record.
            // Rotatable: Shift + mouse wheel over a selected pin turns the whole group.
            [PIN_TYPE]: { label: 'Puppeteer Group', tags: ['group'], copyable: false, rotatable: true }
        }
    });
}

/** The anchor state the members currently correspond to. New members are captured in this frame. */
function appliedAnchor(group) {
    return { ...group.applied };
}

function requireGroup(scene, groupId) {
    const group = getGroup(scene, groupId);
    if (!group) throw new Error(`${MODULE_ID}: no group ${groupId} on scene ${scene.name}`);
    return group;
}

function createPin(scene, groupId, name, x, y, rotation = 0) {
    return getBlacksmith().pins.create({
        id: crypto.randomUUID(),
        moduleId: MODULE_ID,
        type: PIN_TYPE,
        tags: ['group'],
        text: name,
        image: PIN_ICON,
        x,
        y,
        rotation,
        config: { puppeteer: { groupId } }
    }, { sceneId: scene.id });
}

/**
 * Make a group anchored on a new pin.
 * @param {Scene} scene
 * @param {{x: number, y: number}} point  Where the pin goes, in scene pixels.
 * @param {{name?: string}} [options]
 * @returns {Promise<object>} The group record.
 */
export async function createGroup(scene, point, { name = 'Group', heading = 0 } = {}) {
    const { utils } = getBlacksmith();
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    const id = foundry.utils.randomID();
    const pin = await createPin(scene, id, name, x, y, normAngle(heading));
    // Blacksmith keeps two decimals, so the heading is what it stored, not what was asked for.
    const stored = pin.rotation ?? normAngle(heading);

    const group = {
        id,
        name,
        anchor: { type: 'pin', id: pin.id },
        version: 4,
        heading: stored,
        members: [],
        applied: { x, y, heading: stored }
    };
    await saveGroup(scene, group);
    utils.postConsoleAndNotification(MODULE_NAME, `Created group "${name}"`, { groupId: id, pinId: pin.id }, true, false);
    return group;
}

/**
 * Take a group off its token and give it a pin at the token's centre, facing the way the token faces. Nothing
 * in the scene moves. The token is left as it is, without its flag. Used only to convert groups saved when a
 * token could be the grip (see migrate.js); the grip is always a pin now.
 * @returns {Promise<object>} The updated group record.
 */
export function detachToPin(scene, groupId) {
    const { utils } = getBlacksmith();
    if (requireGroup(scene, groupId).anchor.type !== 'token') {
        return Promise.reject(new Error(`${MODULE_ID}: that group is not on a token`));
    }
    return runExclusive(scene, groupId, async () => {
        await apply(scene, groupId);
        const group = requireGroup(scene, groupId);
        const state = anchorState(scene, group) ?? { ...group.applied };
        const tokenId = group.anchor.id;     // the store updates the record in place, so read this before patching
        // The pin first, so the heading the members are recorded against is the one Blacksmith stored for it.
        const pin = await createPin(scene, groupId, group.name, Math.round(state.x), Math.round(state.y), normAngle(state.heading));
        const anchor = { x: Math.round(state.x), y: Math.round(state.y), heading: pin.rotation ?? normAngle(state.heading) };
        const members = group.members
            .map((member) => [member, scene.getEmbeddedCollection(member.type).get(member.id)])
            .filter(([, doc]) => doc)
            .map(([member, doc]) => recaptureMember(member, doc._source, anchor));

        await patchGroup(scene, groupId, { anchor: { type: 'pin', id: pin.id }, members, applied: anchor, heading: anchor.heading });
        const token = scene.tokens.get(tokenId);
        if (token?.getFlag(MODULE_ID, 'groupId') === groupId) await token.unsetFlag(MODULE_ID, 'groupId');
        utils.postConsoleAndNotification(MODULE_NAME, `Group "${group.name}" now hangs from a pin`, anchor, true, false);
        return getGroup(scene, groupId);
    });
}

/**
 * Give a group a new pin when its own has been deleted. The pin goes where the group last was, facing the way it faced, so
 * nothing in the scene moves and the members' offsets still hold.
 * @returns {Promise<object>} The updated group record.
 */
export async function replacePin(scene, groupId) {
    const { utils } = getBlacksmith();
    if (anchorExists(scene, requireGroup(scene, groupId))) {
        throw new Error(`${MODULE_ID}: that group still has its pin`);
    }
    return runExclusive(scene, groupId, async () => {
        const group = requireGroup(scene, groupId);
        const { x, y, heading } = group.applied;
        const pin = await createPin(scene, groupId, group.name, Math.round(x), Math.round(y), normAngle(heading));
        // Blacksmith keeps two decimals, so record the heading it stored.
        const applied = { x: Math.round(x), y: Math.round(y), heading: pin.rotation ?? normAngle(heading) };
        await patchGroup(scene, groupId, { anchor: { type: 'pin', id: pin.id }, applied, heading: applied.heading });
        utils.postConsoleAndNotification(MODULE_NAME, `Group "${group.name}" has a new pin`, applied, true, false);
        return getGroup(scene, groupId);
    });
}

/**
 * Add documents to a group, capturing their offsets in the frame the group's members already occupy.
 * Documents that are not a supported type, or are already members, are skipped.
 * @returns {Promise<{added: number, skipped: number}>}
 */
export async function addMembers(scene, groupId, documents) {
    const { utils } = getBlacksmith();
    // Offsets are measured against the anchor the members currently sit at. Let the follower finish first,
    // so that is the pin's real position and not one a drag has just left behind.
    await syncGroup(scene, groupId);
    const group = requireGroup(scene, groupId);
    const have = new Set(group.members.map((m) => `${m.type}:${m.id}`));
    const anchor = appliedAnchor(group);

    const added = [];
    const unsupported = [];
    for (const doc of documents) {
        const type = doc.documentName;
        if (!MEMBER_TYPES.includes(type) || have.has(`${type}:${doc.id}`)) continue;
        try {
            added.push(captureMember(type, doc.id, doc._source, anchor));
        } catch (error) {
            if (!(error instanceof UnsupportedMemberError)) throw error;
            unsupported.push(`${type} "${doc.name ?? doc.id}" has ${error.message}`);
        }
    }
    const skipped = documents.length - added.length;
    if (added.length) {
        await patchGroup(scene, groupId, { members: [...group.members, ...added] });
        await fitBody(scene, groupId);
        // A part added to a hidden group is hidden with it.
        if (group.hidden) {
            const byType = new Map();
            for (const member of added) {
                const doc = HIDEABLE.includes(member.type) ? scene.getEmbeddedCollection(member.type).get(member.id) : null;
                if (!doc || doc._source.hidden) continue;
                if (!byType.has(member.type)) byType.set(member.type, []);
                byType.get(member.type).push({ _id: member.id, hidden: true });
            }
            await writeHidden(scene, byType);
        }
    }
    utils.postConsoleAndNotification(MODULE_NAME, `Group "${group.name}": added ${added.length}, skipped ${skipped}`, { anchor, added, unsupported }, true, false);
    return { added: added.length, skipped, unsupported };
}

/**
 * Let the GM drag a box and add everything of a supported type inside it, across every layer in one pick.
 * @returns {Promise<{added: number, skipped: number}|null>} null when the pick was cancelled.
 */
export async function captureArea(scene, groupId, { containment = 'centre' } = {}) {
    requireGroup(scene, groupId);
    // Ask only for the types Blacksmith's area pick knows; it refuses a name it does not.
    const known = getBlacksmith().canvas.pickTypes ?? MEMBER_TYPES;
    const picked = await getBlacksmith().canvas.pickArea({
        types: MEMBER_TYPES.filter((type) => known.includes(type)),
        containment,
        levels: 'current',
        prompt: 'Drag a box around everything that belongs to the group. Esc to cancel.'
    });
    if (!picked) return null;
    const result = await addMembers(scene, groupId, picked.documents);
    if (result.added) playCue();
    return result;
}

/** Add whatever is selected, on any layer of the canvas that can hold a member. */
export function addSelected(scene, groupId) {
    const layers = [canvas.tiles, canvas.drawings, canvas.lighting, canvas.sounds, canvas.walls, canvas.notes, canvas.regions];
    const documents = layers.flatMap((layer) => layer?.controlled ?? []).map((placeable) => placeable.document);
    return addMembers(scene, groupId, documents);
}

/** Remove whatever is selected, on any layer, from the group. Returns how many members went. */
export async function removeSelected(scene, groupId) {
    const group = requireGroup(scene, groupId);
    const layers = [canvas.tiles, canvas.drawings, canvas.lighting, canvas.sounds, canvas.walls, canvas.notes, canvas.regions];
    const picked = new Set(layers.flatMap((layer) => layer?.controlled ?? [])
        .map((placeable) => `${placeable.document.documentName}:${placeable.document.id}`));
    const members = group.members.filter((m) => !picked.has(`${m.type}:${m.id}`));
    if (members.length !== group.members.length) {
        await patchGroup(scene, groupId, { members });
        await fitBody(scene, groupId);
    }
    return group.members.length - members.length;
}

// Whether the middle of a placeable is inside the part of the scene on screen, with a margin.
function onScreen(placeable) {
    const bounds = placeable.bounds;
    if (!bounds) return true;
    const scale = canvas.stage.scale.x || 1;
    const halfWidth = canvas.app.screen.width / scale / 2;
    const halfHeight = canvas.app.screen.height / scale / 2;
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    return Math.abs(cx - canvas.stage.pivot.x) < halfWidth * 0.9 && Math.abs(cy - canvas.stage.pivot.y) < halfHeight * 0.9;
}

/**
 * Select one member on the canvas: switch to its layer and select it, adding to the selection when asked, and bring
 * it into view if it is off screen.
 * @returns {boolean} false when the object is not on the canvas.
 */
export function selectMember(scene, type, id, { add = false, pan = true } = {}) {
    const placeable = scene.getEmbeddedCollection(type).get(id)?.object;
    if (!placeable) return false;
    canvas.getLayerByEmbeddedName(type)?.activate();
    placeable.control({ releaseOthers: !add });
    if (pan && !onScreen(placeable)) {
        const bounds = placeable.bounds;
        canvas.animatePan({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, duration: 300 });
    }
    return true;
}

/**
 * Select a token on the canvas (a rider, say), adding to the selection when asked, and bring it into view if it is off
 * screen.
 * @returns {boolean} false when the token is not on the canvas.
 */
export function selectToken(scene, tokenId, { add = false, pan = true } = {}) {
    const placeable = scene.tokens.get(tokenId)?.object;
    if (!placeable) return false;
    canvas.tokens?.activate();
    placeable.control({ releaseOthers: !add });
    if (pan && !onScreen(placeable)) {
        const bounds = placeable.bounds;
        canvas.animatePan({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, duration: 300 });
    }
    return true;
}

/**
 * Select the group's members of one type, and switch to that type's layer. Foundry selects one layer at a
 * time, so a group spanning tiles, lights and walls cannot be selected whole. With no `type`, the layer
 * in use is preferred, then the first type the group has.
 * @returns {{type: string|null, selected: number, counts: Object<string, number>}}
 */
export function selectMembers(scene, groupId, type = null) {
    const group = requireGroup(scene, groupId);
    const present = group.members.filter((m) => scene.getEmbeddedCollection(m.type).get(m.id));
    const counts = {};
    for (const member of present) counts[member.type] = (counts[member.type] ?? 0) + 1;

    const active = canvas.activeLayer?.constructor?.documentName;
    const chosen = type ?? (counts[active] ? active : Object.keys(counts)[0] ?? null);
    if (!chosen) return { type: null, selected: 0, counts };

    canvas.getLayerByEmbeddedName(chosen)?.activate();
    let selected = 0;
    for (const member of present.filter((m) => m.type === chosen)) {
        const placeable = scene.getEmbeddedCollection(member.type).get(member.id)?.object;
        if (!placeable) continue;
        placeable.control({ releaseOthers: selected === 0 });
        selected += 1;
    }
    return { type: chosen, selected, counts };
}

export async function renameGroup(scene, groupId, name) {
    const { pins } = getBlacksmith();
    const group = requireGroup(scene, groupId);
    const trimmed = String(name).trim() || group.name;
    await patchGroup(scene, groupId, { name: trimmed });
    if (group.anchor.type === 'pin') await pins.update(group.anchor.id, { text: trimmed }, { sceneId: scene.id });
}

/** Name a member, so the member list can say what it is ("Left lantern") and not only what kind it is. */
export async function renameMember(scene, groupId, type, id, label) {
    const group = requireGroup(scene, groupId);
    const text = String(label ?? '').trim();
    const members = group.members.map((m) => {
        if (m.type !== type || m.id !== id) return m;
        const { label: old, ...rest } = m;
        return text ? { ...rest, label: text } : rest;
    });
    await patchGroup(scene, groupId, { members });
}

/**
 * Everything needed to see why a group is where it is: the pin, the anchor the members were last placed
 * for, where each member should be against where it is, and the group's own bounds. Logged and returned.
 */
export function diagnoseGroup(scene, groupId) {
    const { utils } = getBlacksmith();
    const group = requireGroup(scene, groupId);
    const live = anchorState(scene, group);
    const anchor = live ?? { ...group.applied };

    const points = [];
    const members = group.members.map((member) => {
        const doc = scene.getEmbeddedCollection(member.type).get(member.id);
        if (!doc) return { type: member.type, id: member.id, label: member.label, state: 'missing' };
        points.push(...memberExtent(member.type, doc._source));
        const expected = memberUpdate(member, doc._source, anchor);
        const actual = { x: doc._source.x, y: doc._source.y, rotation: doc._source.rotation, c: doc._source.c, shapes: doc._source.shapes };
        const off = poseOffset(member.type, expected, actual);
        // Where Foundry is drawing it, against where its saved data says it is. They should agree.
        const shown = doc.object?.bounds;
        const shownBounds = shown ? { x: Math.round(shown.x), y: Math.round(shown.y), width: Math.round(shown.width), height: Math.round(shown.height) } : null;
        const prepared = { x: doc.x, y: doc.y };
        return {
            type: member.type, id: member.id, label: member.label,
            state: off <= 1 ? 'in place' : 'OUT OF PLACE', offBy: Math.round(off),
            expected, actual, prepared, shownBounds
        };
    });

    const bounds = points.length ? groupBounds(points, anchor) : null;
    const report = {
        name: group.name,
        heading: group.heading,
        anchorType: group.anchor.type,
        anchor: live && { x: live.x, y: live.y, heading: live.heading },
        applied: group.applied,
        anchorMatchesApplied: live ? sameAnchor(group.applied, anchor) : null,
        bounds: bounds && { width: Math.round(bounds.width), height: Math.round(bounds.height), centre: { x: Math.round(bounds.centre.x), y: Math.round(bounds.centre.y) } },
        pivotToBoundsCentre: bounds ? Math.round(Math.hypot(bounds.centre.x - anchor.x, bounds.centre.y - anchor.y)) : null,
        members
    };
    utils.postConsoleAndNotification(MODULE_NAME, `Diagnosis of group "${group.name}"`, report, false, false);
    return report;
}

export async function removeMember(scene, groupId, type, id) {
    const group = requireGroup(scene, groupId);
    const members = group.members.filter((m) => !(m.type === type && m.id === id));
    if (members.length !== group.members.length) {
        await patchGroup(scene, groupId, { members });
        await fitBody(scene, groupId);
    }
    return group.members.length - members.length;
}

// ---- the body token ----------------------------------------------------------------------------------

/**
 * Make a group targetable: give it a token of `actorId`, transparent, locked, sized to cover the group and moved
 * with it. The token is unlinked unless `linked`, so a prefab stamped twice has two sets of hit points.
 * @returns {Promise<TokenDocument>} The body token.
 */
export function setBody(scene, groupId, actorId, { linked = false } = {}) {
    const { utils } = getBlacksmith();
    return runExclusive(scene, groupId, async () => {
        await apply(scene, groupId);
        const group = requireGroup(scene, groupId);
        if (group.body) throw new Error(`${MODULE_ID}: group "${group.name}" already has a body; clear it first`);
        const actor = game.actors.get(actorId);
        if (!actor) throw new Error(`${MODULE_ID}: there is no actor ${actorId}`);

        const data = { ...bodyFootprint(scene, group), ...bodyTraits(groupId), actorLink: !!linked };
        const document = await actor.getTokenDocument(data);
        const [token] = await scene.createEmbeddedDocuments('Token', [document.toObject()]);
        await patchGroup(scene, groupId, { body: { tokenId: token.id, actorId } });
        utils.postConsoleAndNotification(MODULE_NAME, `Group "${group.name}" now represents ${actor.name}`, { tokenId: token.id, linked: !!linked }, true, false);
        return token;
    });
}

/**
 * Make a token that is already on the scene the group's body, for the actor it already has. Its image is changed
 * to the transparent one on this token only. The token is moved and sized to cover the group.
 * @returns {Promise<TokenDocument>} The body token.
 */
export function adoptBody(scene, groupId, token) {
    const { utils } = getBlacksmith();
    return runExclusive(scene, groupId, async () => {
        await apply(scene, groupId);
        const group = requireGroup(scene, groupId);
        if (group.body) throw new Error(`${MODULE_ID}: group "${group.name}" already has a body; clear it first`);
        if (!token.actorId) throw new Error(`${MODULE_ID}: ${token.name ?? 'that token'} has no actor to represent`);
        if (token.getFlag(MODULE_ID, 'groupId') || token.getFlag(MODULE_ID, RIDER_FLAG)) throw new Error(`${MODULE_ID}: ${token.name ?? 'that token'} already belongs to a group`);

        await token.update({ ...bodyFootprint(scene, group), ...bodyTraits(groupId) }, bodyMove());
        await patchGroup(scene, groupId, { body: { tokenId: token.id, actorId: token.actorId } });
        utils.postConsoleAndNotification(MODULE_NAME, `Group "${group.name}" now uses ${token.name} as its body`, { tokenId: token.id }, true, false);
        return token;
    });
}

/**
 * Take the body off a group and delete its token. The group, its pin and its parts are untouched.
 * @returns {Promise<boolean>} Whether there was a body to clear.
 */
export function clearBody(scene, groupId) {
    return runExclusive(scene, groupId, async () => {
        const group = requireGroup(scene, groupId);
        if (!group.body) return false;
        const token = bodyToken(scene, group);
        await patchGroup(scene, groupId, { '-=body': null });
        if (token) await scene.deleteEmbeddedDocuments('Token', [token.id]);
        return true;
    });
}

// ---- riders ------------------------------------------------------------------------------------------------

/**
 * Put tokens aboard a group. A rider is carried when the group moves or turns, and can be moved by hand anywhere
 * inside it. A token has to be on the group (its middle inside) to board, and cannot ride two groups, ride its
 * own body, or be a body.
 * @returns {Promise<{mounted: number, skipped: string[]}>}
 */
export function mountTokens(scene, groupId, tokens) {
    const { utils } = getBlacksmith();
    return runExclusive(scene, groupId, async () => {
        await apply(scene, groupId);
        const group = requireGroup(scene, groupId);
        const anchor = { ...group.applied };
        const have = new Set((group.riders ?? []).map((r) => r.tokenId));
        const added = [];
        const boarded = [];
        const skipped = [];
        for (const token of tokens) {
            const name = token.name ?? 'A token';
            if (have.has(token.id)) continue;
            if (token.getFlag(MODULE_ID, 'groupId')) skipped.push(`${name} is the body of a group`);
            else if (token.getFlag(MODULE_ID, RIDER_FLAG)) skipped.push(`${name} is already riding a group`);
            else if (!insideGroup(scene, group, tokenCentre(scene, token._source), anchor)) skipped.push(`${name} is not on the group`);
            else {
                added.push(captureRider(scene, token.id, token._source, anchor));
                boarded.push(token);
            }
        }
        if (added.length) {
            await patchGroup(scene, groupId, { riders: [...(group.riders ?? []), ...added] });
            for (const token of boarded) {
                // Boarding on purpose also ends any earlier "stay off this group".
                await token.update({ [`flags.${MODULE_ID}.${RIDER_FLAG}`]: groupId, [`flags.${MODULE_ID}.-=${STAYED_FLAG}`]: null }, { puppeteer: { follower: true } });
            }
        }
        utils.postConsoleAndNotification(MODULE_NAME, `Group "${group.name}": ${added.length} boarded, ${skipped.length} skipped`, { skipped }, true, false);
        for (const token of boarded) {
            await announceBoarding(group, token, 'boarded');
            await fireEvent(scene, group, 'board', { token: { id: token.id, name: token.name } });
        }
        return { mounted: added.length, skipped };
    });
}

/** Let a rider go: it stays where it is and is no longer carried. Only call from inside the group's queue. */
export async function releaseRider(scene, groupId, tokenId) {
    const group = requireGroup(scene, groupId);
    const riders = (group.riders ?? []).filter((r) => r.tokenId !== tokenId);
    if (riders.length === (group.riders ?? []).length) return false;
    await patchGroup(scene, groupId, { riders });
    const token = scene.tokens.get(tokenId);
    if (token?.getFlag(MODULE_ID, RIDER_FLAG) === groupId) await token.unsetFlag(MODULE_ID, RIDER_FLAG);
    if (token) {
        await announceBoarding(group, token, 'left');
        await fireEvent(scene, group, 'leave', { token: { id: token.id, name: token.name } });
    }
    return true;
}

/**
 * Dismount a rider on purpose. It stays where it is, and does not climb back aboard just because it is still on the
 * group: it boards again only after it has been off the group and come back.
 * @returns {Promise<boolean>} Whether it was aboard.
 */
export function dismountToken(scene, groupId, tokenId) {
    return runExclusive(scene, groupId, async () => {
        const released = await releaseRider(scene, groupId, tokenId);
        const token = scene.tokens.get(tokenId);
        if (released && token) await token.update({ [`flags.${MODULE_ID}.${STAYED_FLAG}`]: groupId }, { puppeteer: { follower: true } });
        return released;
    });
}

/** Whether tokens created on the group board it. */
export async function setMountable(scene, groupId, mountable) {
    requireGroup(scene, groupId);
    await patchGroup(scene, groupId, { mountable: !!mountable });
}

/**
 * Turn Move Pivot on or off. While it is on, the next move or turn of the group's pin moves only the grip: every part,
 * rider and the body stay where they are and are recorded against the pin's new place, and the mode switches itself
 * off. Off, the pin takes the group with it.
 * @returns {Promise<boolean>} The new state.
 */
export function setMovePivot(scene, groupId, on) {
    return runExclusive(scene, groupId, async () => {
        // First let the group catch up with its pin, so what is recorded is where the group really is.
        await apply(scene, groupId);
        requireGroup(scene, groupId);
        await patchGroup(scene, groupId, on ? { movePivot: true } : { '-=movePivot': null });
        return !!on;
    });
}

/**
 * Choose how a group behaves.
 *  - `facesTravel`: boolean. When the pin is moved the group turns to face the way it went (its front is the bottom of its
 *    picture, as a token's is). It does nothing for a group that does not turn with its pin.
 *  - `ease`: `{ mode: 'ease' | 'travel' | 'jump', ms, speed }`. How the group moves on screen when its pin moves or turns:
 *    a short glide of `ms`, a steady travel at `speed` squares a second, or no movement between the two places.
 *  - `rotates`: whether the group turns when its pin does. Off, it keeps the way it faces now and only follows the pin
 *    about. Turning it back on records the group again against the pin's own heading, so nothing swings.
 *  - `front`: degrees, which way the picture's front points as a clockwise turn from down (0 down, 90 left, 180 up, 270
 *    right). A group that faces its travel puts this end first.
 *  - `ridersFree`: whether a rider may be moved about inside the group. Off, a rider moved by hand is put back.
 *  - `solidOnly`: whether only the solid part of the group counts as on it when a token boards or moves about. On (the
 *    default), the transparent parts of a tile's picture do not; off, the whole box that holds the group does.
 *  - `announce`: whether a token boarding or leaving is announced in chat, with a sound.
 * @returns {Promise<object>} The group record.
 */
export function setBehaviour(scene, groupId, options = {}) {
    const { pins } = getBlacksmith();
    return runExclusive(scene, groupId, async () => {
        await apply(scene, groupId);
        const group = requireGroup(scene, groupId);
        const patch = {};

        if (options.ease) {
            const mode = options.ease.mode ?? group.ease?.mode ?? 'ease';
            if (!['ease', 'travel', 'jump'].includes(mode)) throw new Error(`${MODULE_ID}: movement is "ease", "travel" or "jump", not "${mode}"`);
            const ms = Number(options.ease.ms ?? group.ease?.ms ?? 350);
            if (!Number.isFinite(ms)) throw new Error(`${MODULE_ID}: the easing time must be a number of milliseconds`);
            const speed = Number(options.ease.speed ?? group.ease?.speed ?? DEFAULT_TRAVEL_SPEED);
            if (!Number.isFinite(speed)) throw new Error(`${MODULE_ID}: the travel speed must be a number of squares a second`);
            patch.ease = {
                mode,
                ms: Math.min(EASE_LIMITS.max, Math.max(EASE_LIMITS.min, Math.round(ms))),
                speed: Math.min(TRAVEL_SPEED_LIMITS.max, Math.max(TRAVEL_SPEED_LIMITS.min, Math.round(speed * 10) / 10))
            };
        }
        if ('ridersFree' in options) patch.ridersFree = !!options.ridersFree;
        if ('announce' in options) patch.announce = !!options.announce;
        if ('front' in options) {
            const front = Number(options.front);
            if (!Number.isFinite(front)) throw new Error(`${MODULE_ID}: the front of a picture is a number of degrees`);
            const turn = Math.round(normAngle(front) * 100) / 100;
            if (turn) patch.front = turn;
            else patch['-=front'] = null;
        }
        if ('solidOnly' in options) {
            if (options.solidOnly) patch['-=solidOnly'] = null;
            else patch.solidOnly = false;
        }
        if ('facesTravel' in options) {
            if (options.facesTravel) patch.facesTravel = true;
            else patch['-=facesTravel'] = null;
        }

        if ('rotates' in options && !!options.rotates !== (group.rotates !== false)) {
            if (!options.rotates) {
                // Freeze the way it faces now, so choosing this moves nothing.
                patch.rotates = false;
                patch.fixedHeading = group.applied.heading;
            } else {
                // Record every part against the pin's own heading first, so nothing swings round to meet it.
                const pin = pins.get(group.anchor.id, { sceneId: scene.id });
                if (!pin) throw new Error(`${MODULE_ID}: the pin of group "${group.name}" is gone`);
                await repivot(scene, { ...group, rotates: true }, { x: pin.x, y: pin.y, heading: pin.rotation ?? 0 });
                patch['-=rotates'] = null;
                patch['-=fixedHeading'] = null;
            }
        }
        if (Object.keys(patch).length) await patchGroup(scene, groupId, patch);
        return getGroup(scene, groupId);
    });
}

// ---- resizing ------------------------------------------------------------------------------------------------------

export const SCALE_LIMITS = Object.freeze({ min: 0.1, max: 10 });

/**
 * Resize a group about its pin. Every part sits `factor` times as far from the pin and is `factor` times as big (a tile's
 * width and height, a light's reach, a sound's radius, a drawing's size, a region's shapes), riders stand `factor`
 * times as far from the pin, and the group's token is refitted. Tokens, notes and walls keep their own size. A scale
 * and its reverse put everything back, except where a size must be a whole number of pixels.
 * @param {number} factor  Between 0.1 and 10, other than 1.
 * @returns {Promise<{scaled: number}>} How many parts were resized.
 */
export function scaleGroup(scene, groupId, factor) {
    const { utils } = getBlacksmith();
    const by = Number(factor);
    if (!Number.isFinite(by) || by < SCALE_LIMITS.min || by > SCALE_LIMITS.max) {
        return Promise.reject(new Error(`${MODULE_ID}: resize by a factor between ${SCALE_LIMITS.min} and ${SCALE_LIMITS.max}`));
    }
    return runExclusive(scene, groupId, async () => {
        await apply(scene, groupId);
        const group = requireGroup(scene, groupId);
        if (by === 1) return { scaled: 0 };
        const anchor = { ...group.applied };

        const members = [];
        const updates = new Map();
        for (const member of group.members) {
            const doc = scene.getEmbeddedCollection(member.type).get(member.id);
            if (!doc) { members.push(member); continue; }
            const scaled = scaleMember(member, doc._source, by);
            members.push(scaled.record);
            if (!updates.has(member.type)) updates.set(member.type, []);
            updates.get(member.type).push({ _id: member.id, ...scaled.fields, ...memberUpdate(scaled.record, scaled.data, anchor) });
        }
        for (const [type, batch] of updates) await scene.updateEmbeddedDocuments(type, batch, { puppeteer: { follower: true } });

        const riders = (group.riders ?? []).map((rider) => ({ ...rider, dx: rider.dx * by, dy: rider.dy * by }));
        const tokens = riders.filter((rider) => scene.tokens.get(rider.tokenId));
        if (tokens.length) {
            await scene.updateEmbeddedDocuments('Token', tokens.map((rider) => riderUpdate(scene, rider, scene.tokens.get(rider.tokenId)._source, anchor)), riderMove());
        }

        await patchGroup(scene, groupId, group.riders ? { members, riders } : { members });
        await fitBody(scene, groupId);
        utils.postConsoleAndNotification(MODULE_NAME, `Group "${group.name}" resized by ${by}`, { parts: members.length, riders: riders.length }, true, false);
        return { scaled: members.length };
    });
}

// ---- events ----------------------------------------------------------------------------------------------------

/**
 * Give a group a rule: when something happens to it, play a sound or run a macro. See events.js.
 * @param {{on: string, do: 'sound'|'macro', value: string}} rule  `value` is a sound path, or a macro's id or UUID.
 * @returns {Promise<object>} The stored rule, with its id.
 */
export async function addEvent(scene, groupId, rule) {
    const group = requireGroup(scene, groupId);
    const stored = normaliseEvent(rule, group);
    const events = group.events ?? [];
    if (events.length >= MAX_EVENTS) throw new Error(`${MODULE_ID}: a group can have ${MAX_EVENTS} events`);
    await patchGroup(scene, groupId, { events: [...events, stored] });
    return stored;
}

/** Take a rule off a group. @returns {Promise<boolean>} Whether it was there. */
export async function removeEvent(scene, groupId, eventId) {
    const group = requireGroup(scene, groupId);
    const events = (group.events ?? []).filter((rule) => rule.id !== eventId);
    if (events.length === (group.events ?? []).length) return false;
    await patchGroup(scene, groupId, events.length ? { events } : { '-=events': null });
    return true;
}

// ---- hiding -------------------------------------------------------------------------------------------------

/** The member types Foundry lets a GM hide. Walls and notes have no hidden state, so they are left as they are. */
export const HIDEABLE = Object.freeze(['Tile', 'Drawing', 'AmbientLight', 'AmbientSound', 'Region']);

const FOLLOWER_WRITE = () => ({ puppeteer: { follower: true } });

/** Every hideable document of a group that is on the scene: its parts, and its body token. */
function hideableDocuments(scene, group) {
    const documents = [];
    for (const member of group.members) {
        if (!HIDEABLE.includes(member.type)) continue;
        const doc = scene.getEmbeddedCollection(member.type).get(member.id);
        if (doc) documents.push(doc);
    }
    const body = bodyToken(scene, group);
    if (body) documents.push(body);
    return documents;
}

/** Write `hidden` to documents, one call per type. */
async function writeHidden(scene, byType) {
    for (const [type, updates] of byType) {
        if (updates.length) await scene.updateEmbeddedDocuments(type, updates, FOLLOWER_WRITE());
    }
}

const keyOfDocument = (doc) => `${doc.documentName}:${doc.id}`;

/**
 * Hide or show a whole group: its tiles, drawings, lights, sounds, regions and body token. Anything that was already
 * hidden when the group was hidden stays hidden when it is shown. Walls and notes cannot be hidden and are left alone,
 * and so are riders, because they are somebody's token.
 * @returns {Promise<boolean>} Whether the group is now hidden.
 */
export function setGroupHidden(scene, groupId, hidden) {
    return runExclusive(scene, groupId, async () => {
        const group = requireGroup(scene, groupId);
        const on = !!hidden;
        if (on === !!group.hidden) return on;
        const documents = hideableDocuments(scene, group);
        const byType = new Map();
        const push = (doc, value) => {
            if (!byType.has(doc.documentName)) byType.set(doc.documentName, []);
            byType.get(doc.documentName).push({ _id: doc.id, hidden: value });
        };

        if (on) {
            const before = [];
            for (const doc of documents) {
                if (doc._source.hidden) before.push(keyOfDocument(doc));
                else push(doc, true);
            }
            await writeHidden(scene, byType);
            await patchGroup(scene, groupId, { hidden: true, hiddenBefore: before });
            await fireEvent(scene, group, 'hide');
        } else {
            const keep = new Set(group.hiddenBefore ?? []);
            for (const doc of documents) {
                if (!keep.has(keyOfDocument(doc)) && doc._source.hidden) push(doc, false);
            }
            await writeHidden(scene, byType);
            await patchGroup(scene, groupId, { '-=hidden': null, '-=hiddenBefore': null });
            await fireEvent(scene, group, 'show');
        }
        return on;
    });
}

/** Hide or show one part of a group. Only the types in HIDEABLE can be hidden. */
/**
 * Switch a group's lights or its sounds on or off together. Left out, `on` flips them: if any is on they all go off, if none
 * is they all come on. A light or a sound is on when it is not hidden.
 * @param {'AmbientLight'|'AmbientSound'} type
 * @param {boolean} [on]
 * @returns {Promise<{on: boolean, count: number}>}  What they were set to, and how many there are.
 */
export async function setEmittersOn(scene, groupId, type, on) {
    if (type !== 'AmbientLight' && type !== 'AmbientSound') throw new Error(`${MODULE_ID}: lights and sounds can be switched, not "${type}"`);
    const group = requireGroup(scene, groupId);
    const documents = group.members
        .filter((member) => member.type === type)
        .map((member) => scene.getEmbeddedCollection(type).get(member.id))
        .filter(Boolean);
    if (!documents.length) return { on: false, count: 0 };
    const turnOn = on === undefined ? !documents.some((doc) => !doc._source.hidden) : !!on;
    const updates = documents.filter((doc) => !!doc._source.hidden === turnOn).map((doc) => ({ _id: doc.id, hidden: !turnOn }));
    if (updates.length) await scene.updateEmbeddedDocuments(type, updates, FOLLOWER_WRITE());
    return { on: turnOn, count: documents.length };
}

const VIDEO = /\.(mp4|webm|m4v|ogv|mov)(\?.*)?$/i;

/** The video tiles of a group: the parts that animate. */
export function videoTiles(scene, group) {
    return group.members
        .filter((member) => member.type === 'Tile')
        .map((member) => scene.getEmbeddedCollection('Tile').get(member.id))
        .filter((doc) => doc && VIDEO.test(doc._source.texture?.src ?? ''));
}

/**
 * Play or pause every animation in a group: its video tiles. Left out, `playing` flips it. Foundry's own play and pause
 * control does the same to one tile, by an update carrying `playVideo`, which reaches every client; the tile's autoplay
 * is set to match, so a paused group stays paused when the scene is loaded again.
 * @param {boolean} [playing]
 * @returns {Promise<{playing: boolean, count: number}>}  What they were set to, and how many video tiles there are.
 */
export async function setPlaying(scene, groupId, playing) {
    const group = requireGroup(scene, groupId);
    const tiles = videoTiles(scene, group);
    if (!tiles.length) return { playing: false, count: 0 };
    const play = playing === undefined ? !!group.paused : !!playing;
    await scene.updateEmbeddedDocuments('Tile', tiles.map((doc) => ({ _id: doc.id, video: { autoplay: play } })), { ...FOLLOWER_WRITE(), diff: false, playVideo: play });
    await patchGroup(scene, groupId, play ? { '-=paused': null } : { paused: true });
    return { playing: play, count: tiles.length };
}

export async function setMemberHidden(scene, groupId, type, id, hidden) {
    const group = requireGroup(scene, groupId);
    if (!HIDEABLE.includes(type)) throw new Error(`${MODULE_ID}: a ${type} cannot be hidden`);
    if (!group.members.some((m) => m.type === type && m.id === id)) throw new Error(`${MODULE_ID}: that ${type} is not in group "${group.name}"`);
    const doc = scene.getEmbeddedCollection(type).get(id);
    if (!doc) throw new Error(`${MODULE_ID}: that ${type} is not on the scene`);
    await scene.updateEmbeddedDocuments(type, [{ _id: id, hidden: !!hidden }], FOLLOWER_WRITE());
}

/** Set whether the body's actor is linked (one set of hit points everywhere) or unlinked (this token's own). */
export async function setBodyLinked(scene, groupId, linked) {
    const token = bodyToken(scene, requireGroup(scene, groupId));
    if (!token) throw new Error(`${MODULE_ID}: that group has no body`);
    await token.update({ actorLink: !!linked }, { puppeteer: { follower: true } });
}

/** Set the heading in degrees (clockwise, 0 facing down). The follower moves the members. */
export async function setHeading(scene, groupId, degrees) {
    const group = requireGroup(scene, groupId);
    if (group.rotates === false) throw new Error(`${MODULE_ID}: group "${group.name}" does not turn with its pin; turn it on in Behaviour first`);
    // A pin group faces where its pin faces. Turning it here and turning the pin with Shift + wheel are the same
    // write, and the follower does the rest.
    await getBlacksmith().pins.update(group.anchor.id, { rotation: normAngle(degrees) }, { sceneId: scene.id });
    return getGroup(scene, groupId);
}

export function rotateBy(scene, groupId, degrees) {
    const group = requireGroup(scene, groupId);
    const heading = anchorState(scene, group)?.heading ?? group.heading;
    return setHeading(scene, groupId, heading + degrees);
}

/**
 * Move the pivot (the pin) to the centre of what the group holds, without moving any member. Every member's
 * offset is re-recorded against the new pivot. Done inside the group's queue, and in this order (record,
 * then pin), so the follower never sees a pin that disagrees with the record and moves the members.
 * @returns {Promise<{x: number, y: number, heading: number}|null>} The new anchor, or null when the group has no members.
 */
export function recenterPivot(scene, groupId) {
    const { pins, utils } = getBlacksmith();
    return runExclusive(scene, groupId, async () => {
        await apply(scene, groupId);                 // members are where the record puts them
        const group = requireGroup(scene, groupId);
        // The store hands out the live record and updates it in place, so keep a copy to restore from.
        const before = { members: structuredClone(group.members), applied: structuredClone(group.applied) };
        const present = group.members
            .map((member) => [member, scene.getEmbeddedCollection(member.type).get(member.id)])
            .filter(([, doc]) => doc);
        if (!present.length) return null;

        const points = present.flatMap(([member, doc]) => memberExtent(member.type, doc._source));
        const centre = extentCentre(points);
        const pinBefore = group.anchor.type === 'pin' ? pins.get(group.anchor.id, { sceneId: scene.id }) : null;
        const anchor = { x: Math.round(centre.x), y: Math.round(centre.y), heading: pinBefore?.rotation ?? group.heading };
        const members = present.map(([member, doc]) => recaptureMember(member, doc._source, anchor));

        await patchGroup(scene, groupId, { members, applied: anchor });
        if (group.anchor.type === 'pin') {
            await pins.update(group.anchor.id, { x: anchor.x, y: anchor.y }, { sceneId: scene.id });
            // Do not report success for a move that did not happen: the record now describes the new pivot, so a
            // pin left behind would make the next move or turn jump the group.
            const moved = pins.get(group.anchor.id, { sceneId: scene.id });
            if (!moved || Math.abs(moved.x - anchor.x) > 1 || Math.abs(moved.y - anchor.y) > 1) {
                await patchGroup(scene, groupId, before);
                throw new Error(`Blacksmith did not move the pin to ${anchor.x}, ${anchor.y} (it is at ${moved ? `${Math.round(moved.x)}, ${Math.round(moved.y)}` : 'nowhere'}); the group was left as it was`);
            }
        }
        const xs = points.map((p) => p.x);
        const ys = points.map((p) => p.y);
        const result = {
            ...anchor,
            from: pinBefore ? { x: Math.round(pinBefore.x), y: Math.round(pinBefore.y) } : null,
            width: Math.round(Math.max(...xs) - Math.min(...xs)),
            height: Math.round(Math.max(...ys) - Math.min(...ys))
        };
        utils.postConsoleAndNotification(MODULE_NAME, `Group "${group.name}": pivot moved to the centre of its ${present.length} member(s)`, result, false, false);
        return result;
    });
}

/**
 * A portable snapshot of a group: offsets from the pivot and a copy of every member's document data. It
 * names nothing on this scene, so it can be stamped onto any scene, any number of times.
 */
export function exportGroup(scene, groupId) {
    const group = requireGroup(scene, groupId);
    const sources = new Map();
    for (const member of group.members) {
        const doc = scene.getEmbeddedCollection(member.type).get(member.id);
        if (doc) sources.set(`${member.type}:${member.id}`, doc._source);
    }
    // A group that represents an actor says so, so every stamp of it comes with its body.
    const token = bodyToken(scene, group);
    const body = group.body && {
        actorId: group.body.actorId,
        actorName: game.actors.get(group.body.actorId)?.name ?? token?.name,
        linked: !!token?._source.actorLink
    };
    return buildTemplate(group, sources, body);
}

/**
 * Delete the group: its record, its pin and its body token. The members stay in the scene where they are,
 * unless `removeMembers` is set, in which case they are deleted from the scene too.
 * @returns {Promise<{removed: number}>} How many members were deleted from the scene.
 */
export async function deleteGroup(scene, groupId, { removeMembers = false } = {}) {
    const { pins } = getBlacksmith();
    const group = requireGroup(scene, groupId);
    // The store updates records in place, so take what is needed before the record goes.
    const parts = group.members.map((member) => ({ type: member.type, id: member.id }));
    const body = bodyToken(scene, group);
    const riders = (group.riders ?? []).map((r) => r.tokenId);
    await deleteGroupRecord(scene, groupId);
    // Riders are let go where they stand.
    for (const tokenId of riders) {
        const rider = scene.tokens.get(tokenId);
        if (rider?.getFlag(MODULE_ID, RIDER_FLAG) === groupId) await rider.unsetFlag(MODULE_ID, RIDER_FLAG);
    }
    // The body exists only for its group.
    if (body) await scene.deleteEmbeddedDocuments('Token', [body.id]);
    // The pin may already be gone (deleted by hand); the record is what matters.
    if (group.anchor.type === 'pin' && pins.exists(group.anchor.id, { sceneId: scene.id })) {
        await pins.delete(group.anchor.id, { sceneId: scene.id });
    }

    // The record is gone first, so removing the parts does not make the delete hooks look for them in a group.
    let removed = 0;
    if (removeMembers) {
        const byType = new Map();
        for (const part of parts) {
            if (!scene.getEmbeddedCollection(part.type).get(part.id)) continue;
            if (!byType.has(part.type)) byType.set(part.type, []);
            byType.get(part.type).push(part.id);
        }
        for (const [type, ids] of byType) {
            await scene.deleteEmbeddedDocuments(type, ids);
            removed += ids.length;
        }
    }
    return { removed };
}

export function listGroups(scene) {
    return Object.values(getGroups(scene));
}
