// One-time repairs to group records written by an earlier version.
//
// Version 2: a Tile member's offset was recorded for the middle of its rectangle measured from its x, y as a
// top-left corner. In Foundry v14 a tile's x, y is where its texture anchor sits (the centre by default), so
// those records were half a tile out and the first move or turn threw the tile across the scene. Each such
// tile is re-recorded from where it is now.
//
// Version 3: a pin group's heading moved from its record to the pin's own rotation.
//
// Version 4: the grip is always a pin. A group that followed a token is given a pin where the token's centre was,
// every member is re-recorded against it (nothing moves), and the token is left exactly as it was, an ordinary
// token. Making it the group's body would change its image, so that is left to the GM.
import { getBlacksmith } from './blacksmith.js';
import { MODULE_ID, MODULE_NAME, TOAST_CHANNEL } from './constants.js';
import { recaptureMember, normAngle } from './geometry.js';
import { runExclusive } from './follower.js';
import { getGroup, getGroups, patchGroup } from './store.js';
import { detachToPin } from './groups.js';

export const GROUP_VERSION = 4;

/** Bring every group on every scene up to the current record version. Only the active GM writes. */
export async function migrateGroups() {
    if (!game.users.activeGM?.isSelf) return 0;
    const { utils, pins, toast } = getBlacksmith();
    let migrated = 0;
    const moved = [];
    for (const scene of game.scenes) {
        for (const group of Object.values(getGroups(scene))) {
            if ((group.version ?? 1) >= GROUP_VERSION) continue;
            // Version 4. This takes the group's own queue, so it is done before the one below.
            if (group.anchor.type === 'token') {
                const token = scene.tokens.get(group.anchor.id);
                try {
                    await detachToPin(scene, group.id);
                    moved.push(group.name);
                    utils.postConsoleAndNotification(MODULE_NAME, `Group "${group.name}" on ${scene.name} followed ${token?.name ?? 'a token that is gone'}; it now hangs from a pin where that was`, null, false, false);
                } catch (error) {
                    console.error(`${MODULE_ID}: could not move group ${group.id} off its token`, error);
                    utils.postConsoleAndNotification(MODULE_NAME, `Could not move "${group.name}" off its token: ${error.message}`, null, false, true);
                    continue;
                }
            }
            await runExclusive(scene, group.id, async () => {
                const current = getGroup(scene, group.id);
                if (!current || (current.version ?? 1) >= GROUP_VERSION) return;
                const anchor = { ...current.applied };
                const before = current.version ?? 1;
                // Version 2: tiles were recorded as if x, y were a top-left corner.
                const members = before >= 2 ? current.members : current.members.map((member) => {
                    if (member.type !== 'Tile') return member;
                    const doc = scene.getEmbeddedCollection('Tile').get(member.id);
                    return doc ? recaptureMember(member, doc._source, anchor) : member;
                });
                // Version 3: a pin group's heading used to live in its record; now it is the pin's own rotation. Hand
                // the saved heading to a pin that has never been turned, so the group does not swing back to zero.
                if (before < 3 && current.anchor.type === 'pin' && normAngle(current.heading ?? 0) > 0.005) {
                    const pin = pins.get(current.anchor.id, { sceneId: scene.id });
                    if (pin && (pin.rotation ?? 0) === 0) {
                        await pins.update(pin.id, { rotation: normAngle(current.heading) }, { sceneId: scene.id });
                    }
                }
                await patchGroup(scene, group.id, { members, version: GROUP_VERSION });
            });
            migrated += 1;
            utils.postConsoleAndNotification(MODULE_NAME, `Updated the saved layout of group "${group.name}" on ${scene.name} for this version`, { module: MODULE_ID }, false, false);
        }
    }
    if (moved.length) {
        toast.show({
            title: moved.length === 1 ? 'A group now hangs from a pin' : `${moved.length} groups now hang from pins`,
            subtitle: `${moved.join(', ')} used to follow a token. Each now hangs from a pin where the token was; the tokens are unchanged. To make a group something that can be attacked, give it an actor in the Group Editor.`,
            icon: 'fa-solid fa-thumbtack',
            channel: TOAST_CHANNEL,
            duration: 15
        });
    }
    return migrated;
}
