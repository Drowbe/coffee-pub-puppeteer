// Group records live in one scene flag, keyed by group id. An anchor points at its record; it does not hold
// the data. Writes are narrow (one dotted path per group) so two writers touching different fields of the
// same group do not overwrite each other.
import { MODULE_ID, BLACKSMITH_ID } from './constants.js';

const FLAG = 'groups';

export const flagPath = (groupId) => `flags.${MODULE_ID}.${FLAG}.${groupId}`;

export function getGroups(scene) {
    return scene.getFlag(MODULE_ID, FLAG) ?? {};
}

export function getGroup(scene, groupId) {
    return getGroups(scene)[groupId] ?? null;
}

/** Create a group record, or replace every field of an existing one. */
export function saveGroup(scene, group) {
    return scene.update({ [flagPath(group.id)]: foundry.utils.deepClone(group) });
}

/** Change only the fields in `patch` (top-level keys of the record; arrays are replaced whole). */
export function patchGroup(scene, groupId, patch) {
    return scene.update({ [flagPath(groupId)]: foundry.utils.deepClone(patch) });
}

/**
 * Whether a scene update could have changed what the Group Editor or the overlay shows: a change to Puppeteer's
 * flags (a group made, changed or deleted, in any of the shapes Foundry reports a deletion in) or to Blacksmith's
 * (its pins). Deliberately wide: an unneeded redraw costs nothing, a missed one leaves a deleted group on screen.
 */
export function groupsTouched(changes) {
    const flags = changes?.flags;
    if (!flags || typeof flags !== 'object') return false;
    return [MODULE_ID, `-=${MODULE_ID}`, BLACKSMITH_ID, `-=${BLACKSMITH_ID}`].some((key) => key in flags);
}

export function deleteGroupRecord(scene, groupId) {
    return scene.update({ [`flags.${MODULE_ID}.${FLAG}.-=${groupId}`]: null });
}
