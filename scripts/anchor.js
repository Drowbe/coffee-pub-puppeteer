// Where a group hangs from. The grip of a group is always a pin: the rest of Puppeteer asks one question, where is
// the pivot and which way is the group facing, and the answer comes from the pin as stored, never from a position
// that is still being dragged. The token branch below reads groups saved before that was so; migrate.js gives each
// of them a pin, and nothing creates a token-anchored group any more.
import { getBlacksmith } from './blacksmith.js';

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
