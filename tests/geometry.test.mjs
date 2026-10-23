// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    MEMBER_TYPES, normAngle, rotate, toFrame, fromFrame, sameAnchor, captureMember, memberUpdate, memberExtent, extentCentre
} from '../scripts/geometry.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} is not within ${eps} of ${b}`);

// A small deterministic generator, so a failure is reproducible.
function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test('normAngle wraps into 0..360', () => {
    assert.equal(normAngle(0), 0);
    assert.equal(normAngle(360), 0);
    assert.equal(normAngle(-90), 270);
    assert.equal(normAngle(725), 5);
});

test('rotate turns clockwise in y-down space: right becomes down', () => {
    const p = rotate(1, 0, 90);
    near(p.x, 0);
    near(p.y, 1);
    const q = rotate(0, 1, 90);
    near(q.x, -1);
    near(q.y, 0);
});

test('toFrame and fromFrame are inverses', () => {
    const r = rng(1);
    for (let i = 0; i < 200; i++) {
        const anchor = { x: r() * 5000, y: r() * 5000, heading: r() * 720 - 360 };
        const point = { x: r() * 5000, y: r() * 5000 };
        const back = fromFrame(toFrame(point, anchor), anchor);
        near(back.x, point.x, 1e-6);
        near(back.y, point.y, 1e-6);
    }
});

test('a member keeps its distance from the anchor whatever the heading', () => {
    const r = rng(2);
    const at = { x: 1000, y: 1000, heading: 0 };
    const m = captureMember('AmbientSound', 's1', { x: 1200, y: 1000 }, at);
    for (let i = 0; i < 200; i++) {
        const anchor = { x: r() * 9000, y: r() * 9000, heading: r() * 360 };
        const u = memberUpdate(m, {}, anchor);
        // Rounding may move the point by up to half a pixel on each axis.
        assert.ok(Math.abs(Math.hypot(u.x - anchor.x, u.y - anchor.y) - 200) < 1);
    }
});

test('capture then apply at the same anchor reproduces every member type', () => {
    const anchor = { x: 2000, y: 3000, heading: 37 };
    const cases = [
        ['Tile', { x: 2100, y: 2900, width: 200, height: 100, rotation: 15 }],
        ['Drawing', { x: 1500, y: 2600, shape: { width: 300, height: 120 }, rotation: 200 }],
        ['AmbientLight', { x: 2400, y: 3300, rotation: 90 }],
        ['AmbientSound', { x: 1800, y: 3100 }],
        ['Note', { x: 2050, y: 3500 }],
        ['Wall', { c: [1900, 2800, 2300, 2800] }]
    ];
    for (const [type, data] of cases) {
        const u = memberUpdate(captureMember(type, 'id', data, anchor), data, anchor);
        if (data.c) assert.deepEqual(u.c, data.c, type);
        else {
            near(u.x, data.x, 1);
            near(u.y, data.y, 1);
            if ('rotation' in data) near(u.rotation, normAngle(data.rotation), 1e-9);
        }
    }
});

test('moving and rotating the anchor carries a tile rigidly', () => {
    const start = { x: 1000, y: 1000, heading: 0 };
    // A 100 by 100 tile with the default (centred) anchor: x, y is its centre, 200 px to the right of the pivot.
    const data = { x: 1200, y: 1000, width: 100, height: 100, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } };
    const m = captureMember('Tile', 't', data, start);

    // Turn the pivot 90 degrees clockwise and move it: the tile is now 200 px below it, turned with it.
    const u = memberUpdate(m, data, { x: 5000, y: 4000, heading: 90 });
    near(u.x, 5000, 1);
    near(u.y, 4200, 1);
    near(u.rotation, 90);
});

test('a tile moves as a rigid body whatever its anchor', () => {
    const start = { x: 2000, y: 2000, heading: 20 };
    const next = { x: 7000, y: 1000, heading: 135 };
    for (const [ax, ay] of [[0.5, 0.5], [0, 0], [1, 0.5], [0.2, 0.8]]) {
        const data = { x: 2300, y: 2100, width: 600, height: 250, rotation: 35, texture: { anchorX: ax, anchorY: ay } };
        const before = memberExtent('Tile', data);
        const member = captureMember('Tile', 't', data, start);
        const after = memberExtent('Tile', { ...data, ...memberUpdate(member, data, next) });

        // The same rigid motion applied to the original corners: turn by the change of heading about the old
        // pivot, then carry the pivot to the new one.
        const turn = next.heading - start.heading;
        before.forEach((corner, i) => {
            const r = rotate(corner.x - start.x, corner.y - start.y, turn);
            near(after[i].x, next.x + r.x, 1.5);
            near(after[i].y, next.y + r.y, 1.5);
        });
    }
});

