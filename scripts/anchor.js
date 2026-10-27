// Where a group hangs from. The grip of a group is always a pin: the rest of Puppeteer asks one question, where is
// the pivot and which way is the group facing, and the answer comes from the pin as stored, never from a position
// that is still being dragged. The token branch below reads groups saved before that was so; migrate.js gives each
// of them a pin, and nothing creates a token-anchored group any more.
import { getBlacksmith } from './blacksmith.js';
import { normAngle } from './frame.js';

/**
 * A token's pivot is the middle of its footprint, and its heading is its rotation. Read from `_source`: in
 * v14 the document's own `x`, `y` and `rotation` lag the committed values while a move animates.
 */
export function tokenAnchorState(scene, source) {
    const grid = scene.grid;
    return {
        x: source.x + ((source.width ?? 1) * (grid.sizeX ?? grid.size)) / 2,
        y: source.y + ((source.height ?? 1) * (grid.sizeY ?? grid.size)) / 2,
        heading: source.rotation ?? 0
    };
}

/**
 * Which way a group faces. Normally the way its pin faces. A group set not to turn with its pin keeps the heading it
 * had when that was chosen (`fixedHeading`), whatever its pin is turned to.
 */
export function headingOf(group, pinRotation) {
    return group.rotates === false ? (group.fixedHeading ?? 0) : (pinRotation ?? 0);
}

// A move shorter than this many squares does not turn a group that faces its travel: a nudge is not a journey.
const FACING_MIN_SQUARES = 0.25;

/**
 * The heading a group that faces its direction of travel takes when its pin has moved from `from` to `to`, or null when
 * it should keep the heading its pin has: the group does not face its travel, does not turn with its pin, the pin was
 * turned by hand as well as moved, or the move was too small to be a direction.
 * Heading is Foundry's rotation, so 0 is facing down the map. A group's `front` is which way its picture's front points,
 * as the clockwise turn from down: 0 for a picture whose front is its bottom (a token's is), 90 where it is its left
 * side, 180 its top, 270 its right. The group faces the way it is going when its front leads.
 * @param {object} group
 * @param {{x: number, y: number, heading: number}} from  Where the group was (its `applied`).
 * @param {{x: number, y: number, heading: number}} to    Where its pin is now.
 * @param {number} grid  The size of a square, in scene pixels.
 * @returns {number|null}  Degrees, two decimals (which is what a pin keeps).
 */
export function travelHeading(group, from, to, grid) {
    if (!group.facesTravel || group.rotates === false) return null;
    // Compared round the circle: 359.99 and 0.01 are a fiftieth of a degree apart, not nearly a full turn.
    const apart = Math.abs(normAngle(from.heading) - normAngle(to.heading));
    if (Math.min(apart, 360 - apart) > 0.01) return null;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.hypot(dx, dy) < FACING_MIN_SQUARES * grid) return null;
    // The way of travel for a picture whose front is the bottom, less the turn that brings its real front to the bottom.
    const degrees = ((Math.atan2(-dx, dy) * 180) / Math.PI) - (Number(group.front) || 0);
    return Math.round(normAngle(degrees) * 100) / 100;
}

/**
 * The pivot and heading of a group's anchor right now, or null when the anchor is gone.
 * @returns {{x: number, y: number, heading: number}|null}
 */
export function anchorState(scene, group) {
    if (group.anchor.type === 'pin') {
        const pin = getBlacksmith().pins.get(group.anchor.id, { sceneId: scene.id });
        // A pin's heading is its own `rotation`: Blacksmith turns it with Shift + wheel and reports 0 when it never was.
        return pin ? { x: pin.x, y: pin.y, heading: headingOf(group, pin.rotation) } : null;
    }
    if (group.anchor.type === 'token') {
        const token = scene.tokens.get(group.anchor.id);
        return token ? tokenAnchorState(scene, token._source) : null;
    }
    return null;
}

export const anchorExists = (scene, group) => anchorState(scene, group) !== null;
