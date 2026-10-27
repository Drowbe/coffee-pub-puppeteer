// The template library: groups saved as portable templates, kept in a world setting, and the stamp that puts
// a template onto a scene as a fresh, independent group. Each stamp creates new documents, a new pin and a
// new group record, so two stamps of one template are two separate copies.
//
// This is where set pieces (pin-anchored groups) live. A template can later also ride on an Actor for
// vehicles; the format is the same.
import { MODULE_ID, MODULE_NAME, TOAST_CHANNEL } from './constants.js';
import { getBlacksmith } from './blacksmith.js';
import { MEMBER_TYPES, normAngle } from './geometry.js';
import { stampMembers, stampBehaviour, validateTemplate } from './template.js';
import { createGroup, deleteGroup, exportGroup, setBody, uniqueGroupName, HIDEABLE } from './groups.js';
import { anchorState } from './anchor.js';
import { getGroup } from './store.js';
import { playCue } from './announce.js';
import { makeThumbnail } from './thumbnail.js';
import { patchGroup } from './store.js';

const KEY = 'library';
// The categories the library is sorted into, as a list of `{ id, name }`. An entry names its category by id; one with no
// category (or whose category is gone) is uncategorised.
const CATEGORIES_KEY = 'libraryCategories';

/** Register the world settings that hold the library. Call once, in ready, after bootstrap has passed. */
export function registerLibrarySetting() {
    game.settings.register(MODULE_ID, KEY, { scope: 'world', config: false, type: Object, default: {} });
    game.settings.register(MODULE_ID, CATEGORIES_KEY, { scope: 'world', config: false, type: Array, default: [] });
}

const readCategories = () => getBlacksmith().utils.getSettingSafely(MODULE_ID, CATEGORIES_KEY, []) ?? [];
const writeCategories = (categories) => getBlacksmith().utils.setSettingSafely(MODULE_ID, CATEGORIES_KEY, categories);

function read() {
    return getBlacksmith().utils.getSettingSafely(MODULE_ID, KEY, {}) ?? {};
}

function write(library) {
    return getBlacksmith().utils.setSettingSafely(MODULE_ID, KEY, library);
}

