// One-time repairs to group records written by an earlier version.
//
// Version 2: a Tile member's offset was recorded for the middle of its rectangle measured from its x, y as a
// top-left corner. In Foundry v14 a tile's x, y is where its texture anchor sits (the centre by default), so
// those records were half a tile out and the first move or turn threw the tile across the scene. Each such
// tile is re-recorded from where it is now.
import { getBlacksmith } from './blacksmith.js';
import { MODULE_ID, MODULE_NAME } from './constants.js';
import { recaptureMember } from './geometry.js';
import { runExclusive } from './follower.js';
import { getGroup, getGroups, patchGroup } from './store.js';

export const GROUP_VERSION = 2;

/** Bring every group on every scene up to the current record version. Only the active GM writes. */
export async function migrateGroups() {
    if (!game.users.activeGM?.isSelf) return 0;
    const { utils } = getBlacksmith();
    let migrated = 0;
    for (const scene of game.scenes) {
        for (const group of Object.values(getGroups(scene))) {
            if ((group.version ?? 1) >= GROUP_VERSION) continue;
            await runExclusive(scene, group.id, async () => {
                const current = getGroup(scene, group.id);
                if (!current || (current.version ?? 1) >= GROUP_VERSION) return;
                const anchor = { ...current.applied };
                const members = current.members.map((member) => {
                    if (member.type !== 'Tile') return member;
                    const doc = scene.getEmbeddedCollection('Tile').get(member.id);
                    return doc ? recaptureMember(member, doc._source, anchor) : member;
                });
                await patchGroup(scene, group.id, { members, version: GROUP_VERSION });
            });
            migrated += 1;
            utils.postConsoleAndNotification(MODULE_NAME, `Updated the saved layout of group "${group.name}" on ${scene.name} to match Foundry v14 tiles`, { module: MODULE_ID }, false, false);
        }
    }
    return migrated;
}
