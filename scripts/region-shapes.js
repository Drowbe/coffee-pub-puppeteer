// Regions in a group. A region has no position of its own: it holds a list of shapes, and each shape has its
// own geometry. Moving a region means moving every shape, so a region member records one entry per shape.
// Pure, with no Foundry globals, so it runs under Node for testing.
//
// What v14 regions are made of (common/data/data.mjs), and how each is carried:
//   rectangle  x, y is the anchor point (anchorX, anchorY are fractions of its size), turns about it
//   ellipse    x, y is the centre, turns about it
//   cone       x, y is the origin, turns about it
//   line       x, y is the origin, turns about it
//   circle     x, y is the centre, no rotation
//   ring       x, y is the centre, no rotation
//   polygon    absolute points, and an optional origin; carried point by point
//   emanation  a base shape grown by a radius; carried through its base
//   token, grid  tied to a token's footprint or to grid cells; cannot be turned freely, so not carried
//
// Every shape that has a rotation turns clockwise like everything else in Foundry, so it is recorded the same
// way as a light: its own rotation relative to the group's heading.
import { normAngle, rotate, toFrame, fromFrame } from './frame.js';

export class UnsupportedMemberError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UnsupportedMemberError';
    }
}

const pose = (shape, anchor) => ({ ...toFrame(shape, anchor), drot: (shape.rotation ?? 0) - anchor.heading });
const point = (shape, anchor) => toFrame(shape, anchor);

const CAPTURE = {
    rectangle: pose,
    ellipse: pose,
    cone: pose,
    line: pose,
    circle: point,
    ring: point,
    polygon(shape, anchor) {
        const pts = [];
        for (let i = 0; i < shape.points.length; i += 2) {
            const f = toFrame({ x: shape.points[i], y: shape.points[i + 1] }, anchor);
            pts.push(f.dx, f.dy);
        }
        const record = { pts };
        if (shape.origin) {
            const o = toFrame(shape.origin, anchor);
            record.origin = { dx: o.dx, dy: o.dy };
        }
        return record;
    },
    emanation: (shape, anchor) => ({ base: captureShape(shape.base, anchor) })
};

function captureShape(shape, anchor) {
    const capture = CAPTURE[shape?.type];
    if (!capture) throw new UnsupportedMemberError(`a ${shape?.type ?? 'shape'} shape cannot be turned or carried`);
    return { type: shape.type, ...capture(shape, anchor) };
}

const placed = (record, anchor) => {
    const p = fromFrame(record, anchor);
    return { x: p.x, y: p.y };
};
const placedAndTurned = (record, anchor) => ({ ...placed(record, anchor), rotation: normAngle(anchor.heading + record.drot) });

const APPLY = {
    rectangle: placedAndTurned,
    ellipse: placedAndTurned,
    cone: placedAndTurned,
    line: placedAndTurned,
    circle: placed,
    ring: placed,
    polygon(record, anchor) {
        const points = [];
        for (let i = 0; i < record.pts.length; i += 2) {
            const p = fromFrame({ dx: record.pts[i], dy: record.pts[i + 1] }, anchor);
            points.push(p.x, p.y);
        }
        const fields = { points };
        if (record.origin) fields.origin = placed(record.origin, anchor);
        return fields;
    },
    emanation: (record, anchor, shape) => ({ base: { ...shape.base, ...applyShape(record.base, shape.base, anchor) } })
};

// A record only applies to a shape of the same type; if the shape was swapped for another, leave it be (the
// edit is picked up as a hand edit and the region is re-recorded).
function applyShape(record, shape, anchor) {
    if (!record || record.type !== shape?.type) return {};
    return APPLY[record.type](record, anchor, shape);
}

/** Record every shape of a region. Throws UnsupportedMemberError for a shape that cannot be carried. */
export function captureShapes(data, anchor) {
    return { shapes: (data.shapes ?? []).map((shape) => captureShape(shape, anchor)) };
}

/** The `shapes` array that puts a region where it belongs for `anchor`. */
export function applyShapes(member, data, anchor) {
    return {
        shapes: (data.shapes ?? []).map((shape, i) => ({ ...shape, ...applyShape(member.shapes?.[i], shape, anchor) }))
    };
}

// The corners of a rectangle that hangs from an anchor point and turns about it.
function hung(x, y, width, height, ax, ay, rotation) {
    return [[-ax, -ay], [1 - ax, -ay], [1 - ax, 1 - ay], [-ax, 1 - ay]].map(([fx, fy]) => {
        const r = rotate(fx * width, fy * height, rotation);
        return { x: x + r.x, y: y + r.y };
    });
}

const around = (x, y, rx, ry, rotation = 0) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const r = rotate(sx * rx, sy * ry, rotation);
    return { x: x + r.x, y: y + r.y };
});

function shapeExtent(shape) {
    switch (shape.type) {
        case 'rectangle':
            return hung(shape.x, shape.y, shape.width, shape.height, shape.anchorX ?? 0, shape.anchorY ?? 0, shape.rotation ?? 0);
        case 'ellipse':
            return around(shape.x, shape.y, shape.radiusX, shape.radiusY, shape.rotation ?? 0);
        case 'circle':
            return around(shape.x, shape.y, shape.radius, shape.radius);
        case 'ring':
            return around(shape.x, shape.y, shape.radius + (shape.outerWidth ?? 0), shape.radius + (shape.outerWidth ?? 0));
        case 'cone': {
            const half = (shape.angle ?? 0) / 2;
            const tip = (degrees) => {
                const r = rotate(shape.radius, 0, degrees);
                return { x: shape.x + r.x, y: shape.y + r.y };
            };
            const rotation = shape.rotation ?? 0;
            return [{ x: shape.x, y: shape.y }, tip(rotation - half), tip(rotation), tip(rotation + half)];
        }
        case 'line': {
            const half = (shape.width ?? 0) / 2;
            return [[0, -half], [shape.length, -half], [shape.length, half], [0, half]].map(([fx, fy]) => {
                const r = rotate(fx, fy, shape.rotation ?? 0);
                return { x: shape.x + r.x, y: shape.y + r.y };
            });
        }
        case 'polygon': {
            const points = [];
            for (let i = 0; i < shape.points.length; i += 2) points.push({ x: shape.points[i], y: shape.points[i + 1] });
            return points;
        }
        case 'emanation': {
            const base = shapeExtent(shape.base);
            if (!base.length) return [];
            const xs = base.map((p) => p.x);
            const ys = base.map((p) => p.y);
            const r = shape.radius ?? 0;
            return [
                { x: Math.min(...xs) - r, y: Math.min(...ys) - r }, { x: Math.max(...xs) + r, y: Math.min(...ys) - r },
                { x: Math.max(...xs) + r, y: Math.max(...ys) + r }, { x: Math.min(...xs) - r, y: Math.max(...ys) + r }
            ];
        }
        default:
            return [];
    }
}

/** The points that mark where a region is: its shapes' corners and vertices. */
export function shapesExtent(data) {
    return (data.shapes ?? []).flatMap(shapeExtent);
}
