// The template library: groups saved as portable templates, kept in a world setting, and the stamp that puts
// a template onto a scene as a fresh, independent group. Each stamp creates new documents, a new pin and a
// new group record, so two stamps of one template are two separate copies.
//
// This is where set pieces (pin-anchored groups) live. A template can later also ride on an Actor for
// vehicles; the format is the same.
import { MODULE_ID, MODULE_NAME } from './constants.js';
import { getBlacksmith } from './blacksmith.js';
import { MEMBER_TYPES, normAngle } from './geometry.js';
import { stampMembers, validateTemplate } from './template.js';
import { createGroup, deleteGroup, exportGroup } from './groups.js';
import { patchGroup } from './store.js';

const KEY = 'library';

/** Register the world setting that holds the library. Call once, in ready, after bootstrap has passed. */
export function registerLibrarySetting() {
    game.settings.register(MODULE_ID, KEY, { scope: 'world', config: false, type: Object, default: {} });
}

function read() {
    return getBlacksmith().utils.getSettingSafely(MODULE_ID, KEY, {}) ?? {};
}

function write(library) {
    return getBlacksmith().utils.setSettingSafely(MODULE_ID, KEY, library);
}

/** What the library holds, by name. */
export function listTemplates() {
    return Object.entries(read())
        .map(([id, template]) => ({ id, name: template.name, members: template.members.length, savedAt: template.savedAt ?? 0 }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function getTemplate(id) {
    return read()[id] ?? null;
}

/** Store a template. Returns its library id. */
export async function saveTemplate(template, id = foundry.utils.randomID()) {
    validateTemplate(template);
    await write({ ...read(), [id]: { ...structuredClone(template), savedAt: Date.now() } });
    return id;
}

export async function deleteTemplate(id) {
    const { [id]: gone, ...rest } = read();
    if (!gone) return false;
    await write(rest);
    return true;
}

/** Save a group on the scene as a template in the library. */
export function saveGroupToLibrary(scene, groupId) {
    return saveTemplate(exportGroup(scene, groupId));
}

/** Read a template from JSON text (an exported file) into the library. */
export async function importTemplate(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        throw new Error(`Puppeteer: that file is not JSON (${error.message})`);
    }
    return saveTemplate(validateTemplate(parsed));
}

/**
 * Put a template onto a scene: new documents for every member, a new pin at `point`, and a group record tying
 * them together.
 * @param {Scene} scene
 * @param {object|string} template  A template, or the id of one in the library.
 * @param {{x: number, y: number}} point  Where the pivot goes.
 * @param {{heading?: number, name?: string}} [options]
 * @returns {Promise<object>} The new group record.
 */
export async function stampTemplate(scene, template, point, { heading = 0, name } = {}) {
    const { utils } = getBlacksmith();
    const source = typeof template === 'string' ? getTemplate(template) : template;
    if (!source) throw new Error(`Puppeteer: no template ${template} in the library`);
    validateTemplate(source);

    // The group and its pin first, empty, so the follower has nothing to move while the members arrive. The members
    // are then placed for the heading Blacksmith stored on the pin, which is what the follower will use.
    const group = await createGroup(scene, point, { name: name ?? source.name, heading });
    const anchor = { ...group.applied };
    const stamped = stampMembers(source, anchor);

    const byType = new Map();
    stamped.forEach((entry, index) => {
        if (!byType.has(entry.type)) byType.set(entry.type, []);
        byType.get(entry.type).push({ index, data: entry.data });
    });
    const created = new Array(stamped.length);
    try {
        for (const type of MEMBER_TYPES) {
            const items = byType.get(type);
            if (!items) continue;
            const docs = await scene.createEmbeddedDocuments(type, items.map((item) => item.data));
            docs.forEach((doc, i) => { created[items[i].index] = doc; });
        }
    } catch (error) {
        // Do not leave half a stamp behind: remove what was made and the empty group, then say what went wrong.
        for (const doc of created.filter(Boolean)) await scene.deleteEmbeddedDocuments(doc.documentName, [doc.id]).catch(() => {});
        await deleteGroup(scene, group.id).catch(() => {});
        throw error;
    }

    // The template's own offsets are exactly what the stamp used, so they are the new group's offsets.
    const members = source.members.map(({ data, ...offsets }, index) => ({ ...structuredClone(offsets), id: created[index].id }));
    await patchGroup(scene, group.id, { members, applied: anchor });
    utils.postConsoleAndNotification(MODULE_NAME, `Stamped "${source.name}" with ${members.length} member(s)`, { groupId: group.id, anchor }, true, false);
    return { ...group, members, applied: anchor };
}
