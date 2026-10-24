// Where a group hangs from. A group's anchor is a pin (set pieces, phase 1) or a token (a vehicle someone
// pilots, phase 2). Either way the rest of Puppeteer asks one question: where is the pivot, and which way is
// the group facing? Both answers come from committed state, never from a position that is still animating.
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
 * The pivot and heading of a group's anchor right now, or null when the anchor is gone.
 * @returns {{x: number, y: number, heading: number}|null}
 */
export function anchorState(scene, group) {
    if (group.anchor.type === 'pin') {
        const pin = getBlacksmith().pins.get(group.anchor.id, { sceneId: scene.id });
        // A pin's heading is its own `rotation`: Blacksmith turns it with Shift + wheel and reports 0 when it never was.
        return pin ? { x: pin.x, y: pin.y, heading: pin.rotation ?? 0 } : null;
    }
    if (group.anchor.type === 'token') {
        const token = scene.tokens.get(group.anchor.id);
        return token ? tokenAnchorState(scene, token._source) : null;
    }
    return null;
}

export const anchorExists = (scene, group) => anchorState(scene, group) !== null;
