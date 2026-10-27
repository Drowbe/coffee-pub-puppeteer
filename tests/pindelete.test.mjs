// Run with: node --test tests/*.test.mjs
// Deleting a group's pin deletes the group, by the same route as the Delete button.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';

const FLAG = 'coffee-pub-puppeteer';
const stored = (scene) => scene.getFlag(FLAG, 'groups') ?? {};

async function carts() {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const follower = await import('../scripts/follower.js');
    const prune = await import('../scripts/prune.js');
    follower.registerFollower();
    prune.registerPruning();
    const { scene } = env;
    globalThis.game.scenes = { get: (id) => (id === scene.id ? scene : undefined) };
    const crate = scene.add('Tile', 'T1', { x: 3000, y: 2000, width: 200, height: 200, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const barrel = scene.add('Tile', 'T2', { x: 5000, y: 2000, width: 200, height: 200, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const one = await groups.createGroup(scene, { x: 3000, y: 2000 }, { name: 'Crates' });
    const two = await groups.createGroup(scene, { x: 5000, y: 2000 }, { name: 'Barrels' });
    await groups.addMembers(scene, one.id, [crate]);
    await groups.addMembers(scene, two.id, [barrel]);
    await env.settle();
    return { ...env, groups, one, two, crate, barrel };
}

test('deleting a group\'s pin deletes the group and its parts, and nothing else', async () => {
    const g = await carts();
    const pinId = g.one.anchor.id;
    await g.pins.delete(pinId);
    g.fire('blacksmith.pins.deleted', { pinId, sceneId: g.scene.id });
    await g.settle();
    assert.deepEqual(Object.keys(stored(g.scene)), [g.two.id], 'only the other group is left');
    assert.equal(g.scene.getEmbeddedCollection('Tile').has('T1'), false, 'its tile is gone');
    assert.equal(g.scene.getEmbeddedCollection('Tile').has('T2'), true, 'the tile of the other group is not touched');
});

test('the group deleted by the pin goes the way the Delete button sends it: its body and the riders\' links go too', async () => {
    const g = await carts();
    g.scene.addToken('R1', { x: 2950, y: 1950, name: 'Rider' });
    await g.groups.mountTokens(g.scene, g.one.id, [g.scene.tokens.get('R1')]);
    await g.settle();
    assert.equal(g.scene.tokens.get('R1').getFlag(FLAG, 'riderOf'), g.one.id);
    const pinId = g.one.anchor.id;
    await g.pins.delete(pinId);
    g.fire('blacksmith.pins.deleted', { pinId, sceneId: g.scene.id });
    await g.settle();
    assert.equal(g.scene.tokens.get('R1').getFlag(FLAG, 'riderOf'), undefined, 'the rider is let go where it stands');
});

test('a bulk delete of pins deletes every group that lost its pin, with its parts, and no other', async () => {
    const g = await carts();
    await g.pins.delete(g.one.anchor.id);
    g.fire('blacksmith.pins.deletedAllByType', { sceneId: g.scene.id, type: 'puppeteer-group', count: 1 });
    await g.settle();
    assert.deepEqual(Object.keys(stored(g.scene)), [g.two.id]);
    assert.equal(g.scene.getEmbeddedCollection('Tile').has('T1'), false);
});

test('a pin deleted by Delete Group does not delete anything twice', async () => {
    const g = await carts();
    await g.groups.deleteGroup(g.scene, g.one.id);
    g.fire('blacksmith.pins.deleted', { pinId: g.one.anchor.id, sceneId: g.scene.id });
    await g.settle();
    assert.deepEqual(Object.keys(stored(g.scene)), [g.two.id]);
});