test('a tile with no anchor data is treated as centred, the v14 default', () => {
    const corners = memberExtent('Tile', { x: 100, y: 100, width: 40, height: 20, rotation: 0 });
    assert.deepEqual(corners.map((c) => [c.x, c.y]), [[80, 90], [120, 90], [120, 110], [80, 110]]);
});

test('a wall turns about the anchor centre', () => {
    const start = { x: 0, y: 0, heading: 0 };
    const data = { c: [100, 0, 100, 200] };
    const m = captureMember('Wall', 'w', data, start);
    const u = memberUpdate(m, data, { x: 0, y: 0, heading: 90 });
    // (100,0) -> (0,100) and (100,200) -> (-200,100)
    assert.deepEqual(u.c, [0, 100, -200, 100]);
});

test('integer fields are written as integers, a Drawing position is not', () => {
    const anchor = { x: 0.5, y: 0.5, heading: 33.3 };
    const data = { x: 123.4, y: 567.8, width: 51, height: 77, rotation: 1 };
    for (const type of ['Tile', 'AmbientLight', 'AmbientSound', 'Note']) {
        const d = type === 'Tile' ? data : { x: data.x, y: data.y, rotation: 1 };
        const u = memberUpdate(captureMember(type, 'i', d, { x: 10, y: 10, heading: 0 }), d, anchor);
        assert.ok(Number.isInteger(u.x) && Number.isInteger(u.y), type);
    }
    const drawing = { x: 10, y: 10, shape: { width: 33, height: 21 }, rotation: 0 };
    const du = memberUpdate(captureMember('Drawing', 'd', drawing, { x: 0, y: 0, heading: 0 }), drawing, anchor);
    assert.ok(!Number.isInteger(du.x) || !Number.isInteger(du.y));

    const wall = { c: [10, 10, 99, 10] };
    const wu = memberUpdate(captureMember('Wall', 'w', wall, { x: 0, y: 0, heading: 0 }), wall, anchor);
    assert.ok(wu.c.every(Number.isInteger));
});

test('there is no drift: wandering the anchor and coming back restores the original', () => {
    const r = rng(3);
    const start = { x: 1000, y: 1000, heading: 20 };
    const data = { x: 1300, y: 1100, width: 100, height: 100, rotation: 20 };
    const m = captureMember('Tile', 't', data, start);
    for (let i = 0; i < 5000; i++) memberUpdate(m, data, { x: r() * 9000, y: r() * 9000, heading: r() * 360 });
    const u = memberUpdate(m, data, start);
    near(u.x, data.x, 1);
    near(u.y, data.y, 1);
    near(u.rotation, 20, 1e-9);
});

test('sameAnchor compares position and normalised heading', () => {
    assert.ok(sameAnchor({ x: 1, y: 2, heading: 0 }, { x: 1, y: 2, heading: 360 }));
    assert.ok(!sameAnchor({ x: 1, y: 2, heading: 0 }, { x: 1, y: 2, heading: 1 }));
    assert.ok(!sameAnchor(null, { x: 1, y: 2, heading: 0 }));
});

test('a type that cannot be a member is refused', () => {
    assert.throws(() => captureMember('Token', 'x', {}, { x: 0, y: 0, heading: 0 }), /cannot be a group member/);
    assert.deepEqual([...MEMBER_TYPES].sort(), ['AmbientLight', 'AmbientSound', 'Drawing', 'Note', 'Tile', 'Wall']);
});

test('a tile hangs from its anchor point: its corners follow the anchor, and turn about it', () => {
    const at = (ax, ay, rotation = 0) => memberExtent('Tile', { x: 300, y: 250, width: 400, height: 100, rotation, texture: { anchorX: ax, anchorY: ay } });

    // Centred anchor: x, y is the middle of the rectangle.
    assert.deepEqual(at(0.5, 0.5).map((p) => [Math.round(p.x), Math.round(p.y)]), [[100, 200], [500, 200], [500, 300], [100, 300]]);
    // Top-left anchor: x, y is the top-left corner.
    assert.deepEqual(at(0, 0).map((p) => [Math.round(p.x), Math.round(p.y)]), [[300, 250], [700, 250], [700, 350], [300, 350]]);

    // Turned 90 degrees about a centred anchor it stands up in place: 100 wide, 400 tall, same centre.
    const upright = at(0.5, 0.5, 90);
    const c = extentCentre(upright);
    near(c.x, 300, 1e-6);
    near(c.y, 250, 1e-6);
    near(Math.max(...upright.map((p) => p.y)) - Math.min(...upright.map((p) => p.y)), 400, 1e-6);
    near(Math.max(...upright.map((p) => p.x)) - Math.min(...upright.map((p) => p.x)), 100, 1e-6);

    // Turned 90 degrees about a top-left anchor it swings about that corner, which does not move.
    const swung = at(0, 0, 90);
    assert.ok(swung.some((p) => Math.hypot(p.x - 300, p.y - 250) < 1e-6));
});

