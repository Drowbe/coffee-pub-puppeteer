// Pure geometry for grouped movement. No Foundry globals, so it runs under Node for testing.
//
// An anchor is { x, y, heading }: the anchor's centre in scene pixels and its heading in degrees,
// clockwise, 0 facing down (Foundry's rotation convention). Members store their position as an offset
// from the anchor's centre in the anchor's own frame, so applying a move is one rotation and one
// translation computed from the anchor's committed state, never an accumulation of deltas.

export const MEMBER_TYPES = Object.freeze(['Tile', 'Drawing', 'AmbientLight', 'AmbientSound', 'Wall', 'Note']);

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

export function sameAnchor(a, b, epsilon = 1e-6) {
    return !!a && !!b
        && Math.abs(a.x - b.x) < epsilon
        && Math.abs(a.y - b.y) < epsilon
        && Math.abs(normAngle(a.heading) - normAngle(b.heading)) < epsilon;
}

// Integer fields in Foundry reject a fraction, so positions are rounded before they are written. Every
// position is computed from the stored offsets, so the rounding never accumulates.
const whole = Math.round;

// A box position (Tile, Drawing) is the top-left of an unrotated box that turns about its centre.
const boxSize = {
    Tile: (data) => ({ width: data.width, height: data.height }),
    Drawing: (data) => ({ width: data.shape?.width ?? 0, height: data.shape?.height ?? 0 })
};

// Which position fields are integers. Drawing x and y are not.
const integerPosition = { Tile: true, Drawing: false, AmbientLight: true, AmbientSound: true, Note: true };

// The field that carries a member's own heading, for the types that have one.
const headingField = { Tile: 'rotation', Drawing: 'rotation', AmbientLight: 'rotation' };

const handlers = {
    box: {
        capture(type, data, anchor) {
            const { width, height } = boxSize[type](data);
            const off = toFrame({ x: data.x + width / 2, y: data.y + height / 2 }, anchor);
            return { ...off, drot: (data.rotation ?? 0) - anchor.heading };
        },
        apply(type, member, data, anchor) {
            const { width, height } = boxSize[type](data);
            const c = fromFrame(member, anchor);
            const x = c.x - width / 2;
            const y = c.y - height / 2;
            return {
                x: integerPosition[type] ? whole(x) : x,
                y: integerPosition[type] ? whole(y) : y,
                rotation: normAngle(anchor.heading + member.drot)
            };
        }
    },
    point: {
        capture(type, data, anchor) {
            const off = toFrame({ x: data.x, y: data.y }, anchor);
            const field = headingField[type];
            return field ? { ...off, drot: (data[field] ?? 0) - anchor.heading } : off;
        },
        apply(type, member, data, anchor) {
            const p = fromFrame(member, anchor);
            const update = { x: whole(p.x), y: whole(p.y) };
            const field = headingField[type];
            if (field) update[field] = normAngle(anchor.heading + member.drot);
            return update;
        }
    },
    wall: {
        capture(type, data, anchor) {
            const [x1, y1, x2, y2] = data.c;
            const a = toFrame({ x: x1, y: y1 }, anchor);
            const b = toFrame({ x: x2, y: y2 }, anchor);
            return { c: [a.dx, a.dy, b.dx, b.dy] };
        },
        apply(type, member, data, anchor) {
            const [ax, ay, bx, by] = member.c;
            const a = fromFrame({ dx: ax, dy: ay }, anchor);
            const b = fromFrame({ dx: bx, dy: by }, anchor);
            return { c: [whole(a.x), whole(a.y), whole(b.x), whole(b.y)] };
        }
    }
};

const kindOf = { Tile: 'box', Drawing: 'box', AmbientLight: 'point', AmbientSound: 'point', Note: 'point', Wall: 'wall' };

function handler(type) {
    const kind = kindOf[type];
    if (!kind) throw new Error(`Puppeteer: ${type} cannot be a group member`);
    return handlers[kind];
}

/**
 * Record a document as a member of a group anchored at `anchor`.
 * @param {string} type   One of MEMBER_TYPES.
 * @param {string} id     The embedded document id on the anchor's scene.
 * @param {object} data   The document's source data (`doc._source` or `doc.toObject()`).
 * @param {object} anchor { x, y, heading } at capture time.
 * @returns {object}      The member record, `{ type, id, ... }`.
 */
export function captureMember(type, id, data, anchor) {
    return { type, id, ...handler(type).capture(type, data, anchor) };
}

/**
 * The update that puts a member where it belongs for `anchor`.
 * @param {object} member  A record from captureMember.
 * @param {object} data    The member document's current source data (needed for a box's size).
 * @param {object} anchor  { x, y, heading }, from committed state.
 * @returns {object}       Fields to merge into an `updateEmbeddedDocuments` entry, without `_id`.
 */
export function memberUpdate(member, data, anchor) {
    return handler(member.type).apply(member.type, member, data, anchor);
}