/** What the library holds, by name. `category` is the id of its category, or null. */
export function listTemplates() {
    const known = new Set(readCategories().map((category) => category.id));
    return Object.entries(read())
        .map(([id, template]) => ({ id, name: template.name, members: template.members.length, actor: template.body?.actorName ?? null, description: template.description ?? '', thumbnail: template.thumbnail ?? null, savedAt: template.savedAt ?? 0, category: known.has(template.category) ? template.category : null }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

/** The library's categories by name, each with how many entries it holds. */
export function listCategories() {
    const entries = listTemplates();
    return readCategories()
        .map((category) => ({ ...category, count: entries.filter((entry) => entry.category === category.id).length }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

function categoryName(name, categories, exceptId = null) {
    const text = String(name ?? '').trim();
    if (!text) throw new Error('Puppeteer: a category needs a name');
    if (categories.some((category) => category.id !== exceptId && sameName(category.name, text))) throw new Error(`Puppeteer: there is already a category called "${text}"`);
    return text;
}

/** Make a category. @returns {Promise<string>} Its id. */
export async function createCategory(name) {
    const categories = readCategories();
    const id = foundry.utils.randomID();
    await writeCategories([...categories, { id, name: categoryName(name, categories) }]);
    return id;
}

export async function renameCategory(id, name) {
    const categories = readCategories();
    if (!categories.some((category) => category.id === id)) throw new Error(`Puppeteer: no category ${id} in the library`);
    const text = categoryName(name, categories, id);
    await writeCategories(categories.map((category) => (category.id === id ? { ...category, name: text } : category)));
}

/** Remove a category. Its entries are kept, uncategorised. @returns {Promise<boolean>} Whether there was one. */
export async function deleteCategory(id) {
    const categories = readCategories();
    if (!categories.some((category) => category.id === id)) return false;
    const library = read();
    const kept = Object.fromEntries(Object.entries(library).map(([key, template]) => {
        if (template.category !== id) return [key, template];
        const { category, ...rest } = template;
        return [key, rest];
    }));
    await write(kept);
    await writeCategories(categories.filter((category) => category.id !== id));
    return true;
}

/** Put an entry in a category, or in none with `null`. */
export async function setTemplateCategory(templateId, categoryId) {
    const library = read();
    if (!library[templateId]) throw new Error(`Puppeteer: no template ${templateId} in the library`);
    if (categoryId && !readCategories().some((category) => category.id === categoryId)) throw new Error(`Puppeteer: no category ${categoryId} in the library`);
    const { category, ...rest } = library[templateId];
    await write({ ...library, [templateId]: categoryId ? { ...rest, category: categoryId } : rest });
}

/**
 * An entry as a file holds it: the category is named, not numbered, because the ids mean nothing in another world.
 * @returns {object|null}
 */
export function exportTemplateData(id) {
    const template = read()[id];
    if (!template) return null;
    const { category, ...rest } = structuredClone(template);
    const named = readCategories().find((candidate) => candidate.id === category)?.name;
    return named ? { ...rest, category: named } : rest;
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

/** Give a library entry a new name. */
export async function renameTemplate(id, name) {
    const library = read();
    if (!library[id]) throw new Error(`Puppeteer: no template ${id} in the library`);
    const text = String(name ?? '').trim();
    if (!text) throw new Error('Puppeteer: a library entry needs a name');
    await write({ ...library, [id]: { ...library[id], name: text } });
}

/** Set the description of a library entry. An empty one removes it. */
export async function setTemplateDescription(id, description) {
    const library = read();
    if (!library[id]) throw new Error(`Puppeteer: no template ${id} in the library`);
    const { description: old, ...rest } = library[id];
    const text = String(description ?? '').trim();
    await write({ ...library, [id]: text ? { ...rest, description: text } : rest });
}

/**
 * Replace a library entry's parts with a group on a scene. The entry keeps its id, name and description. Copies already
 * placed on scenes are not changed, because each one is its own.
 */
export async function updateTemplateFromGroup(scene, groupId, id) {
    const library = read();
    const old = library[id];
    if (!old) throw new Error(`Puppeteer: no template ${id} in the library`);
    const fresh = exportGroup(scene, groupId);
    const thumbnail = await makeThumbnail(scene, getGroup(scene, groupId));
    if (thumbnail) fresh.thumbnail = thumbnail;
    validateTemplate(fresh);
    const entry = { ...structuredClone(fresh), name: old.name, savedAt: Date.now() };
    if (old.description) entry.description = old.description;
    if (old.category) entry.category = old.category;
    await write({ ...library, [id]: entry });
}

export async function deleteTemplate(id) {
    const { [id]: gone, ...rest } = read();
    if (!gone) return false;
    await write(rest);
    return true;
}

/**
 * Make a copy of a group on the same scene: new parts, a new pin two squares to the right, a new group facing the same
 * way. It is a fabrication from the group itself, so the copy has its own body for the same actor if the original has
 * one, and keeps the original's behaviour choices. Riders are not copied, because they are somebody's tokens. The copy is
 * shown even when the original is hidden, apart from anything that was already hidden before the original was.
 * @returns {Promise<object>} The new group record.
 */
export async function duplicateGroup(scene, groupId, { name } = {}) {
    const group = getGroup(scene, groupId);
    if (!group) throw new Error(`${MODULE_ID}: no group ${groupId} on scene ${scene.name}`);
    const state = anchorState(scene, group) ?? { ...group.applied };
    const template = exportGroup(scene, groupId);

    // A hidden group's parts are hidden only because it is. The template follows `group.members` in order, less any
    // member whose document is gone, so the two are walked together.
    if (group.hidden) {
        const keep = new Set(group.hiddenBefore ?? []);
        const present = group.members.filter((member) => scene.getEmbeddedCollection(member.type).get(member.id));
        template.members.forEach((entry, index) => {
            const member = present[index];
            if (HIDEABLE.includes(entry.type) && !keep.has(`${member.type}:${member.id}`)) entry.data.hidden = false;
        });
    }

    const grid = scene.grid.sizeX ?? scene.grid.size;
    const copy = await stampTemplate(scene, template, { x: state.x + (2 * grid), y: state.y }, { heading: state.heading, name: name ?? `${group.name} copy` });
    return getGroup(scene, copy.id);
}

/** Save a group on the scene as a template in the library. */
export async function saveGroupToLibrary(scene, groupId) {
    const template = exportGroup(scene, groupId);
    // A picture of the group as it is now. Without a canvas, or if drawing it fails, the entry is saved without one.
    const thumbnail = await makeThumbnail(scene, getGroup(scene, groupId));
    if (thumbnail) template.thumbnail = thumbnail;
    return saveTemplate(template);
}

/** Read a template from JSON text (an exported file) into the library. */
export async function importTemplate(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        throw new Error(`Puppeteer: that file is not JSON (${error.message})`);
    }
    validateTemplate(parsed);
    // A category named in the file is the one of that name here, made if there is none.
    const { category: named, ...template } = parsed;
    const id = await saveTemplate(template);
    if (typeof named === 'string' && named.trim()) {
        const found = readCategories().find((candidate) => sameName(candidate.name, named));
        await setTemplateCategory(id, found?.id ?? await createCategory(named));
    }
    return id;
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
    // A name already on the scene is not used twice: the new group is "Wagon 2", and so is its token.
    const group = await createGroup(scene, point, { name: uniqueGroupName(scene, name ?? source.name), heading });
    const anchor = { ...group.applied };
    const stamped = stampMembers(source, anchor);

    const byType = new Map();
    stamped.forEach((entry, index) => {
        if (!byType.has(entry.type)) byType.set(entry.type, []);
        byType.get(entry.type).push({ index, data: entry.data });
    });
    // Each part is given its id before it is made, because Foundry does not promise to hand the documents back in the
    // order they were given, and a part tied to the wrong document is moved to another part's place.
    const created = new Array(stamped.length);
    try {
        for (const type of MEMBER_TYPES) {
            const items = byType.get(type);
            if (!items) continue;
            for (const item of items) item.data._id = foundry.utils.randomID();
            await scene.createEmbeddedDocuments(type, items.map((item) => item.data), { keepId: true });
            for (const item of items) created[item.index] = { id: item.data._id, documentName: type };
        }
    } catch (error) {
        // Do not leave half a stamp behind: remove what was made and the empty group, then say what went wrong.
        for (const doc of created.filter(Boolean)) await scene.deleteEmbeddedDocuments(doc.documentName, [doc.id]).catch(() => {});
        await deleteGroup(scene, group.id).catch(() => {});
        throw error;
    }

    // The template's own offsets are exactly what the stamp used, so they are the new group's offsets.
    const members = source.members.map(({ data, ...offsets }, index) => ({ ...structuredClone(offsets), id: created[index].id }));
    // How the original behaved comes with it, with its events pointed at this stamp's own tiles.
    await patchGroup(scene, group.id, { members, applied: anchor, ...stampBehaviour(source.behaviour, members.map((member) => member.id), anchor.heading) });
    utils.postConsoleAndNotification(MODULE_NAME, `Stamped "${source.name}" with ${members.length} member(s)`, { groupId: group.id, anchor }, true, false);

    // The group stands without a body if the actor is not in this world (a template from another world, or an
    // actor since deleted): say so, and leave the stamp as it is. The GM can give it one from the editor.
    if (source.body) {
        if (game.actors.get(source.body.actorId)) {
            await setBody(scene, group.id, source.body.actorId, { linked: source.body.linked, name: group.name });
        } else {
            getBlacksmith().toast.show({
                title: 'No body for this group',
                subtitle: `${source.body.actorName ?? 'The actor'} is not in this world, so the stamped group cannot be targeted. Drop an actor on its body row to fix that.`,
                icon: 'fa-solid fa-user-shield',
                channel: TOAST_CHANNEL,
                duration: 8
            });
        }
    }
    playCue();
    return getGroup(scene, group.id);
}
