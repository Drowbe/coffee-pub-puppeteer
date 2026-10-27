// Riders: tokens a group carries. A rider is recorded like a member, as an offset from the pin in the pin's frame, so it
// is carried when the group moves or turns. Unlike a member it can be moved by hand, anywhere inside the group:
// that re-records where it sits. Moved outside the group, it has left, and it is no longer carried.
//
// Pure helpers and the one write the follower makes; the operations that change a group are in groups.js and the
// hooks that notice a rider moving by hand are in boarding.js.
import { memberExtent, toFrame, fromFrame, normAngle } from './geometry.js';
import { SIZED } from './body.js';

// The flag on a rider's token that says which group carries it.
export const RIDER_FLAG = 'riderOf';

// The flag on a token that was dismounted on purpose and is still on the group: it stays off until it has left and come back.
export const STAYED_FLAG = 'stayed';

/** What the follower tells Foundry when it carries a rider: jump there, ignoring walls and speed, and say it was us. */
export const riderMove = () => ({ teleport: true, animate: false, puppeteer: { follower: true } });

const gridSize = (scene) => ({ x: scene.grid.sizeX ?? scene.grid.size, y: scene.grid.sizeY ?? scene.grid.size });

/** The middle of a token's footprint, in scene pixels. */
export function tokenCentre(scene, source) {
    const grid = gridSize(scene);
    return { x: source.x + ((source.width ?? 1) * grid.x) / 2, y: source.y + ((source.height ?? 1) * grid.y) / 2 };
}

/**
 * The box that holds the group's sized members, in the pin's own frame (so it does not turn). With nothing sized in
 * the group it is one square on the pin. Riders are inside the group when their middle is inside this box.
 * @returns {{x0: number, x1: number, y0: number, y1: number}}
 */
export function footprintBox(scene, group, anchor = group.applied) {
    const points = [];
    for (const member of group.members) {
        if (!SIZED.includes(member.type)) continue;
        const doc = scene.getEmbeddedCollection(member.type).get(member.id);
        if (doc) points.push(...memberExtent(member.type, doc._source));
    }
    if (!points.length) {
        const grid = gridSize(scene);
        return { x0: -grid.x / 2, x1: grid.x / 2, y0: -grid.y / 2, y1: grid.y / 2 };
    }
    const framed = points.map((point) => toFrame(point, anchor));
    const xs = framed.map((f) => f.dx);
    const ys = framed.map((f) => f.dy);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

// How opaque a pixel of a tile's picture must be to count as part of the group. Foundry's own hit test uses 0.25 for its
// outlines; a tile whose own alpha threshold is higher keeps that.
const SOLID_ALPHA = 0.25;

/**
 * Whether a scene point is on a solid part of the group: on a pixel of a tile's picture that is not transparent, or inside
 * a drawing or region. `null` when it cannot be told (the scene is not the one on screen, or no tile has been drawn
 * yet), so the caller falls back to the box.
 */
function onSolid(scene, group, point, anchor) {
    let judged = 0;
    for (const member of group.members) {
        if (member.type === 'Tile') {
            const doc = scene.getEmbeddedCollection('Tile').get(member.id);
            if (!doc) continue;
            const mesh = canvas.scene === scene ? canvas.tiles?.get(member.id)?.mesh : null;
            if (typeof mesh?.containsCanvasPoint !== 'function') return null;
            judged++;
            const threshold = Math.max(SOLID_ALPHA, doc._source.texture?.alphaThreshold ?? 0);
            if (mesh.containsCanvasPoint(point, threshold)) return true;
        } else if (member.type === 'Drawing' || member.type === 'Region') {
            const doc = scene.getEmbeddedCollection(member.type).get(member.id);
            if (!doc) continue;
            const framed = memberExtent(member.type, doc._source).map((corner) => toFrame(corner, anchor));
            if (!framed.length) continue;
            judged++;
            const f = toFrame(point, anchor);
            const xs = framed.map((c) => c.dx);
            const ys = framed.map((c) => c.dy);
            if (f.dx >= Math.min(...xs) && f.dx <= Math.max(...xs) && f.dy >= Math.min(...ys) && f.dy <= Math.max(...ys)) return true;
        }
    }
    return judged ? false : null;
}

/**
 * Whether a scene point is inside the group: inside the box that holds its sized members and, unless the group has
 * `solidOnly` turned off, on a solid part of them, so the transparent corners of a picture do not count.
 */
export function insideGroup(scene, group, point, anchor = group.applied) {
    const box = footprintBox(scene, group, anchor);
    const f = toFrame(point, anchor);
    if (!(f.dx >= box.x0 && f.dx <= box.x1 && f.dy >= box.y0 && f.dy <= box.y1)) return false;
    if (group.solidOnly === false) return true;
    return onSolid(scene, group, point, anchor) ?? true;
}

/** Record a token as a rider of a group whose pin is at `anchor`: where its middle sits in the pin's frame. */
export function captureRider(scene, tokenId, source, anchor) {
    const f = toFrame(tokenCentre(scene, source), anchor);
    return { tokenId, dx: f.dx, dy: f.dy, drot: normAngle((source.rotation ?? 0) - anchor.heading) };
}

/** The update that puts a rider where its record says, for a pin at `anchor`. */
export function riderUpdate(scene, rider, source, anchor) {
    const grid = gridSize(scene);
    const middle = fromFrame(rider, anchor);
    return {
        _id: rider.tokenId,
        x: Math.round(middle.x - ((source.width ?? 1) * grid.x) / 2),
        y: Math.round(middle.y - ((source.height ?? 1) * grid.y) / 2),
        rotation: normAngle(anchor.heading + rider.drot)
    };
}

/**
 * Carry a group's riders to where the pin now is. A rider whose token is gone is left out of what comes back.
 * @returns {Promise<{riders: object[], carried: number}>} The riders still on the scene.
 */
export async function carryRiders(scene, group, anchor, glide) {
    const riders = group.riders ?? [];
    if (!riders.length) return { riders, carried: 0 };
    const present = riders.filter((rider) => scene.tokens.get(rider.tokenId));
    const updates = present.map((rider) => riderUpdate(scene, rider, scene.tokens.get(rider.tokenId)._source, anchor));
    if (updates.length) {
        const options = riderMove();
        if (glide) options.puppeteer.glide = glide;
        await scene.updateEmbeddedDocuments('Token', updates, options);
    }
    return { riders: present, carried: updates.length };
}
