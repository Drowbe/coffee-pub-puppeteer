// Pure geometry for grouped movement. No Foundry globals, so it runs under Node for testing.
//
// An anchor is { x, y, heading }: the anchor's centre in scene pixels and its heading in degrees,
// clockwise, 0 facing down (Foundry's rotation convention). Members store their position as an offset
// from the anchor's centre in the anchor's own frame, so applying a move is one rotation and one
// translation computed from the anchor's committed state, never an accumulation of deltas.
import { normAngle, rotate, toFrame, fromFrame } from './frame.js';
import { captureShapes, applyShapes, shapesExtent, shapeOutlines, shapesOutOfStep, scaleShapesRecord, scaleShapesData, UnsupportedMemberError } from './region-shapes.js';

export { normAngle, rotate, toFrame, fromFrame, UnsupportedMemberError };

export const MEMBER_TYPES = Object.freeze(['Tile', 'Drawing', 'AmbientLight', 'AmbientSound', 'Wall', 'Note', 'Region']);

export function sameAnchor(a, b, epsilon = 1e-6) {
    return !!a && !!b
        && Math.abs(a.x - b.x) < epsilon
        && Math.abs(a.y - b.y) < epsilon
        && Math.abs(normAngle(a.heading) - normAngle(b.heading)) < epsilon;
}

// Integer fields in Foundry reject a fraction, so positions are rounded before they are written. Every
// position is computed from the stored offsets, so the rounding never accumulates.
const whole = Math.round;

// A Drawing's position is the top-left of an unrotated box that turns about its centre.
//
// A Tile is different, and in Foundry v14 it is the one that is easy to get wrong: its `x, y` is where its
// texture anchor sits (the centre by default, the top-left if the anchor is 0, 0), and it turns about that
// point. So a Tile's pose is just a point and a heading, like a light; its width, height and anchor only
// matter for drawing its outline (see memberExtent).
const boxSize = {
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
    region: {
        capture: (type, data, anchor) => captureShapes(data, anchor),
        apply: (type, member, data, anchor) => applyShapes(member, data, anchor)
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

const kindOf = { Tile: 'point', Drawing: 'box', AmbientLight: 'point', AmbientSound: 'point', Note: 'point', Wall: 'wall', Region: 'region' };

function handler(type) {
    const kind = kindOf[type];
    if (!kind) throw new Error(`Puppeteer: ${type} cannot be a group member`);
    return handlers[kind];
}

/**
 * The points that mark the extent of a member in the scene: a tile's or drawing's four corners (turned about
 * the point each one turns about), a wall's two ends, or a single point for the rest.
 * @param {string} type
 * @param {object} data  The document's source data.
 * @returns {{x: number, y: number}[]}
 */
export function memberExtent(type, data) {
    if (type === 'Region') return shapesExtent(data);
    if (type === 'Wall') {
        const [x1, y1, x2, y2] = data.c;
        return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    }
    if (type === 'Tile') {
        // The rectangle hangs from the anchor point (x, y): the anchor is a fraction of the width and height.
        const ax = data.texture?.anchorX ?? 0.5;
        const ay = data.texture?.anchorY ?? 0.5;
        const width = data.width ?? 0;
        const height = data.height ?? 0;
        return [[-ax, -ay], [1 - ax, -ay], [1 - ax, 1 - ay], [-ax, 1 - ay]].map(([fx, fy]) => {
            const r = rotate(fx * width, fy * height, data.rotation ?? 0);
            return { x: data.x + r.x, y: data.y + r.y };
        });
    }
    if (kindOf[type] === 'box') {
        const { width, height } = boxSize[type](data);
        const cx = data.x + width / 2;
        const cy = data.y + height / 2;
        return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
            const r = rotate((sx * width) / 2, (sy * height) / 2, data.rotation ?? 0);
            return { x: cx + r.x, y: cy + r.y };
        });
    }
    return [{ x: data.x, y: data.y }];
}

/**
 * The outlines to draw for a member: one list of points for most types, one per shape for a region.
 * @returns {{x: number, y: number}[][]}
 */
export function memberOutlines(type, data) {
    if (type === 'Region') return shapeOutlines(data);
    const extent = memberExtent(type, data);
    return extent.length ? [extent] : [];
}

/** Whether a member's record no longer fits its document (only a region's shapes can change that way). */
export function memberOutOfStep(member, data) {
    return member.type === 'Region' && shapesOutOfStep(member, data);
}

/** The centre of the box that holds every point. */
export function extentCentre(points) {
    if (!points.length) throw new Error('Puppeteer: no points to centre');
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/**
 * The group's oriented bounding box: the smallest rectangle, turned with the group, that holds every point.
 * @param {{x: number, y: number}[]} points
 * @param {{x: number, y: number, heading: number}} anchor
 * @returns {{corners: {x: number, y: number}[], width: number, height: number, centre: {x: number, y: number}}}
 */
export function groupBounds(points, anchor) {
    if (!points.length) throw new Error('Puppeteer: no points to bound');
    const framed = points.map((p) => toFrame(p, anchor));
    const xs = framed.map((f) => f.dx);
    const ys = framed.map((f) => f.dy);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([dx, dy]) => fromFrame({ dx, dy }, anchor));
    return { corners, width: x1 - x0, height: y1 - y0, centre: fromFrame({ dx: (x0 + x1) / 2, dy: (y0 + y1) / 2 }, anchor) };
}

