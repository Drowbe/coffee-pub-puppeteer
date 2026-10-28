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
