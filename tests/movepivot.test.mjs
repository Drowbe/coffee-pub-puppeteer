// Run with: node --test tests/*.test.mjs
// Move Pivot: while it is on, moving or turning the pin moves only the grip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';
import { resetTween } from '../scripts/tween.js';

const near = (a, b, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);
const FLAG = 'coffee-pub-puppeteer';

async function ship() {
    resetTween();
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const follower = await import('../scripts/follower.js');
    const boarding = await import('../scripts/boarding.js');
    follower.registerFollower();
    boarding.registerBoarding();
    const { scene } = env;
    // A deck 800 by 400 centred on the pin (3000, 2000), a light at the stern, and a sailor aboard.
    const tile = scene.add('Tile', 'T1', { x: 3000, y: 2000, width: 800, height: 400, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const light = scene.add('AmbientLight', 'L1', { x: 2700, y: 2000, rotation: 0 });
    const group = await groups.createGroup(scene, { x: 3000, y: 2000 }, { name: 'Ship' });
    await groups.addMembers(scene, group.id, [tile, light]);
    const sailor = scene.addToken('R1', { x: 3150, y: 1950, name: 'Sailor' });
    await groups.mountTokens(scene, group.id, [sailor]);
    await env.settle();
    return { ...env, groups, tile, light, sailor, group };
}

const record = (g) => g.scene.getFlag(FLAG, 'groups')[g.group.id];

test('with Move Pivot on, dragging the pin moves only the pin', async () => {
    const g = await ship();
    assert.equal(await g.groups.setMovePivot(g.scene, g.group.id, true), true);
    await g.pins.update(g.group.anchor.id, { x: 3400, y: 2000 });        // to the prow, 400 forward
    await g.settle();
    assert.equal(g.tile._source.x, 3000);
    assert.equal(g.light._source.x, 2700);
    assert.equal(g.sailor._source.x, 3150);
    assert.deepEqual(record(g).applied, { x: 3400, y: 2000, heading: 0 });
    // The parts are now recorded against the prow: the deck's middle is 400 behind it.
    const tile = record(g).members.find((m) => m.type === 'Tile');
    near(tile.dx, -400);
    near(record(g).riders[0].dx, -200);
});

test('one drop is one use: the mode switches itself off, and the next drag takes the group', async () => {
    const g = await ship();
    await g.groups.setMovePivot(g.scene, g.group.id, true);
    await g.pins.update(g.group.anchor.id, { x: 3400, y: 2000 });
    await g.settle();
    assert.equal(record(g).movePivot, undefined);
    await g.pins.update(g.group.anchor.id, { x: 3600, y: 2000 });
    await g.settle();
    assert.equal(g.tile._source.x, 3200);                                 // the whole group followed, 200 right
});

test('afterwards the group moves and turns about the new grip, and nothing jumps', async () => {
    const g = await ship();
    await g.groups.setMovePivot(g.scene, g.group.id, true);
    await g.pins.update(g.group.anchor.id, { x: 3400, y: 2000 });
    await g.settle();
    assert.equal(record(g).movePivot, undefined);

    await g.pins.update(g.group.anchor.id, { rotation: 90 });
    await g.settle();
    // The deck's middle was 400 behind the prow; turned a quarter about the prow it is 400 above... (rotate(-400, 0, 90) = (0, -400))
    near(g.tile._source.x, 3400, 1);
    near(g.tile._source.y, 2000 - 400, 1);
    near(g.tile._source.rotation, 90, 0.01);
});

test('with it off, dragging the pin takes the group, as before', async () => {
    const g = await ship();
    await g.pins.update(g.group.anchor.id, { x: 3400, y: 2000 });
    await g.settle();
    assert.equal(g.tile._source.x, 3400);
    assert.equal(g.sailor._source.x, 3550);
});

test('turning the pin with it on turns the grip and leaves everything standing', async () => {
    const g = await ship();
    await g.groups.setMovePivot(g.scene, g.group.id, true);
    await g.pins.update(g.group.anchor.id, { rotation: 90 });
    await g.settle();
    assert.equal(g.tile._source.rotation, 0);
    assert.equal(g.tile._source.x, 3000);
    near(record(g).heading, 90, 0.01);
});

test('the body is not disturbed by moving the grip', async () => {
    const g = await ship();
    game.actors.set('A1', { id: 'A1', name: 'Ship', async getTokenDocument(data) { return { toObject: () => ({ actorId: 'A1', ...data }) }; } });
    const body = await g.groups.setBody(g.scene, g.group.id, 'A1');
    const before = { x: body._source.x, y: body._source.y, width: body._source.width };
    await g.groups.setMovePivot(g.scene, g.group.id, true);
    await g.pins.update(g.group.anchor.id, { x: 3400, y: 2000 });
    await g.settle();
    assert.deepEqual({ x: body._source.x, y: body._source.y, width: body._source.width }, before);
});

test('a drag with it on is not followed on screen', async () => {
    const g = await ship();
    const { registerTween } = await import('../scripts/tween.js');
    registerTween();
    g.tile.object = { mesh: { position: { x: null, set(x, y) { this.x = x; this.y = y; } }, angle: null }, document: g.tile };
    await g.groups.setMovePivot(g.scene, g.group.id, true);
    g.emitPin('dragMove', { pinId: g.group.anchor.id, pin: { x: 3300, y: 2100, rotation: 0, config: { puppeteer: { groupId: g.group.id } } } });
    assert.equal(g.tile.object.mesh.position.x, null);
});
