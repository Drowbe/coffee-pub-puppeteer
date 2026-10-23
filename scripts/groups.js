// Operations on groups: create, add and remove members, rotate, delete. The toolbar, the Group Editor and
// macros all call these, so there is one place that knows how a group is changed.
import { MODULE_ID, MODULE_NAME } from './constants.js';
import { getBlacksmith } from './bootstrap.js';
import { MEMBER_TYPES, captureMember, memberExtent, extentCentre, normAngle } from './geometry.js';
import { getGroup, getGroups, saveGroup, patchGroup, deleteGroupRecord } from './store.js';
import { syncGroup, runExclusive, apply } from './follower.js';

export const PIN_TYPE = 'group';
const PIN_ICON = 'fa-solid fa-up-down-left-right';

/** Tell Blacksmith what a Puppeteer pin is, so its menus and filters can name it. Call once, in ready. */
export function registerPinType() {
    const { pins } = getBlacksmith();
    pins.registerPinType(MODULE_ID, PIN_TYPE, 'Puppeteer Group');
    pins.registerPinTaxonomy(MODULE_ID, {
        pinCategories: {
            // Not copyable: a copied pin would point at the same group record.
            [PIN_TYPE]: { label: 'Puppeteer Group', tags: ['group'], copyable: false }
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

/**
 * Make a group anchored on a new pin.
 * @param {Scene} scene
 * @param {{x: number, y: number}} point  Where the pin goes, in scene pixels.
 * @param {{name?: string}} [options]
 * @returns {Promise<object>} The group record.
 */
export async function createGroup(scene, point, { name = 'Group' } = {}) {
    const { pins, utils } = getBlacksmith();
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    const id = foundry.utils.randomID();
    const pin = await pins.create({
        id: crypto.randomUUID(),
        moduleId: MODULE_ID,
        type: PIN_TYPE,
        tags: ['group'],
        text: name,
        image: PIN_ICON,
        x,
        y,
        config: { puppeteer: { groupId: id } }
    }, { sceneId: scene.id });

    const group = {
        id,
        name,
        anchor: { type: 'pin', id: pin.id },
        heading: 0,
        members: [],
        applied: { x, y, heading: 0 }
    };
    await saveGroup(scene, group);
    utils.postConsoleAndNotification(MODULE_NAME, `Created group "${name}"`, { groupId: id, pinId: pin.id }, true, false);
    return group;
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
    for (const doc of documents) {
        const type = doc.documentName;
        if (!MEMBER_TYPES.includes(type) || have.has(`${type}:${doc.id}`)) continue;
        added.push(captureMember(type, doc.id, doc._source, anchor));
    }
    const skipped = documents.length - added.length;
    if (added.length) await patchGroup(scene, groupId, { members: [...group.members, ...added] });
    utils.postConsoleAndNotification(MODULE_NAME, `Group "${group.name}": added ${added.length}, skipped ${skipped}`, { anchor, added }, true, false);
    return { added: added.length, skipped };
}

/**
 * Let the GM drag a box and add everything of a supported type inside it, across every layer in one pick.
 * @returns {Promise<{added: number, skipped: number}|null>} null when the pick was cancelled.
 */
export async function captureArea(scene, groupId, { containment = 'centre' } = {}) {
    requireGroup(scene, groupId);
    const picked = await getBlacksmith().canvas.pickArea({
        types: [...MEMBER_TYPES],
        containment,
        levels: 'current',
        prompt: 'Drag a box around everything that belongs to the group. Esc to cancel.'
    });
    if (!picked) return null;
    return addMembers(scene, groupId, picked.documents);
}

/** Add whatever is selected, on any layer of the canvas that can hold a member. */
export function addSelected(scene, groupId) {
    const layers = [canvas.tiles, canvas.drawings, canvas.lighting, canvas.sounds, canvas.walls, canvas.notes];
    const documents = layers.flatMap((layer) => layer?.controlled ?? []).map((placeable) => placeable.document);
    return addMembers(scene, groupId, documents);
}

/** Remove whatever is selected, on any layer, from the group. Returns how many members went. */
export async function removeSelected(scene, groupId) {
    const group = requireGroup(scene, groupId);
    const layers = [canvas.tiles, canvas.drawings, canvas.lighting, canvas.sounds, canvas.walls, canvas.notes];
    const picked = new Set(layers.flatMap((layer) => layer?.controlled ?? [])
        .map((placeable) => `${placeable.document.documentName}:${placeable.document.id}`));
    const members = group.members.filter((m) => !picked.has(`${m.type}:${m.id}`));
    if (members.length !== group.members.length) await patchGroup(scene, groupId, { members });
    return group.members.length - members.length;
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

export async function removeMember(scene, groupId, type, id) {
    const group = requireGroup(scene, groupId);
    const members = group.members.filter((m) => !(m.type === type && m.id === id));
    if (members.length !== group.members.length) await patchGroup(scene, groupId, { members });
    return group.members.length - members.length;
}

/** Set the heading in degrees (clockwise, 0 facing down). The follower moves the members. */
export async function setHeading(scene, groupId, degrees) {
    requireGroup(scene, groupId);
    await patchGroup(scene, groupId, { heading: normAngle(degrees) });
    return getGroup(scene, groupId);
}

export function rotateBy(scene, groupId, degrees) {
    const group = requireGroup(scene, groupId);
    return setHeading(scene, groupId, group.heading + degrees);
}

/**
 * Move the pivot (the pin) to the centre of what the group holds, without moving any member. Every member's
 * offset is re-recorded against the new pivot. Done inside the group's queue, and in this order (record,
 * then pin), so the follower never sees a pin that disagrees with the record and moves the members.
 * @returns {Promise<{x: number, y: number, heading: number}|null>} The new anchor, or null when the group has no members.
 */
export function recenterPivot(scene, groupId) {
    const { pins, utils } = getBlacksmith();
    requireGroup(scene, groupId);
    return runExclusive(scene, groupId, async () => {
        await apply(scene, groupId);                 // members are where the record puts them
        const group = requireGroup(scene, groupId);
        const present = group.members
            .map((member) => [member, scene.getEmbeddedCollection(member.type).get(member.id)])
            .filter(([, doc]) => doc);
        if (!present.length) return null;

        const centre = extentCentre(present.flatMap(([member, doc]) => memberExtent(member.type, doc._source)));
        const anchor = { x: Math.round(centre.x), y: Math.round(centre.y), heading: group.heading };
        const members = present.map(([member, doc]) => captureMember(member.type, member.id, doc._source, anchor));

        await patchGroup(scene, groupId, { members, applied: anchor });
        if (group.anchor.type === 'pin') await pins.update(group.anchor.id, { x: anchor.x, y: anchor.y }, { sceneId: scene.id });
        utils.postConsoleAndNotification(MODULE_NAME, `Group "${group.name}": pivot moved to the centre of its ${present.length} member(s)`, anchor, true, false);
        return anchor;
    });
}

/** Delete the record and its pin. The members stay in the scene where they are. */
export async function deleteGroup(scene, groupId) {
    const { pins } = getBlacksmith();
    const group = requireGroup(scene, groupId);
    await deleteGroupRecord(scene, groupId);
    // The pin may already be gone (deleted by hand); the record is what matters.
    if (group.anchor.type === 'pin' && pins.exists(group.anchor.id, { sceneId: scene.id })) {
        await pins.delete(group.anchor.id, { sceneId: scene.id });
    }
}

export function listGroups(scene) {
    return Object.values(getGroups(scene));
}
