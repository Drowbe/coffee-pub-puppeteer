// The body token: an optional token that makes a group targetable. It is a layer of the group, never the grip.
//
// It is made from an actor, wears a transparent image (set on the placed token only, so the actor's own art is
// untouched), is locked so nobody drags it, and is sized and placed to cover the group. The follower moves it with
// `teleport: true`, because a plain update is refused for a locked token. See
// documentation/architecture/architecture-groups.md.
import { MODULE_ID, TOAST_CHANNEL } from './constants.js';
import { getBlacksmith } from './blacksmith.js';
import { memberExtent } from './geometry.js';
import { getGroup } from './store.js';

export const TRANSPARENT_IMAGE = `modules/${MODULE_ID}/images/transparent.png`;

// A light or a sound has a position and no size, so it says nothing about how big the group is. A note is the same.
export const SIZED = ['Tile', 'Drawing', 'Wall', 'Region'];

// The smallest a body is allowed to be, in grid squares, so a group of one thin wall still has something to click.
const MIN_SQUARES = 0.5;

// What the follower tells Foundry when it moves the body: jump there, ignoring walls and speed, and say it was us.
// A new object every time: Foundry writes its own fields onto the options it is given, so a shared or frozen one fails.
export const bodyMove = () => ({ teleport: true, animate: false, puppeteer: { follower: true } });

const round = (value, places) => Math.round(value * (10 ** places)) / (10 ** places);

/**
 * Where the body goes: the axis-aligned box that holds every sized member as it sits now, as token data
 * (`x`, `y` the top-left in pixels, `width` and `height` in grid squares). With nothing sized in the group it
 * is a small square on the pivot.
 */
export function bodyFootprint(scene, group) {
    const sizeX = scene.grid.sizeX ?? scene.grid.size;
    const sizeY = scene.grid.sizeY ?? scene.grid.size;
    const points = [];
    for (const member of group.members) {
        if (!SIZED.includes(member.type)) continue;
        const doc = scene.getEmbeddedCollection(member.type).get(member.id);
        if (doc) points.push(...memberExtent(member.type, doc._source));
    }
    if (!points.length) {
        const at = group.applied;
        return { x: round(at.x - (sizeX * MIN_SQUARES) / 2, 0), y: round(at.y - (sizeY * MIN_SQUARES) / 2, 0), width: MIN_SQUARES, height: MIN_SQUARES };
    }
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return {
        x: round(left, 0),
        y: round(top, 0),
        width: Math.max(MIN_SQUARES, round((Math.max(...xs) - left) / sizeX, 3)),
        height: Math.max(MIN_SQUARES, round((Math.max(...ys) - top) / sizeY, 3))
    };
}

/** The body token of a group, or null when it has none or the token is gone. */
export function bodyToken(scene, group) {
    return (group?.body && scene.tokens.get(group.body.tokenId)) || null;
}

const differs = (a, b) => (
    Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5
    || Math.abs(a.width - b.width) > 0.001 || Math.abs(a.height - b.height) > 0.001
);

/**
 * Move and size a group's body to cover the group as it is now. Call after anything that changes where the sized
 * members are or which ones there are. Only the active GM calls this; it does nothing when the body is already
 * right.
 */
export async function fitBody(scene, groupId) {
    const group = getGroup(scene, groupId);
    const token = bodyToken(scene, group);
    if (!token) return;
    const wanted = bodyFootprint(scene, group);
    const now = token._source;
    if (!differs(wanted, now)) return;
    await token.update(wanted, bodyMove());
    getBlacksmith().utils.postConsoleAndNotification('PUPPETEER', `Group "${group.name}": body fitted`, wanted, true, false);
}

/**
 * The token data that makes a token a body: transparent, locked, no vision, and flagged as the group's. Everything
 * else (name, bars, disposition, the actor) is whatever the token already has or the actor gives it.
 */
export function bodyTraits(groupId) {
    return {
        texture: { src: TRANSPARENT_IMAGE },
        locked: true,
        rotation: 0,
        sight: { enabled: false },
        flags: { [MODULE_ID]: { groupId, body: true } }
    };
}

/**
 * Keep a group's token locked. Foundry's own Lock control (the token HUD, and an update from a macro) would unlock it,
 * and then it could be dragged away from its group; the unlock is refused here, on the client making it, with a word on
 * why. The group's own writes carry `puppeteer` in their options and are left alone, so the token still follows its group.
 * To unlock it, take it off the group with Remove Token.
 */
export function registerBodyLock() {
    const { HookManager, toast } = getBlacksmith();
    HookManager.registerHook({
        name: 'preUpdateToken',
        description: 'Puppeteer: a group\'s token stays locked',
        context: MODULE_ID,
        priority: 3,
        key: `${MODULE_ID}-body-stays-locked`,
        canCancel: true,
        callback: (token, changes, options) => {
            if (options?.puppeteer) return;
            if (changes?.locked !== false || !token.getFlag(MODULE_ID, 'body')) return;
            toast.show({
                title: 'Token locked by its group',
                subtitle: `${token.name} is the token of a group, and stays locked so it cannot be dragged away from it. Use Remove Token on the group to free it.`,
                icon: 'fa-solid fa-lock',
                channel: TOAST_CHANNEL,
                duration: 6
            });
            return false;
        }
    });
}
