// Run with: node --test tests/*.test.mjs
// What a macro can read about a group: its pose, and whether and how fast it is moving.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';
import { resetTween } from '../scripts/tween.js';

const near = (a, b, eps = 0.05) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

function clock(t) {
    const real = performance.now.bind(performance);
    let now = 5000;
    performance.now = () => now;
    t.after(() => { performance.now = real; });
    return { advance: (ms) => { now += ms; } };
}

async function barge(t) {
    resetTween();
    const time = clock(t);
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const follower = await import('../scripts/follower.js');
    const { registerTween } = await import('../scripts/tween.js');
    const { groupState } = await import('../scripts/state.js');
    follower.registerFollower();
    registerTween();
    const { scene } = env;
    const tile = scene.add('Tile', 'T1', { x: 3000, y: 2000, width: 300, height: 100, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    tile.object = { mesh: { position: { set() {} }, angle: 0 }, document: tile };
    const group = await groups.createGroup(scene, { x: 3000, y: 2000 }, { name: 'Barge', heading: 90 });
    await groups.addMembers(scene, group.id, [tile]);
    await env.settle();
    return { ...env, ...time, groups, groupState, group, tile };
}

test('a group at rest reports where it is, which way it faces, and that it is still', async (t) => {
    const g = await barge(t);
    const state = g.groupState(g.scene, g.group.id);
    assert.deepEqual(state, { id: g.group.id, name: 'Barge', x: 3000, y: 2000, heading: 90, moving: false, speed: 0, progress: 1, hidden: false, members: 1, riders: 0, hasToken: false });
});

test('a travelling group is moving at its pace until it arrives', async (t) => {
    const g = await barge(t);
    await g.groups.setBehaviour(g.scene, g.group.id, { ease: { mode: 'travel', speed: 6 } });
    await g.pins.update(g.group.anchor.id, { x: 3600 });          // six squares at 100 px
    await g.settle();
    g.ticker.run();

    let state = g.groupState(g.scene, g.group.id);
    assert.equal(state.moving, true);
    near(state.speed, 6);
    assert.equal(state.x, 3600);

    g.advance(500);
    state = g.groupState(g.scene, g.group.id);
    near(state.progress, 0.5, 0.01);
    g.advance(600);
    g.ticker.run();
    state = g.groupState(g.scene, g.group.id);
    assert.equal(state.moving, false);
    assert.equal(state.speed, 0);
});

test('a group that jumps is never moving, and a missing group has no state', async (t) => {
    const g = await barge(t);
    await g.groups.setBehaviour(g.scene, g.group.id, { ease: { mode: 'jump' } });
    await g.pins.update(g.group.anchor.id, { x: 3600 });
    await g.settle();
    g.ticker.run();
    assert.equal(g.groupState(g.scene, g.group.id).moving, false);
    assert.equal(g.groupState(g.scene, 'nope'), null);
});
