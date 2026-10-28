// Run with: node --test tests/*.test.mjs
// Moving a whole group up or down the stack of tiles and drawings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';

async function stage() {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const { scene } = env;
    const pond = scene.add('Tile', 'T0', { x: 0, y: 0, width: 100, height: 100, sort: 7, elevation: 0 });
    const grass = scene.add('Tile', 'T9', { x: 0, y: 0, width: 100, height: 100, sort: -3, elevation: 0 });
    const sky = scene.add('Tile', 'T8', { x: 0, y: 0, width: 100, height: 100, sort: 99, elevation: 10 });
    const body = scene.add('Tile', 'T1', { x: 0, y: 0, width: 100, height: 100, sort: 2, elevation: 0 });
    const roof = scene.add('Tile', 'T2', { x: 0, y: 0, width: 100, height: 100, sort: 1, elevation: 0 });
    const mark = scene.add('Drawing', 'D1', { x: 0, y: 0, sort: 0, shape: { type: 'r', width: 10, height: 10 } });
    const group = await groups.createGroup(scene, { x: 0, y: 0 }, { name: 'Wagon' });
    await groups.addMembers(scene, group.id, [body, roof, mark]);
    await env.settle();
    return { ...env, groups, group };
}

const sorts = (scene) => Object.fromEntries([...scene.collections.Tile.values()].map((tile) => [tile.id, tile._source.sort]));

test('bring to front puts the group above what is at its elevation, keeping its own order', async () => {
    const g = await stage();
    const { moved } = await g.groups.restackGroup(g.scene, g.group.id, 'front');
    const now = sorts(g.scene);
    // Roof was under body and stays under it; both are above the pond (7). The tile at elevation 10 is not touched.
    assert.ok(now.T2 > 7 && now.T1 > now.T2, JSON.stringify(now));
    assert.equal(now.T8, 99);
    assert.equal(now.T0, 7);
    assert.ok(moved >= 2);
});

test('send to back puts the group below what is at its elevation, keeping its own order', async () => {
    const g = await stage();
    await g.groups.restackGroup(g.scene, g.group.id, 'back');
    const now = sorts(g.scene);
    assert.ok(now.T2 < -3 && now.T1 > now.T2 && now.T1 < -3, JSON.stringify(now));
});

test('a group already at the front is left alone, and a bad direction is refused', async () => {
    const g = await stage();
    await g.groups.restackGroup(g.scene, g.group.id, 'front');
    assert.equal((await g.groups.restackGroup(g.scene, g.group.id, 'front')).moved, 0);
    assert.throws(() => g.groups.restackGroup(g.scene, g.group.id, 'sideways'), /front/);
});

test('a part moves one step forward or back among the group, and stops at the ends', async () => {
    const g = await stage();
    // The group's tiles are T2 (sort 1) under T1 (sort 2).
    assert.equal(await g.groups.stackMember(g.scene, g.group.id, 'Tile', 'T2', 'forward'), true);
    let now = sorts(g.scene);
    assert.ok(now.T2 > now.T1, JSON.stringify(now));
    assert.equal(now.T0, 7);
    // T2 is now the top of the group, so another step forward does nothing.
    assert.equal(await g.groups.stackMember(g.scene, g.group.id, 'Tile', 'T2', 'forward'), false);
    assert.equal(await g.groups.stackMember(g.scene, g.group.id, 'Tile', 'T2', 'backward'), true);
    now = sorts(g.scene);
    assert.ok(now.T2 < now.T1, JSON.stringify(now));
});

test('two parts with the same sort order are told apart by a step, and elevation is respected', async () => {
    const g = await stage();
    g.scene.collections.Tile.get('T2')._source.sort = 2;
    assert.equal(await g.groups.stackMember(g.scene, g.group.id, 'Tile', 'T1', 'forward'), true);
    assert.equal(sorts(g.scene).T1, 3);
    g.scene.collections.Tile.get('T2')._source.elevation = 4;
    assert.equal(await g.groups.stackMember(g.scene, g.group.id, 'Tile', 'T1', 'forward'), false);
    assert.throws(() => g.groups.stackMember(g.scene, g.group.id, 'Wall', 'W1', 'forward'), /only tiles and drawings/);
});

test('a part can be moved to another place in the list, and the order is only the list', async () => {
    const g = await stage();
    const order = () => g.scene.getFlag('coffee-pub-puppeteer', 'groups')[g.group.id].members.map((member) => member.id);
    assert.deepEqual(order(), ['T1', 'T2', 'D1']);
    assert.equal(await g.groups.reorderMember(g.scene, g.group.id, 'Drawing', 'D1', { type: 'Tile', id: 'T1' }, false), true);
    assert.deepEqual(order(), ['D1', 'T1', 'T2']);
    assert.equal(await g.groups.reorderMember(g.scene, g.group.id, 'Drawing', 'D1', { type: 'Tile', id: 'T1' }, true), true);
    assert.deepEqual(order(), ['T1', 'D1', 'T2']);
    assert.equal(await g.groups.reorderMember(g.scene, g.group.id, 'Tile', 'T1', null), true);
    assert.deepEqual(order(), ['D1', 'T2', 'T1']);
    // Where it already is: nothing written.
    assert.equal(await g.groups.reorderMember(g.scene, g.group.id, 'Tile', 'T1', null), false);
    await assert.rejects(() => g.groups.reorderMember(g.scene, g.group.id, 'Tile', 'T9', null), /not a member/);
    // Nothing on the map changed.
    assert.equal(sorts(g.scene).T1, 2);
});
