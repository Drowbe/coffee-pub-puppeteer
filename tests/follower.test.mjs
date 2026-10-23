// Run with: node --test tests/*.test.mjs
// The real follower, group and pivot code, run against a stand-in scene (see support/fake-foundry.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';
import { rotate, memberExtent, extentCentre } from '../scripts/geometry.js';

const near = (a, b, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

// The cart from the bug report: a big tile standing upright (1800 x 800, turned 90 degrees), two lights at
// its front corners, a wall down each side and a sound at its middle, with the pin off to one side of it.
const CART_CENTRE = { x: 5000, y: 3000 };
const PIN_AT = { x: 5530, y: 3500 };

async function cart(options) {
    const env = installFakes(options);
    const { createGroup, addMembers } = await import('../scripts/groups.js');
    const { registerFollower } = await import('../scripts/follower.js');
    if (!env.registered) { registerFollower(); env.registered = true; }

    const { scene } = env;
    // v14: a tile's x, y is where its texture anchor sits, the centre by default, and it turns about that point.
    const tile = scene.add('Tile', 'T1', { x: CART_CENTRE.x, y: CART_CENTRE.y, width: 1800, height: 800, rotation: 90, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const l1 = scene.add('AmbientLight', 'L1', { x: 4800, y: 2300, rotation: 0 });
    const l2 = scene.add('AmbientLight', 'L2', { x: 5200, y: 2300, rotation: 0 });
    const w1 = scene.add('Wall', 'W1', { c: [4700, 2400, 4700, 3600] });
    const w2 = scene.add('Wall', 'W2', { c: [5300, 2400, 5300, 3600] });
    const s1 = scene.add('AmbientSound', 'S1', { x: CART_CENTRE.x, y: CART_CENTRE.y });

    const group = await createGroup(scene, PIN_AT, { name: 'Wagon' });
    await addMembers(scene, group.id, [tile, l1, l2, w1, w2, s1]);
    await env.settle();
    return { ...env, group, docs: { tile, l1, l2, w1, w2, s1 } };
}

const pose = (docs) => ({
    tile: { x: docs.tile._source.x, y: docs.tile._source.y, rotation: docs.tile._source.rotation },
    l1: { x: docs.l1._source.x, y: docs.l1._source.y, rotation: docs.l1._source.rotation },
    l2: { x: docs.l2._source.x, y: docs.l2._source.y, rotation: docs.l2._source.rotation },
    w1: [...docs.w1._source.c],
    w2: [...docs.w2._source.c],
    s1: { x: docs.s1._source.x, y: docs.s1._source.y }
});

const centreOfTile = (t) => ({ x: t.x, y: t.y });

test('capturing leaves every member exactly where it was', async () => {
    const { docs } = await cart();
    const p = pose(docs);
    assert.deepEqual(centreOfTile(p.tile), CART_CENTRE);
    assert.deepEqual(p.s1, CART_CENTRE);
    assert.deepEqual(p.w1, [4700, 2400, 4700, 3600]);
});

test('dragging the pin moves every member by the same amount', async () => {
    const { docs, pins, group, settle } = await cart();
    const before = pose(docs);
    const pinId = pins.get(group.anchor.id) && group.anchor.id;
    await pins.update(pinId, { x: PIN_AT.x + 470, y: PIN_AT.y - 500 });
    await settle();
    const after = pose(docs);
    near(after.s1.x - before.s1.x, 470);
    near(after.s1.y - before.s1.y, -500);
    near(centreOfTile(after.tile).x - centreOfTile(before.tile).x, 470);
    near(after.l1.x - before.l1.x, 470);
    near(after.w2[3] - before.w2[3], -500);
    assert.equal(after.tile.rotation, before.tile.rotation);
});

test('rotating 90 degrees turns every member rigidly about the pin', async () => {
    const { docs, scene, group, settle } = await cart();
    const before = pose(docs);
    const { rotateBy } = await import('../scripts/groups.js');
    await rotateBy(scene, group.id, 90);
    await settle();
    const after = pose(docs);

    const turned = (p) => {
        const r = rotate(p.x - PIN_AT.x, p.y - PIN_AT.y, 90);
        return { x: PIN_AT.x + r.x, y: PIN_AT.y + r.y };
    };
    const tile = turned(centreOfTile(before.tile));
    near(centreOfTile(after.tile).x, tile.x);
    near(centreOfTile(after.tile).y, tile.y);
    near(after.tile.rotation, (before.tile.rotation + 90) % 360, 1e-6);

    const sound = turned(before.s1);
    near(after.s1.x, sound.x);
    near(after.s1.y, sound.y);

    const light = turned(before.l1);
    near(after.l1.x, light.x);
    near(after.l1.y, light.y);
    near(after.l1.rotation, 90, 1e-6);

    const wallEnd = turned({ x: before.w1[2], y: before.w1[3] });
    near(after.w1[2], wallEnd.x);
    near(after.w1[3], wallEnd.y);
});

test('turning 90 and back puts everything exactly where it began', async () => {
    const { docs, scene, group, settle } = await cart();
    const before = pose(docs);
    const { rotateBy } = await import('../scripts/groups.js');
    await rotateBy(scene, group.id, 90);
    await settle();
    await rotateBy(scene, group.id, -90);
    await settle();
    const after = pose(docs);
    near(centreOfTile(after.tile).x, centreOfTile(before.tile).x);
    near(centreOfTile(after.tile).y, centreOfTile(before.tile).y);
    near(after.tile.rotation, before.tile.rotation, 1e-6);
    near(after.l2.x, before.l2.x);
    near(after.l2.y, before.l2.y);
    assert.deepEqual(after.w1, before.w1);
});

test('Centre Pivot moves the pin to the middle of the group and moves nothing else', async () => {
    const { docs, scene, pins, group, settle } = await cart();
    const before = pose(docs);
    const { recenterPivot } = await import('../scripts/groups.js');
    const anchor = await recenterPivot(scene, group.id);
    await settle();

    const expected = extentCentre([
        ...memberExtent('Tile', docs.tile._source), ...memberExtent('AmbientLight', docs.l1._source),
        ...memberExtent('AmbientLight', docs.l2._source), ...memberExtent('Wall', docs.w1._source),
        ...memberExtent('Wall', docs.w2._source), ...memberExtent('AmbientSound', docs.s1._source)
    ]);
    near(anchor.x, expected.x);
    near(anchor.y, expected.y);
    const pin = pins.get(group.anchor.id);
    near(pin.x, expected.x);
    near(pin.y, expected.y);
    assert.deepEqual(pose(docs), before, 'nothing in the scene may move');
});

test('after Centre Pivot, rotating swings the group about its own middle', async () => {
    const { docs, scene, pins, group, settle } = await cart();
    const { recenterPivot, rotateBy } = await import('../scripts/groups.js');
    await recenterPivot(scene, group.id);
    await settle();
    const pin = pins.get(group.anchor.id);
    await rotateBy(scene, group.id, 90);
    await settle();

    // The group's own middle has not moved: its extent centre is still the pin.
    const after = [
        ...memberExtent('Tile', docs.tile._source), ...memberExtent('AmbientLight', docs.l1._source),
        ...memberExtent('AmbientLight', docs.l2._source), ...memberExtent('Wall', docs.w1._source),
        ...memberExtent('Wall', docs.w2._source), ...memberExtent('AmbientSound', docs.s1._source)
    ];
    const c = extentCentre(after);
    near(c.x, pin.x, 2);
    near(c.y, pin.y, 2);
});

test('moving a member by hand re-records where it sits in the group', async () => {
    const { docs, scene, pins, group, settle } = await cart();
    // Nudge a light, as the GM would with the light tool.
    await scene.updateEmbeddedDocuments('AmbientLight', [{ _id: 'L1', x: 4850, y: 2200 }], {});
    await settle();

    const { rotateBy } = await import('../scripts/groups.js');
    await rotateBy(scene, group.id, 90);
    await settle();

    const pin = pins.get(group.anchor.id);
    const expected = rotate(4850 - pin.x, 2200 - pin.y, 90);
    near(docs.l1._source.x, pin.x + expected.x);
    near(docs.l1._source.y, pin.y + expected.y);
});

test('a follower write is never mistaken for a hand edit, even if its marker is lost on the way', async () => {
    const { docs, scene, pins, group, settle } = await cart({ dropOptions: true });
    const recordBefore = JSON.stringify(scene.getFlag('coffee-pub-puppeteer', 'groups')[group.id].members);
    await pins.update(group.anchor.id, { x: PIN_AT.x + 300, y: PIN_AT.y + 100 });
    await settle();
    const { rotateBy } = await import('../scripts/groups.js');
    await rotateBy(scene, group.id, 90);
    await settle();
    await rotateBy(scene, group.id, -90);
    await settle();
    assert.equal(JSON.stringify(scene.getFlag('coffee-pub-puppeteer', 'groups')[group.id].members), recordBefore);
    near(docs.s1._source.x, CART_CENTRE.x + 300);
    near(docs.s1._source.y, CART_CENTRE.y + 100);
});

test('a member renamed in the group keeps its name through a hand edit', async () => {
    const { scene, group, settle } = await cart();
    const { renameMember } = await import('../scripts/groups.js');
    await renameMember(scene, group.id, 'AmbientLight', 'L1', 'Left lantern');
    await scene.updateEmbeddedDocuments('AmbientLight', [{ _id: 'L1', x: 4750 }], {});
    await settle();
    const member = scene.getFlag('coffee-pub-puppeteer', 'groups')[group.id].members.find((m) => m.id === 'L1');
    assert.equal(member.label, 'Left lantern');
});

test('Centre Pivot refuses to report success if the pin did not move, and puts the record back', async () => {
    const { scene, pins, group, settle } = await cart();
    const { recenterPivot } = await import('../scripts/groups.js');
    const recordBefore = JSON.stringify(scene.getFlag('coffee-pub-puppeteer', 'groups')[group.id]);
    pins.update = async () => {};          // Blacksmith quietly does nothing
    await assert.rejects(recenterPivot(scene, group.id), /did not move the pin/);
    await settle();
    assert.equal(JSON.stringify(scene.getFlag('coffee-pub-puppeteer', 'groups')[group.id]), recordBefore);
});
