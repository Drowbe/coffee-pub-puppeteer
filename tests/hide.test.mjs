// Run with: node --test tests/*.test.mjs
// Hiding and showing a group and its parts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';

async function stage() {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const follower = await import('../scripts/follower.js');
    follower.registerFollower();
    const { scene } = env;
    const tile = scene.add('Tile', 'T1', { x: 3000, y: 2000, width: 400, height: 200, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const lamp = scene.add('AmbientLight', 'L1', { x: 3100, y: 2000, rotation: 0 });
    const hum = scene.add('AmbientSound', 'S1', { x: 3000, y: 2100, hidden: true });     // already hidden by the GM
    const wall = scene.add('Wall', 'W1', { c: [2800, 1900, 2800, 2100] });
    const note = scene.add('Note', 'N1', { x: 3000, y: 1900 });
    const region = scene.add('Region', 'R1', { shapes: [{ type: 'rectangle', x: 2800, y: 1900, width: 400, height: 200, rotation: 0, anchorX: 0, anchorY: 0 }] });
    const group = await groups.createGroup(scene, { x: 3000, y: 2000 }, { name: 'Bridge' });
    await groups.addMembers(scene, group.id, [tile, lamp, hum, wall, note, region]);
    await env.settle();
    return { ...env, groups, group, tile, lamp, hum, wall, note, region };
}

const record = (g) => g.scene.getFlag('coffee-pub-puppeteer', 'groups')[g.group.id];

test('hiding a group hides every part that can be hidden, and leaves walls and notes alone', async () => {
    const g = await stage();
    assert.equal(await g.groups.setGroupHidden(g.scene, g.group.id, true), true);
    assert.equal(g.tile._source.hidden, true);
    assert.equal(g.lamp._source.hidden, true);
    assert.equal(g.region._source.hidden, true);
    assert.equal(g.wall._source.hidden, undefined);
    assert.equal(g.note._source.hidden, undefined);
    assert.equal(record(g).hidden, true);
});

test('showing the group shows what it hid, and leaves what was already hidden hidden', async () => {
    const g = await stage();
    await g.groups.setGroupHidden(g.scene, g.group.id, true);
    assert.deepEqual(record(g).hiddenBefore, ['AmbientSound:S1']);
    assert.equal(await g.groups.setGroupHidden(g.scene, g.group.id, false), false);
    assert.equal(g.tile._source.hidden, false);
    assert.equal(g.lamp._source.hidden, false);
    assert.equal(g.region._source.hidden, false);
    assert.equal(g.hum._source.hidden, true);
    assert.equal(record(g).hidden, undefined);
    assert.equal(record(g).hiddenBefore, undefined);
});

test('hiding a hidden group, or showing a shown one, changes nothing', async () => {
    const g = await stage();
    assert.equal(await g.groups.setGroupHidden(g.scene, g.group.id, false), false);
    await g.groups.setGroupHidden(g.scene, g.group.id, true);
    const before = JSON.stringify(record(g));
    assert.equal(await g.groups.setGroupHidden(g.scene, g.group.id, true), true);
    assert.equal(JSON.stringify(record(g)), before);
});

test('the body token is hidden and shown with the group', async () => {
    const g = await stage();
    game.actors.set('A1', { id: 'A1', name: 'Bridge', async getTokenDocument(data) { return { toObject: () => ({ actorId: 'A1', ...data }) }; } });
    const body = await g.groups.setBody(g.scene, g.group.id, 'A1');
    await g.groups.setGroupHidden(g.scene, g.group.id, true);
    assert.equal(body._source.hidden, true);
    await g.groups.setGroupHidden(g.scene, g.group.id, false);
    assert.equal(body._source.hidden, false);
});

test('riders are not hidden with the group', async () => {
    const g = await stage();
    const sailor = g.scene.addToken('R1', { x: 2950, y: 1950, name: 'Sailor' });
    await g.groups.mountTokens(g.scene, g.group.id, [sailor]);
    await g.groups.setGroupHidden(g.scene, g.group.id, true);
    assert.notEqual(sailor._source.hidden, true);
});

test('a part added to a hidden group is hidden with it, and shown with it', async () => {
    const g = await stage();
    await g.groups.setGroupHidden(g.scene, g.group.id, true);
    const extra = g.scene.add('Tile', 'T2', { x: 3200, y: 2000, width: 100, height: 100, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    await g.groups.addMembers(g.scene, g.group.id, [extra]);
    assert.equal(extra._source.hidden, true);
    await g.groups.setGroupHidden(g.scene, g.group.id, false);
    assert.equal(extra._source.hidden, false);
});

test('a group still follows its pin while hidden', async () => {
    const g = await stage();
    await g.groups.setGroupHidden(g.scene, g.group.id, true);
    await g.pins.update(g.group.anchor.id, { x: 3500, y: 2000 });
    await g.settle();
    assert.equal(g.tile._source.x, 3500);
});

test('one part can be hidden and shown, and only the types that can be', async () => {
    const g = await stage();
    await g.groups.setMemberHidden(g.scene, g.group.id, 'Tile', 'T1', true);
    assert.equal(g.tile._source.hidden, true);
    await g.groups.setMemberHidden(g.scene, g.group.id, 'Tile', 'T1', false);
    assert.equal(g.tile._source.hidden, false);
    await assert.rejects(() => g.groups.setMemberHidden(g.scene, g.group.id, 'Wall', 'W1', true), /cannot be hidden/);
    await assert.rejects(() => g.groups.setMemberHidden(g.scene, g.group.id, 'Tile', 'nope', true), /not in group/);
});

test('lights and sounds switch together: flipped when no direction is given, and only the group\'s own', async () => {
    const g = await stage();
    const other = g.scene.add('AmbientLight', 'L2', { x: 100, y: 100 });
    // The lamp is on: flipping turns every light of the group off.
    assert.deepEqual(await g.groups.setEmittersOn(g.scene, g.group.id, 'AmbientLight'), { on: false, count: 1 });
    assert.equal(g.lamp._source.hidden, true);
    // All off: flipping turns them on.
    assert.deepEqual(await g.groups.setEmittersOn(g.scene, g.group.id, 'AmbientLight'), { on: true, count: 1 });
    assert.equal(g.lamp._source.hidden, false);
    assert.notEqual(other._source.hidden, true);
    // The hum was hidden by the GM, so it is off; flipping turns it on, and a direction is obeyed.
    assert.deepEqual(await g.groups.setEmittersOn(g.scene, g.group.id, 'AmbientSound'), { on: true, count: 1 });
    assert.equal(g.hum._source.hidden, false);
    assert.deepEqual(await g.groups.setEmittersOn(g.scene, g.group.id, 'AmbientSound', false), { on: false, count: 1 });
    assert.equal(g.hum._source.hidden, true);
});

test('switching emitters refuses other types, and a group without any does nothing', async () => {
    const g = await stage();
    await assert.rejects(() => g.groups.setEmittersOn(g.scene, g.group.id, 'Tile'), /lights and sounds/);
    g.scene.collections.AmbientLight.clear();
    assert.deepEqual(await g.groups.setEmittersOn(g.scene, g.group.id, 'AmbientLight'), { on: false, count: 0 });
});
