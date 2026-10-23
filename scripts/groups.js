// Operations on groups: create, add and remove members, rotate, delete. The toolbar, the Group Editor and
// macros all call these, so there is one place that knows how a group is changed.
import { MODULE_ID, MODULE_NAME } from './constants.js';
import { getBlacksmith } from './bootstrap.js';
import { MEMBER_TYPES, captureMember, normAngle } from './geometry.js';
import { getGroup, getGroups, saveGroup, patchGroup, deleteGroupRecord } from './store.js';

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
    utils.postConsoleAndNotification(MODULE_NAME, `Group "${group.name}": added ${added.length}, skipped ${skipped}`, null, true, false);
    return { added: added.length, skipped };
}

/** Add whatever is selected, on any layer of the canvas that can hold a member. */
export function addSelected(scene, groupId) {
    const layers = [canvas.tiles, canvas.drawings, canvas.lighting, canvas.sounds, canvas.walls, canvas.notes];
    const documents = layers.flatMap((layer) => layer?.controlled ?? []).map((placeable) => placeable.document);
    return addMembers(scene, groupId, documents);
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

/** Delete the record and its pin. The members stay in the scene where they are. */
export async function deleteGroup(scene, groupId) {
    const { pins } = getBlacksmith();
    const group = requireGroup(scene, groupId);
    await deleteGroupRecord(scene, groupId);
    if (group.anchor.type === 'pin') await pins.delete(group.anchor.id, { sceneId: scene.id });
}

export function listGroups(scene) {
    return Object.values(getGroups(scene));
}