test('walls report their ends and point types report their point', () => {
    assert.deepEqual(memberExtent('Wall', { c: [0, 10, 30, 50] }), [{ x: 0, y: 10 }, { x: 30, y: 50 }]);
    assert.deepEqual(memberExtent('AmbientLight', { x: 7, y: 9, rotation: 0 }), [{ x: 7, y: 9 }]);
    assert.deepEqual(memberExtent('Drawing', { x: 0, y: 0, shape: { width: 10, height: 20 }, rotation: 0 }).length, 4);
});

test('extentCentre is the middle of the bounding box, not the average of the points', () => {
    // Three points bunched at one end: the average would sit near them, the box centre does not.
    const c = extentCentre([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 100, y: 20 }]);
    assert.deepEqual(c, { x: 50, y: 10 });
    assert.throws(() => extentCentre([]), /no points/);
});

test('re-anchoring on the extent centre leaves every member where it already is', () => {
    const old = { x: 0, y: 0, heading: 37 };
    const data = [
        ['Tile', { x: 1000, y: 800, width: 600, height: 300, rotation: 20 }],
        ['AmbientLight', { x: 900, y: 700, rotation: 40 }],
        ['Wall', { c: [1500, 900, 1700, 900] }]
    ];
    const members = data.map(([type, d]) => captureMember(type, type, d, old));
    // Put each member at its recorded place for the old anchor, then re-anchor on the centre of what is there.
    const placed = members.map((m, i) => ({ ...data[i][1], ...memberUpdate(m, data[i][1], old) }));
    const points = placed.flatMap((d, i) => memberExtent(data[i][0], d));
    const c = extentCentre(points);
    const anchor = { x: Math.round(c.x), y: Math.round(c.y), heading: old.heading };
    const again = data.map(([type], i) => captureMember(type, type, placed[i], anchor));
    // Applying the new records for the new anchor reproduces the same placement.
    again.forEach((m, i) => {
        const u = memberUpdate(m, placed[i], anchor);
        if (u.c) assert.deepEqual(u.c, placed[i].c);
        else { near(u.x, placed[i].x, 1); near(u.y, placed[i].y, 1); }
    });
});

test('the group bounds turn with the group and hold every point', async () => {
    const { groupBounds } = await import('../scripts/geometry.js');
    // A 400 x 100 strip lying along x, anchored at its left end, then the whole group faced 90 degrees.
    const points = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 100 }, { x: 0, y: 100 }];
    const flat = groupBounds(points, { x: 0, y: 0, heading: 0 });
    near(flat.width, 400, 1e-6);
    near(flat.height, 100, 1e-6);
    near(flat.centre.x, 200, 1e-6);
    near(flat.centre.y, 50, 1e-6);

    // Face the anchor 90 degrees: the same points now sit in a frame turned a quarter, so the box that hugs them
    // in that frame is 100 wide and 400 tall, and its corners are still the points' extremes.
    const turned = groupBounds(points, { x: 0, y: 0, heading: 90 });
    near(turned.width, 100, 1e-6);
    near(turned.height, 400, 1e-6);
    for (const p of points) {
        const inside = turned.corners.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 1e-6);
        assert.ok(inside, 'a corner of the box is a corner of the strip');
    }
    near(turned.centre.x, 200, 1e-6);
    near(turned.centre.y, 50, 1e-6);
    assert.throws(() => groupBounds([], { x: 0, y: 0, heading: 0 }), /no points/);
});

test('recapturing a member keeps its name and anything else that is not geometry', async () => {
    const { recaptureMember } = await import('../scripts/geometry.js');
    const anchor = { x: 100, y: 100, heading: 0 };
    const member = { ...captureMember('AmbientSound', 's', { x: 150, y: 120 }, anchor), label: 'Left lantern' };
    const again = recaptureMember(member, { x: 200, y: 140 }, anchor);
    assert.equal(again.label, 'Left lantern');
    assert.equal(again.dx, 100);
    assert.equal(again.dy, 40);
    assert.ok(!('label' in recaptureMember({ ...member, label: undefined }, { x: 1, y: 2 }, anchor)));
});
