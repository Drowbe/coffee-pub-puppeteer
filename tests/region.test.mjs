// Run with: node --test tests/*.test.mjs
// Regions as group members: a region is a list of shapes, and every shape has to move with the group.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';
import {
    rotate, captureMember, memberUpdate, memberExtent, poseDiffers, poseOffset, UnsupportedMemberError
} from '../scripts/geometry.js';

const near = (a, b, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

// One of each shape a region can carry.
const shapes = () => [
    { type: 'rectangle', x: 1200, y: 900, width: 400, height: 200, anchorX: 0, anchorY: 0, rotation: 15, hole: false, gridBased: false },
    { type: 'rectangle', x: 2000, y: 900, width: 300, height: 100, anchorX: 0.5, anchorY: 0.5, rotation: 90 },
    { type: 'ellipse', x: 1500, y: 1500, radiusX: 300, radiusY: 120, rotation: 40 },
    { type: 'circle', x: 2500, y: 1400, radius: 150 },
    { type: 'cone', x: 900, y: 1700, radius: 400, angle: 60, rotation: 20 },
    { type: 'ring', x: 2800, y: 1000, radius: 200, innerWidth: 20, outerWidth: 30 },
    { type: 'line', x: 1000, y: 2000, length: 500, width: 40, rotation: 70 },
    { type: 'polygon', points: [1700, 1800, 2100, 1900, 2000, 2200, 1650, 2100], origin: { x: 1800, y: 2000 } },
    { type: 'polygon', points: [100, 100, 300, 100, 200, 300], origin: null },
    { type: 'emanation', radius: 80, base: { type: 'circle', x: 3000, y: 2000, radius: 60 } }
];

const regionData = (list = shapes()) => ({ name: 'Camp', shapes: list, elevation: { bottom: null, top: null } });

const start = { x: 2000, y: 1500, heading: 25 };
const moved = { x: 6000, y: 900, heading: 140 };

test('recording a region and putting it back at the same pivot changes nothing', () => {
    const data = regionData();
    const member = captureMember('Region', 'R1', data, start);
    const back = memberUpdate(member, data, start);
    assert.equal(back.shapes.length, data.shapes.length);
    assert.ok(!poseDiffers(back, { shapes: data.shapes }), 'every shape is where it was');
    // Fields the follower does not own are carried over untouched.
    assert.equal(back.shapes[0].hole, false);
    assert.equal(back.shapes[0].gridBased, false);
    assert.equal(back.shapes[0].width, 400);
});

test('turning and moving the pivot carries every shape that has corners as a rigid body', () => {
    const data = regionData();
    const member = captureMember('Region', 'R1', data, start);
    const update = memberUpdate(member, data, moved);
    const before = memberExtent('Region', data);
    const after = memberExtent('Region', { ...data, ...update });
    const turn = moved.heading - start.heading;

    // Compare shape by shape, because circles, rings and emanations report an axis-aligned box that does not
    // itself turn; their centres are checked below.
    const rigid = ['rectangle', 'rectangle', 'ellipse', null, 'cone', null, 'line', 'polygon', 'polygon', null];
    let index = 0;
    data.shapes.forEach((shape, i) => {
        const count = memberExtent('Region', { shapes: [shape] }).length;
        if (rigid[i]) {
            for (let k = 0; k < count; k += 1) {
                const r = rotate(before[index + k].x - start.x, before[index + k].y - start.y, turn);
                near(after[index + k].x, moved.x + r.x, 1e-6);
                near(after[index + k].y, moved.y + r.y, 1e-6);
            }
        }
        index += count;
    });
});

test('circles, rings and emanations keep their centre and size when carried', () => {
    const data = regionData();
    const member = captureMember('Region', 'R1', data, start);
    const out = memberUpdate(member, data, moved).shapes;
    const turn = (p) => { const r = rotate(p.x - start.x, p.y - start.y, moved.heading - start.heading); return { x: moved.x + r.x, y: moved.y + r.y }; };

    const circle = out[3];
    const c = turn({ x: 2500, y: 1400 });
    near(circle.x, c.x, 1e-6);
    near(circle.y, c.y, 1e-6);
    assert.equal(circle.radius, 150);

    const ring = out[5];
    const g = turn({ x: 2800, y: 1000 });
    near(ring.x, g.x, 1e-6);
    near(ring.y, g.y, 1e-6);
    assert.equal(ring.innerWidth, 20);

    const emanation = out[9];
    const e = turn({ x: 3000, y: 2000 });
    near(emanation.base.x, e.x, 1e-6);
    near(emanation.base.y, e.y, 1e-6);
    assert.equal(emanation.radius, 80);
    assert.equal(emanation.base.radius, 60);
});

test('a shape that has a rotation turns by exactly the change of heading', () => {
    const data = regionData();
    const member = captureMember('Region', 'R1', data, start);
    const out = memberUpdate(member, data, moved).shapes;
    const turn = moved.heading - start.heading;
    for (const i of [0, 1, 2, 4, 6]) {
        near(((out[i].rotation - data.shapes[i].rotation - turn) % 360 + 540) % 360 - 180, 0, 1e-6);
    }
    // A polygon has no rotation: its vertices carry it, and its pivot (origin) goes with them.
    assert.equal(out[7].rotation, undefined);
    assert.ok(out[7].origin && Number.isFinite(out[7].origin.x));
    assert.equal(out[8].origin, null, 'a polygon with no origin keeps none');
});

test('a polygon keeps its shape: edge lengths do not change', () => {
    const data = regionData();
    const member = captureMember('Region', 'R1', data, start);
    const points = memberUpdate(member, data, moved).shapes[7].points;
    const edge = (p, i, j) => Math.hypot(p[2 * i] - p[2 * j], p[2 * i + 1] - p[2 * j + 1]);
    for (const [i, j] of [[0, 1], [1, 2], [2, 3], [3, 0]]) {
        near(edge(points, i, j), edge(data.shapes[7].points, i, j), 1e-6);
    }
});

test('shapes that are tied to a token or to grid cells are refused, with a reason', () => {
    for (const bad of [
        { type: 'token', x: 100, y: 100, width: 1, height: 1, shape: 1 },
        { type: 'grid', offsets: [{ i: 1, j: 1 }] },
        { type: 'emanation', radius: 10, base: { type: 'token', x: 1, y: 1, width: 1, height: 1, shape: 1 } }
    ]) {
        assert.throws(() => captureMember('Region', 'R', regionData([bad]), start), UnsupportedMemberError);
    }
    assert.throws(() => captureMember('Region', 'R', regionData([{ type: 'grid', offsets: [] }]), start), /cannot be turned or carried/);
});

test('poseOffset and poseDiffers see a region that is out of place', () => {
    const data = regionData();
    const member = captureMember('Region', 'R1', data, start);
    const expected = memberUpdate(member, data, start);
    const actual = { shapes: structuredClone(data.shapes) };
    assert.equal(poseDiffers(expected, actual), false);
    near(poseOffset('Region', expected, actual), 0, 1e-6);

    actual.shapes[3].x += 40;
    assert.equal(poseDiffers(expected, actual), true);
    near(poseOffset('Region', expected, actual), 40, 1e-6);

    actual.shapes[3].x -= 40;
    actual.shapes[2].rotation += 10;
    assert.equal(poseDiffers(expected, actual), true);
});

test('a region with no shapes records nothing and carries nothing', () => {
    const data = regionData([]);
    const member = captureMember('Region', 'R', data, start);
    assert.deepEqual(member.shapes, []);
    assert.deepEqual(memberUpdate(member, data, moved).shapes, []);
    assert.deepEqual(memberExtent('Region', data), []);
});

// ---- inside a real group -------------------------------------------------------------------------------

async function camp() {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const follower = await import('../scripts/follower.js');
    follower.registerFollower();
    const { scene } = env;

    const tent = scene.add('Tile', 'T1', { x: 2000, y: 1500, width: 300, height: 300, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const area = scene.add('Region', 'R1', regionData([
        { type: 'rectangle', x: 1800, y: 1300, width: 500, height: 400, anchorX: 0, anchorY: 0, rotation: 0 },
        { type: 'circle', x: 2300, y: 1700, radius: 120 }
    ]));
    const group = await groups.createGroup(scene, { x: 2000, y: 1500 }, { name: 'Camp' });
    const result = await groups.addMembers(scene, group.id, [tent, area]);
    await env.settle();
    return { ...env, groups, follower, tent, area, group, result };
}

test('a region joins a group, moves with the pin and turns with the group', async () => {
    const { scene, pins, groups, group, area, settle, result } = await camp();
    assert.equal(result.added, 2);
    assert.deepEqual(result.unsupported, []);

    const rect0 = { ...area._source.shapes[0] };
    await pins.update(group.anchor.id, { x: 2600, y: 1100 });
    await settle();
    near(area._source.shapes[0].x - rect0.x, 600);
    near(area._source.shapes[0].y - rect0.y, -400);

    await groups.rotateBy(scene, group.id, 90);
    await settle();
    // The rectangle's anchor point swung a quarter turn about the pin, and the rectangle turned with it.
    const r = rotate(rect0.x + 600 - 2600, rect0.y - 400 - 1100, 90);
    near(area._source.shapes[0].x, 2600 + r.x);
    near(area._source.shapes[0].y, 1100 + r.y);
    near(area._source.shapes[0].rotation, 90, 1e-6);
    // Fields we do not own are left alone.
    assert.equal(area._source.name, 'Camp');
});

test('turning a group with a region and turning back leaves the region where it began', async () => {
    const { scene, groups, group, area, settle } = await camp();
    const before = JSON.stringify(area._source.shapes);
    await groups.rotateBy(scene, group.id, 137);
    await settle();
    await groups.rotateBy(scene, group.id, -137);
    await settle();
    const a = JSON.parse(before);
    const b = area._source.shapes;
    near(b[0].x, a[0].x, 1e-6);
    near(b[1].y, a[1].y, 1e-6);
});

test('a region edited by hand is re-recorded, and a shape added to it is carried', async () => {
    const { scene, pins, group, area, settle } = await camp();
    // The GM drags the circle and adds a third shape with the region tool.
    const shapesNow = structuredClone(area._source.shapes);
    shapesNow[1].x += 100;
    shapesNow.push({ type: 'circle', x: 1700, y: 1400, radius: 50 });
    await scene.updateEmbeddedDocuments('Region', [{ _id: 'R1', shapes: shapesNow }], {});
    await settle();

    const record = scene.getFlag('coffee-pub-puppeteer', 'groups')[group.id].members.find((m) => m.type === 'Region');
    assert.equal(record.shapes.length, 3);

    const before = structuredClone(area._source.shapes);
    await pins.update(group.anchor.id, { x: 2100, y: 1500 });
    await settle();
    near(area._source.shapes[1].x - before[1].x, 100);
    near(area._source.shapes[2].x - before[2].x, 100);
});

test('a region with a shape that cannot be carried is skipped and the reason is reported', async () => {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const { scene } = env;
    const good = scene.add('Region', 'R1', regionData([{ type: 'circle', x: 100, y: 100, radius: 10 }]));
    const bad = scene.add('Region', 'R2', { name: 'Footprint', shapes: [{ type: 'grid', offsets: [{ i: 1, j: 1 }] }] });
    const group = await groups.createGroup(scene, { x: 0, y: 0 }, { name: 'Mixed' });
    const result = await groups.addMembers(scene, group.id, [good, bad]);
    assert.equal(result.added, 1);
    assert.equal(result.unsupported.length, 1);
    assert.match(result.unsupported[0], /Footprint/);
    assert.match(result.unsupported[0], /grid shape/);
});

test('a region survives being saved to the library and stamped', async () => {
    const { scene, settle, groups, group } = await camp();
    const library = await import('../scripts/library.js');
    const id = await library.saveGroupToLibrary(scene, group.id);
    const stamped = await library.stampTemplate(scene, id, { x: 8000, y: 3000 });
    await settle();

    const regions = [...scene.collections.Region.values()];
    assert.equal(regions.length, 2);
    const copy = scene.collections.Region.get(stamped.members.find((m) => m.type === 'Region').id);
    // The copy's rectangle sits at the same offset from its own pivot as the original's does from its pivot.
    near(copy._source.shapes[0].x - 8000, 1800 - 2000);
    near(copy._source.shapes[0].y - 3000, 1300 - 1500);
    assert.equal(copy._source.name, 'Camp');
    assert.equal(groups.listGroups(scene).length, 2);
});
