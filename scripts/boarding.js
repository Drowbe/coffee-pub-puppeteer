// Boarding: noticing what happens to riders and to tokens dropped on a group. Only the active GM acts.
//
//   A rider is moved by hand (a player drags their own token)  Inside the group, where it now sits is where it
//                                                              rides; outside, it has left and is let go.
//   A token moves onto a group that lets tokens board          It boards. This is how most riders get on.
//   A token is created on such a group                         It boards. Dropping an actor on the map over a
//                                                              group is the other way a rider gets on.
import { MODULE_ID, MODULE_NAME, TOAST_CHANNEL } from './constants.js';
import { getBlacksmith } from './blacksmith.js';
import { getGroup, getGroups, patchGroup } from './store.js';
import { runExclusive } from './follower.js';
import { mountTokens, releaseRider } from './groups.js';
import { RIDER_FLAG, STAYED_FLAG, captureRider, insideGroup, tokenCentre, riderUpdate, riderMove } from './riders.js';

// What counts as a rider being moved: where it is, which way it faces, and how big it is.
const MOVED = ['x', 'y', 'rotation', 'width', 'height'];

const report = (what) => (error) => {
    console.error(`${MODULE_ID}: ${what} failed`, error);
    getBlacksmith().utils.postConsoleAndNotification(MODULE_NAME, `${what} failed: ${error.message}`, null, false, true);
};

export function registerBoarding() {
    const { HookManager } = getBlacksmith();

    HookManager.registerHook({
        name: 'updateToken',
        description: 'Puppeteer: a rider moved by hand stays aboard where it was put, or is let go if it left the group',
        context: MODULE_ID,
        priority: 3,
        key: `${MODULE_ID}-rider-moved`,
        callback: (token, changes, options) => {
            if (!game.users.activeGM?.isSelf) return;
            if (options?.puppeteer?.follower) return;
            if (!MOVED.some((field) => field in changes)) return;
            const groupId = token.getFlag(MODULE_ID, RIDER_FLAG);
            const scene = token.parent;
            if (!scene) return;
            if (groupId) {
                runExclusive(scene, groupId, () => riderMoved(scene, groupId, token.id)).catch(report('Updating a rider'));
                return;
            }
            // Not a rider: if it moved (not merely turned) onto a group that lets tokens board, it boards.
            if (!('x' in changes || 'y' in changes)) return;
            walkedOn(scene, token);
        }
    });

    HookManager.registerHook({
        name: 'createToken',
        description: 'Puppeteer: a token created on a group that lets riders board becomes a rider',
        context: MODULE_ID,
        priority: 3,
        key: `${MODULE_ID}-rider-boards`,
        callback: (token, options) => {
            if (!game.users.activeGM?.isSelf) return;
            if (options?.puppeteer) return;
            // A body, and anything already aboard something, is not boarding.
            if (token.getFlag(MODULE_ID, 'groupId') || token.getFlag(MODULE_ID, RIDER_FLAG)) return;
            const scene = token.parent;
            if (!scene) return;
            board(scene, token);
        }
    });
}

/** The group, if any, that lets tokens board and has this token's middle inside it. */
function groupUnder(scene, token) {
    const middle = tokenCentre(scene, token._source);
    return Object.values(getGroups(scene)).find((candidate) => candidate.mountable && insideGroup(scene, candidate, middle)) ?? null;
}

function board(scene, token) {
    const group = groupUnder(scene, token);
    if (!group) return;
    mountTokens(scene, group.id, [token]).then(({ mounted }) => {
        if (mounted) getBlacksmith().toast.show({ title: 'Boarded', subtitle: `${token.name} is riding ${group.name}.`, icon: 'fa-solid fa-person-walking-luggage', channel: TOAST_CHANNEL, duration: 5 });
    }).catch(report('Boarding'));
}

/** A token that is not a rider moved. A body never boards; a token let go on purpose stays off until it has left and come back. */
function walkedOn(scene, token) {
    if (token.getFlag(MODULE_ID, 'groupId')) return;
    const group = groupUnder(scene, token);
    const stayed = token.getFlag(MODULE_ID, STAYED_FLAG);
    if (stayed) {
        // Still on the group it was let go from: stay off. Anywhere else, it is free to board again.
        if (group?.id === stayed) return;
        token.update({ [`flags.${MODULE_ID}.-=${STAYED_FLAG}`]: null }, { puppeteer: { follower: true } }).catch(report('Updating a token'));
    }
    if (group) board(scene, token);
}

/** A rider was moved by hand. Runs inside the group's queue. */
async function riderMoved(scene, groupId, tokenId) {
    const group = getGroup(scene, groupId);
    const token = scene.tokens.get(tokenId);
    const rider = group?.riders?.find((r) => r.tokenId === tokenId);
    if (!group || !token || !rider) return;

    const anchor = { ...group.applied };
    // A group whose riders may not wander puts a rider back where it rides.
    if (group.ridersFree === false) {
        const { _id, ...back } = riderUpdate(scene, rider, token._source, anchor);
        await token.update(back, riderMove());
        return;
    }
    if (insideGroup(scene, group, tokenCentre(scene, token._source), anchor)) {
        const riders = group.riders.map((r) => (r.tokenId === tokenId ? captureRider(scene, tokenId, token._source, anchor) : r));
        await patchGroup(scene, groupId, { riders });
        return;
    }
    await releaseRider(scene, groupId, tokenId);
    getBlacksmith().toast.show({ title: 'Dismounted', subtitle: `${token.name} left ${group.name}.`, icon: 'fa-solid fa-person-walking', channel: TOAST_CHANNEL, duration: 5 });
}
