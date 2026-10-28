// Run with: node --test tests/*.test.mjs
// A group that snaps goes to the grid when its pin is dropped, and its pin goes with it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';

async function stage(snap) {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const { registerFollower } = await import('../scripts/follower.js');
    registerFollower();
    const { scene } = env;
    const tile = scene.add('Tile', 'T1', { x: 1000, y: 1000, width: 200, height: 200, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const group = await groups.createGroup(scene, { x: 1000, y: 1000 }, { name: 'Cart' });
    await groups.addMembers(scene, group.id, [tile]);
    if (snap) await groups.setBehaviour(scene, group.id, { snap: true });
    await env.settle();
    return { ...env, groups, group, tile };
}

const live = (g) => g.scene.getFlag('coffee-pub-puppeteer', 'groups')[g.group.id];
const pin = (g) => g.pins.get(live(g).anchor.id);

test('a group that snaps goes to the nearest half square, and its pin with it', async () => {
    const g = await stage(true);
    await g.pins.update(live(g).anchor.id, { x: 1342, y: 1181 });
    await g.settle();
    assert.deepEqual({ x: pin(g).x, y: pin(g).y }, { x: 1350, y: 1200 });
    assert.deepEqual({ x: g.tile._source.x, y: g.tile._source.y }, { x: 1350, y: 1200 });
});

test('a group that does not snap goes where the pin was dropped', async () => {
    const g = await stage(false);
    await g.pins.update(live(g).anchor.id, { x: 1342, y: 1181 });
    await g.settle();
    assert.deepEqual({ x: pin(g).x, y: pin(g).y }, { x: 1342, y: 1181 });
    assert.deepEqual({ x: g.tile._source.x, y: g.tile._source.y }, { x: 1342, y: 1181 });
});

test('a pin dropped back near where a snapping group already is only has itself put right', async () => {
    const g = await stage(true);
    await g.pins.update(live(g).anchor.id, { x: 1342, y: 1181 });
    await g.settle();
    await g.pins.update(live(g).anchor.id, { x: 1360, y: 1190 });
    await g.settle();
    assert.deepEqual({ x: pin(g).x, y: pin(g).y }, { x: 1350, y: 1200 });
    assert.deepEqual({ x: g.tile._source.x, y: g.tile._source.y }, { x: 1350, y: 1200 });
});

test('snap is a behaviour a library entry carries, and turning it off clears it', async () => {
    const g = await stage(true);
    assert.equal(live(g).snap, true);
    const { BEHAVIOUR } = await import('../scripts/template.js');
    assert.ok(BEHAVIOUR.includes('snap'));
    await g.groups.setBehaviour(g.scene, g.group.id, { snap: false });
    assert.equal('snap' in live(g), false);
});
