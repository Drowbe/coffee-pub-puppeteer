// Group templates: a portable snapshot of a group, kept apart from any scene so it can be stamped onto a
// scene any number of times. Pure, with no Foundry globals, so it runs under Node for testing.
//
// A template holds, for every member, the same offsets a group record holds (relative to the pivot, in the
// pivot's own frame, so the template has no heading of its own) plus a snapshot of the member's document
// data. Stamping builds fresh creation data for a chosen pivot and heading, so two stamps are two
// independent copies.
import { MEMBER_TYPES, memberUpdate } from './geometry.js';

// Version 2: a Tile's offset is its anchor point (x, y), as Foundry v14 defines it. Version 1 files recorded the
// middle of its rectangle measured from a top-left x, y, which stamps a tile half its size out.
export const TEMPLATE_VERSION = 2;

// Fields that belong to the source document or the source scene and must not travel:
//   _id, _stats  identity and bookkeeping of the original
//   levels       ids of the source scene's Levels, meaningless on another scene (empty means every level)
const OMIT = ['_id', '_stats', 'levels'];

const withoutOmitted = (data) => {
    const copy = structuredClone(data);
    for (const key of OMIT) delete copy[key];
    return copy;
};

// What a copy keeps of how its original behaves: everything the Behaviour and Events sections set, and how far it has been
// resized. Absent from a group means the default, so only what is set travels.
export const BEHAVIOUR = Object.freeze(['ease', 'ridersFree', 'mountable', 'announce', 'facesTravel', 'front', 'solidOnly', 'snap', 'scale', 'events']);

/**
 * The behaviour of a group, for a template. An event that changes the picture of one of the group's tiles names that
 * tile by its place in the template's member list, because the tile's own id means nothing on another scene.
 */
function behaviourOf(group, indexOf) {
    const behaviour = {};
    for (const key of BEHAVIOUR) if (group[key] !== undefined) behaviour[key] = structuredClone(group[key]);
    if (behaviour.events) {
        behaviour.events = behaviour.events.flatMap((rule) => {
            if (rule.do !== 'image') return [rule];
            const index = indexOf.get(rule.target);
            if (index === undefined) return [];
            const { target, ...rest } = rule;
            return [{ ...rest, targetIndex: index }];
        });
        if (!behaviour.events.length) delete behaviour.events;
    }
    return behaviour;
}

/**
 * The behaviour a template holds, for the group made from it: events that change a tile are pointed at the tile that was
 * made for it. `ids` are the ids of the new members, in the template's order.
 */
export function stampBehaviour(behaviour, ids) {
    const stamped = structuredClone(behaviour ?? {});
    // Groups saved before turning was always on may carry these; they do nothing now.
    delete stamped.rotates;
    delete stamped.fixedHeading;
    if (stamped.events) {
        stamped.events = stamped.events.flatMap((rule) => {
            if (rule.targetIndex === undefined) return [rule];
            const { targetIndex, ...rest } = rule;
            return ids[targetIndex] ? [{ ...rest, target: ids[targetIndex] }] : [];
        });
        if (!stamped.events.length) delete stamped.events;
    }
    return stamped;
}

/**
 * Snapshot a group.
 * @param {object} group    A group record from the store.
 * @param {Map<string, object>} sources  Source data of the members' documents, keyed `${type}:${id}`.
 *                          A member with no entry (its document is gone) is left out.
 * @param {{actorId: string, actorName?: string, linked?: boolean}} [body]  The actor the group represents, if any.
 *                          Only the actor travels: the body token is made again, to fit, on every stamp.
 * @returns {object} The template.
 */
export function buildTemplate(group, sources, body) {
    const members = [];
    const indexOf = new Map();
    for (const member of group.members) {
        const source = sources.get(`${member.type}:${member.id}`);
        if (!source) continue;
        const { id, ...offsets } = member;
        indexOf.set(member.id, members.length);
        members.push({ ...structuredClone(offsets), data: withoutOmitted(source) });
    }
    const behaviour = behaviourOf(group, indexOf);
    return {
        version: TEMPLATE_VERSION,
        name: group.name,
        anchorType: group.anchor.type,
        ...(body ? { body: { ...body } } : {}),
        ...(Object.keys(behaviour).length ? { behaviour } : {}),
        members
    };
}

/** Throw a descriptive error unless `template` is one this version can stamp. */
export function validateTemplate(template) {
    const fail = (reason) => { throw new Error(`Puppeteer: not a usable template (${reason})`); };
    if (!template || typeof template !== 'object') fail('not an object');
    if (template.version !== TEMPLATE_VERSION) fail(`version ${template.version}, expected ${TEMPLATE_VERSION}`);
    if (!Array.isArray(template.members)) fail('no members list');
    if (template.body !== undefined && typeof template.body?.actorId !== 'string') fail('its body names no actor');
    if (template.behaviour !== undefined && (typeof template.behaviour !== 'object' || template.behaviour === null)) fail('its behaviour is not an object');
    if (template.thumbnail !== undefined && !(typeof template.thumbnail === 'string' && template.thumbnail.startsWith('data:image/'))) fail('its thumbnail is not an image');
    template.members.forEach((member, i) => {
        if (!MEMBER_TYPES.includes(member?.type)) fail(`member ${i} has an unsupported type`);
        if (!member.data || typeof member.data !== 'object') fail(`member ${i} has no data`);
        const placed = member.type === 'Wall'
            ? Array.isArray(member.c) && member.c.length === 4 && member.c.every(Number.isFinite)
            : member.type === 'Region'
                ? Array.isArray(member.shapes)
                : Number.isFinite(member.dx) && Number.isFinite(member.dy);
        if (!placed) fail(`member ${i} has no position`);
    });
    return template;
}

/**
 * Creation data for every member of a template, placed for a pivot and heading.
 * @param {object} template
 * @param {{x: number, y: number, heading: number}} anchor  Where the pivot goes and which way it faces.
 * @returns {{type: string, data: object}[]}  Feed each to `createEmbeddedDocuments(type, [data])`.
 */
export function stampMembers(template, anchor) {
    validateTemplate(template);
    return template.members.map((member) => {
        const data = structuredClone(member.data);
        Object.assign(data, memberUpdate(member, data, anchor));
        return { type: member.type, data };
    });
}
