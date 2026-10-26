// Damage levels. A group with a token (see body.js) has hit points through that token's actor. When those hit points move
// the group from one health level to another, the rules of the group for that level run: play a sound, run a macro, or
// show a different picture on one of its tiles (a cart that becomes a wreck).
//
// The levels are Blacksmith's own (healthy, injured, bloodied, critical, dead), so a group reads as hurt at the same line
// as every other Coffee Pub module, and the GM sets those lines once, in Blacksmith. Blacksmith's "hurt" is a scratch, not
// a level of its own, so it counts as healthy.
import { MODULE_ID } from './constants.js';
import { getBlacksmith } from './blacksmith.js';
import { getGroup, getGroups, patchGroup } from './store.js';
import { runExclusive } from './follower.js';
import { bodyToken } from './body.js';
import { fireEvent } from './events.js';

/**
 * The level of a token's actor, or null when its hit points cannot be read.
 * @returns {null|{level: string, percent: number}}
 */
export function healthOf(token) {
    const api = getBlacksmith();
    const actor = token?.actor;
    if (!actor) return null;
    const percent = api.getHealthPercent(actor);
    if (percent === null || percent === undefined) return null;
    const severity = api.getHealthSeverity(percent);
    return { level: severity === 'hurt' || !severity ? 'healthy' : severity, percent };
}

/**
 * Look at a group's token and, if its health level has changed since last looked at, remember the new one and run the
 * group's rules for it. A big hit that skips a level runs only the level it landed on.
 */
export function evaluateHealth(scene, groupId) {
    return runExclusive(scene, groupId, async () => {
        const group = getGroup(scene, groupId);
        if (!group?.body) return;
        const health = healthOf(bodyToken(scene, group));
        if (!health) return;
        const before = group.healthLevel ?? 'healthy';
        if (health.level === before) return;
        await patchGroup(scene, groupId, health.level === 'healthy' ? { '-=healthLevel': null } : { healthLevel: health.level });
        await fireEvent(scene, getGroup(scene, groupId), 'health', { level: health.level, from: before, percent: health.percent });
    });
}

/** Groups on a scene whose token is this token, or this actor's. */
function watchers(scene, test) {
    return Object.values(getGroups(scene)).filter((group) => group.body && test(group.body));
}

export function registerHealth() {
    const { HookManager } = getBlacksmith();
    const watch = (scene, test) => {
        if (!scene || !game.users.activeGM?.isSelf) return;
        for (const group of watchers(scene, test)) {
            evaluateHealth(scene, group.id).catch((error) => console.error(`${MODULE_ID}: health of group ${group.id} failed`, error));
        }
    };

    // An unlinked token keeps its own hit points on the token; a linked one shares its actor's.
    HookManager.registerHook({
        name: 'updateToken',
        description: 'Puppeteer: a group\'s token was hurt or healed',
        context: MODULE_ID,
        priority: 3,
        key: `${MODULE_ID}-health-token`,
        // Only a change to the token's own actor data can change its hit points.
        callback: (token, changes) => {
            if (!foundry.utils.hasProperty(changes ?? {}, 'delta') && !foundry.utils.hasProperty(changes ?? {}, 'actorData')) return;
            watch(token.parent, (body) => body.tokenId === token.id);
        }
    });
    HookManager.registerHook({
        name: 'updateActor',
        description: 'Puppeteer: the actor of a group\'s token was hurt or healed',
        context: MODULE_ID,
        priority: 3,
        key: `${MODULE_ID}-health-actor`,
        callback: (actor) => {
            for (const scene of game.scenes) watch(scene, (body) => body.actorId === actor.id);
        }
    });
}