/** Record a document as a member of a group anchored at `anchor`.
 * @param {string} type   One of MEMBER_TYPES.
 * @param {string} id     The embedded document id on the anchor's scene.
 * @param {object} data   The document's source data (`doc._source` or `doc.toObject()`).
 * @param {object} anchor { x, y, heading } at capture time.
 * @returns {object}      The member record, `{ type, id, ... }`.
 */
export function captureMember(type, id, data, anchor) {
    return { type, id, ...handler(type).capture(type, data, anchor) };
}

// ---- comparing poses ---------------------------------------------------------------------------------

const turnedApart = (a, b) => {
    const d = Math.abs((((a - b) % 360) + 360) % 360);
    return Math.min(d, 360 - d) > 0.5;
};

// Whether two values of a region's shapes differ by more than a pixel (or half a degree for a rotation).
function shapesDiffer(a, b, key = '') {
    if (typeof a === 'number' && typeof b === 'number') {
        return key.endsWith('rotation') ? turnedApart(a, b) : !(Math.abs(a - b) <= 1);
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return true;
        return a.some((value, i) => shapesDiffer(value, b[i], key));
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        return [...keys].some((k) => shapesDiffer(a[k], b[k], k));
    }
    return a !== b;
}

/** Whether a document's saved pose differs from the pose an update asked for (a pixel, half a degree). */
export function poseDiffers(wanted, actual) {
    const off = (a, b) => !(Math.abs(a - b) <= 1);
    return ('x' in wanted && off(actual.x, wanted.x))
        || ('y' in wanted && off(actual.y, wanted.y))
        || ('rotation' in wanted && turnedApart(actual.rotation, wanted.rotation))
        || (!!wanted.c && wanted.c.some((value, i) => off(actual.c[i], value)))
        || (!!wanted.shapes && shapesDiffer(wanted.shapes, actual.shapes));
}

const maxDelta = (a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b);
    if (Array.isArray(a) && Array.isArray(b)) return a.reduce((m, v, i) => Math.max(m, maxDelta(v, b[i])), 0);
    if (a && b && typeof a === 'object' && typeof b === 'object') return Object.keys(a).reduce((m, k) => Math.max(m, maxDelta(a[k], b[k])), 0);
    return 0;
};

/** How far a document is, in pixels, from the pose an update asked for. For diagnosis. */
export function poseOffset(type, expected, actual) {
    if (type === 'Wall') return Math.max(...expected.c.map((v, i) => Math.abs(v - actual.c[i])));
    if (type === 'Region') return maxDelta(expected.shapes, actual.shapes);
    return Math.hypot(expected.x - actual.x, expected.y - actual.y);
}

// ---- resizing -----------------------------------------------------------------------------------------------------------

// A pixel size that Foundry keeps whole.
const wholeAtLeast1 = (value) => Math.max(1, Math.round(value));

/**
 * What resizing a member by `factor` about the pivot does: its record with every offset multiplied (so it sits `factor`
 * times as far from the pivot), and the fields of the document that are lengths, multiplied. The caller writes the
 * fields together with `memberUpdate` of the new record.
 * @param {object} member  A record from captureMember.
 * @param {object} data    The document's source data.
 * @param {number} factor
 * @returns {{record: object, data: object, fields: object}}  The scaled record, the document data with its lengths scaled
 *   (for `memberUpdate`), and the length fields to write.
 */
export function scaleMember(member, data, factor) {
    switch (member.type) {
        case 'Tile': {
            const width = (data.width ?? 0) * factor;
            const height = (data.height ?? 0) * factor;
            return { record: scaleOffsets(member, factor), data: { ...data, width, height }, fields: { width, height } };
        }
        case 'Drawing': {
            const shape = { ...(data.shape ?? {}) };
            for (const key of ['width', 'height', 'radius']) if (typeof shape[key] === 'number') shape[key] = Math.round(shape[key] * factor);
            if (Array.isArray(shape.points)) shape.points = shape.points.map((v) => v * factor);
            const fields = { shape };
            if (typeof data.strokeWidth === 'number') fields.strokeWidth = wholeAtLeast1(data.strokeWidth * factor);
            if (typeof data.fontSize === 'number') fields.fontSize = wholeAtLeast1(data.fontSize * factor);
            return { record: scaleOffsets(member, factor), data: { ...data, ...fields }, fields };
        }
        case 'AmbientLight': {
            const config = { ...(data.config ?? {}) };
            for (const key of ['dim', 'bright']) if (typeof config[key] === 'number') config[key] *= factor;
            return { record: scaleOffsets(member, factor), data: { ...data, config }, fields: { config: { dim: config.dim, bright: config.bright } } };
        }
        case 'AmbientSound': {
            const radius = typeof data.radius === 'number' ? data.radius * factor : data.radius;
            return { record: scaleOffsets(member, factor), data: { ...data, radius }, fields: typeof radius === 'number' ? { radius } : {} };
        }
        case 'Wall':
            return { record: { ...member, c: member.c.map((v) => v * factor) }, data, fields: {} };
        case 'Note':
            return { record: scaleOffsets(member, factor), data, fields: {} };
        case 'Region': {
            const scaled = scaleShapesData(data, factor);
            return { record: scaleShapesRecord(member, factor), data: scaled, fields: {} };
        }
        default:
            throw new Error(`Puppeteer: ${member.type} cannot be a group member`);
    }
}

const scaleOffsets = (member, factor) => ({ ...member, dx: member.dx * factor, dy: member.dy * factor });

/** Re-record a member against a new anchor, keeping anything of the member's that is not geometry (its name). */
export function recaptureMember(member, data, anchor) {
    const fresh = captureMember(member.type, member.id, data, anchor);
    return member.label ? { ...fresh, label: member.label } : fresh;
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
