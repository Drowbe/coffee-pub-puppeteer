// Run with: node --test tests/*.test.mjs
// A group whose pin was deleted can be given a new one where it last was.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';

const FLAG = 'coffee-pub-puppeteer';
const live = (g) => g.scene.getFlag(FLAG, 'groups')[g.group.id];

async function cart() {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const follower = await import('../scripts/follower.js');
    const { anchorExists } = await import('../scripts/anchor.js');
    follower.registerFollower();
    const { scene } = env;
    const tile = scene.add('Tile', 'T1', { x: 3000, y: 2000, width: 400, height: 200, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const group = await groups.createGroup(scene, { x: 3000, y: 2000 }, { name: 'Cart', heading: 90 });
    await groups.addMembers(scene, group.id, [tile]);
    await env.settle();
    return { ...env, groups, anchorExists, group, tile };
}

test('a new pin goes where the group last was, facing as it faced, and nothing moves', async () => {
    const g = await cart();
    await g.pins.delete(g.group.anchor.id);
    await g.settle();
    assert.equal(g.anchorExists(g.scene, live(g)), false);

    const before = JSON.stringify(g.tile._source);
    const group = await g.groups.replacePin(g.scene, g.group.id);
    await g.settle();
    assert.notEqual(group.anchor.id, g.group.anchor.id);
    assert.equal(g.anchorExists(g.scene, live(g)), true);
    const pin = g.pins.get(group.anchor.id);
    assert.deepEqual([pin.x, pin.y], [3000, 2000]);
    assert.equal(pin.rotation, 90);
    assert.equal(JSON.stringify(g.tile._source), before);
});

test('the group follows the new pin as it did the old one', async () => {
    const g = await cart();
    await g.pins.delete(g.group.anchor.id);
    const group = await g.groups.replacePin(g.scene, g.group.id);
    await g.settle();
    await g.pins.update(group.anchor.id, { x: 3500 });
    await g.settle();
    assert.equal(g.tile._source.x, 3500);
});

test('a group that still has its pin is refused, and so is a group that does not exist', async () => {
    const g = await cart();
    await assert.rejects(() => g.groups.replacePin(g.scene, g.group.id), /still has its pin/);
    await assert.rejects(() => g.groups.replacePin(g.scene, 'nope'), /no group/);
});
