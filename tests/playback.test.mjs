// Run with: node --test tests/*.test.mjs
// Playing and pausing a group's animations, and the front of a picture for a group that faces its travel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);
const live = (g) => g.scene.getFlag('coffee-pub-puppeteer', 'groups')[g.group.id];

async function wagon() {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const follower = await import('../scripts/follower.js');
    follower.registerFollower();
    const { scene } = env;
    const horse = scene.add('Tile', 'T1', { x: 3000, y: 2000, width: 200, height: 400, rotation: 0, texture: { src: 'tokens/horse-wagon.webm', anchorX: 0.5, anchorY: 0.5 }, video: { loop: true, autoplay: true, volume: 0 } });
    const still = scene.add('Tile', 'T2', { x: 3000, y: 2200, width: 100, height: 100, rotation: 0, texture: { src: 'tokens/crate.png', anchorX: 0.5, anchorY: 0.5 } });
    const group = await groups.createGroup(scene, { x: 3000, y: 2000 }, { name: 'Wagon' });
    await groups.addMembers(scene, group.id, [horse, still]);
    await env.settle();
    const writes = [];
    const write = scene.updateEmbeddedDocuments.bind(scene);
    scene.updateEmbeddedDocuments = (type, updates, options) => { writes.push({ type, updates, options }); return write(type, updates, options); };
    return { ...env, groups, group, horse, still, writes };
}

test('pausing a group pauses its video tiles on every screen, and playing starts them again', async () => {
    const g = await wagon();
    assert.deepEqual(await g.groups.setPlaying(g.scene, g.group.id, false), { playing: false, count: 1 });
    const write = g.writes.find((w) => w.type === 'Tile');
    assert.deepEqual(write.updates, [{ _id: 'T1', video: { autoplay: false } }]);
    assert.equal(write.options.playVideo, false);
    assert.equal(write.options.diff, false);
    assert.equal(write.options.puppeteer.follower, true);
    assert.equal(live(g).paused, true);
    assert.equal(g.horse._source.video.autoplay, false);

    assert.deepEqual(await g.groups.setPlaying(g.scene, g.group.id, true), { playing: true, count: 1 });
    assert.equal(g.writes.at(-1).options.playVideo, true);
    assert.equal('paused' in live(g), false);
    assert.equal(g.horse._source.video.autoplay, true);
});

test('with no choice given, playing flips what the group was doing', async () => {
    const g = await wagon();
    assert.equal((await g.groups.setPlaying(g.scene, g.group.id)).playing, false);
    assert.equal((await g.groups.setPlaying(g.scene, g.group.id)).playing, true);
});

test('a group with no video tile has nothing to play or pause', async () => {
    const g = await wagon();
    await g.groups.removeMember(g.scene, g.group.id, 'Tile', 'T1');
    g.writes.length = 0;
    assert.deepEqual(await g.groups.setPlaying(g.scene, g.group.id), { playing: false, count: 0 });
    assert.equal(g.writes.length, 0);
});

test('the front of the picture decides which end leads', async () => {
    const group = (front) => ({ facesTravel: true, front });
    const { travelHeading } = await import('../scripts/anchor.js');
    const from = { x: 3000, y: 2000, heading: 0 };
    const northWest = { x: 2500, y: 1500, heading: 0 };
    near(travelHeading(group(0), from, northWest, 100), 135);          // front down: turned so that down points north-west
    near(travelHeading(group(180), from, northWest, 100), 315);        // front up: the picture, turned 315 clockwise, points north-west
    near(travelHeading(group(270), from, { x: 3500, y: 2000, heading: 0 }, 100), 0);   // front right, going east: already facing it
    near(travelHeading(group(90), from, { x: 2500, y: 2000, heading: 0 }, 100), 0);    // front left, going west
});

test('the front is saved, kept to two decimals, removed at zero, and carried by a duplicate', async () => {
    const g = await wagon();
    await g.groups.setBehaviour(g.scene, g.group.id, { facesTravel: true, front: 180 });
    assert.equal(live(g).front, 180);
    const library = await import('../scripts/library.js');
    assert.equal((await library.duplicateGroup(g.scene, g.group.id)).front, 180);
    await g.groups.setBehaviour(g.scene, g.group.id, { front: 0 });
    assert.equal('front' in live(g), false);
    await assert.rejects(() => g.groups.setBehaviour(g.scene, g.group.id, { front: 'sideways' }), /number of degrees/);
});

test('a wagon drawn pointing up is moved north-west and ends with its horse leading', async () => {
    const g = await wagon();
    await g.groups.setBehaviour(g.scene, g.group.id, { facesTravel: true, front: 180 });
    await g.pins.update(g.group.anchor.id, { x: 2500, y: 1500 });
    await g.settle();
    near(live(g).heading, 315);
    near(g.pins.get(g.group.anchor.id).rotation, 315);
});
