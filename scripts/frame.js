// The frame of a group: where its pivot is and which way it faces. Pure, with no Foundry globals.
//
// An anchor is { x, y, heading }: the pivot in scene pixels and its heading in degrees, clockwise, 0 facing
// down (Foundry's rotation convention). Members are stored as offsets from the pivot in the pivot's own
// frame, so applying a move is one rotation and one translation, never an accumulation of deltas.

export const normAngle = (degrees) => ((degrees % 360) + 360) % 360;

/** Rotate a vector clockwise by `degrees` in y-down screen space. */
export function rotate(x, y, degrees) {
    const r = (degrees * Math.PI) / 180;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    return { x: x * cos - y * sin, y: x * sin + y * cos };
}

/** A scene point as an offset from the anchor's centre, in the anchor's frame (heading zero). */
export function toFrame(point, anchor) {
    const o = rotate(point.x - anchor.x, point.y - anchor.y, -anchor.heading);
    return { dx: o.x, dy: o.y };
}

/** The scene point for an offset in the anchor's frame. */
export function fromFrame(offset, anchor) {
    const p = rotate(offset.dx, offset.dy, anchor.heading);
    return { x: anchor.x + p.x, y: anchor.y + p.y };
}
