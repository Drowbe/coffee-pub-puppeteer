// Run with: node --test tests/*.test.mjs
// Behaviour options: how a group eases, whether it turns with its pin, whether its riders may wander.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';
import { resetTween, easeOf } from '../scripts/tween.js';

const near = (a, b, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);
const FLAG = 'coffee-pub-puppeteer';
const sprite = () => ({ position: { x: null, y: null, set(x, y) { this.x = x; this.y = y; } }, angle: null });

function clock(t) {
    const real = performance.now.bind(performance);
    let now = 5000;
    performance.now = () => now;
    t.after(() => { performance.now = real; });
    return { advance: (ms) => { now += ms; } };
}

async function deck(t) {
    resetTween();
    const time = clock(t);
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const follower = await import('../scripts/follower.js');
    const boarding = await import('../scripts/boarding.js');
    const { registerTween } = await import('../scripts/tween.js');
    follower.registerFollower();
    boarding.registerBoarding();
    registerTween();

    const { scene } = env;
    const tile = scene.add('Tile', 'T1', { x: 3400, y: 2000, width: 800, height: 400, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const group = await groups.createGroup(scene, { x: 3000, y: 2000 }, { name: 'Deck' });
    await groups.addMembers(scene, group.id, [tile]);
    const sailor = scene.addToken('R1', { x: 3450, y: 1950, name: 'Sailor' });     // middle (3500, 2000)
    await groups.mountTokens(scene, group.id, [sailor]);
    await env.settle();
    tile.object = { mesh: sprite(), document: tile };
    sailor.object = { position: sprite().position, mesh: sprite(), document: sailor };

    const written = [];
    const write = scene.updateEmbeddedDocuments.bind(scene);
    scene.updateEmbeddedDocuments = (kind, updates, options) => { written.push({ kind, options }); return write(kind, updates, options); };
    return { ...env, ...time, groups, tile, sailor, group, written };
}

const record = (g) => g.scene.getFlag(FLAG, 'groups')[g.group.id];

// ---- easing ---------------------------------------------------------------------------------------------------

test('a group eases by default, and an easing time is kept within sensible limits', async () => {
    assert.deepEqual(easeOf({}), { mode: 'ease', ms: 350 });
    assert.deepEqual(easeOf({ ease: { mode: 'jump', ms: 9 } }), { mode: 'jump', ms: 100 });
    assert.deepEqual(easeOf({ ease: { mode: 'ease', ms: 99999 } }), { mode: 'ease', ms: 3000 });
    assert.deepEqual(easeOf({ ease: { mode: 'nonsense' } }), { mode: 'ease', ms: 350 });
});

test('setting the easing is saved, validated and clamped', async (t) => {
    const g = await deck(t);
    await g.groups.setBehaviour(g.scene, g.group.id, { ease: { mode: 'ease', ms: 800 } });
    assert.deepEqual(record(g).ease, { mode: 'ease', ms: 800 });
    await g.groups.setBehaviour(g.scene, g.group.id, { ease: { ms: 50 } });
    assert.deepEqual(record(g).ease, { mode: 'ease', ms: 100 });
    await assert.rejects(() => g.groups.setBehaviour(g.scene, g.group.id, { ease: { mode: 'bounce' } }), /"ease" or "jump"/);
    await assert.rejects(() => g.groups.setBehaviour(g.scene, g.group.id, { ease: { ms: 'soon' } }), /number of milliseconds/);
});

test('a longer glide takes its time', async (t) => {
    const g = await deck(t);
    await g.groups.setBehaviour(g.scene, g.group.id, { ease: { ms: 1000 } });
    await g.pins.update(g.group.anchor.id, { x: 3400, y: 2000 });
    await g.settle();
    g.ticker.run();
    g.advance(350);                                       // the default would be done by now
    g.ticker.run();
    assert.ok(g.tile.object.mesh.position.x < g.tile._source.x - 5, 'still on its way');
    g.advance(700);
    g.ticker.run();
    near(g.tile.object.mesh.position.x, g.tile._source.x, 1e-6);
});

test('a group that jumps is given no glide, and is not followed while the pin is dragged', async (t) => {
    const g = await deck(t);
    await g.groups.setBehaviour(g.scene, g.group.id, { ease: { mode: 'jump' } });
    g.written.length = 0;
    await g.pins.update(g.group.anchor.id, { x: 3400, y: 2000 });
    await g.settle();
    assert.ok(g.written.length > 0);
    assert.ok(g.written.every((w) => w.options.puppeteer.glide === undefined));
    g.ticker.run();
    assert.equal(g.ticker.fns.size, 0);
    g.emitPin('dragMove', { pinId: g.group.anchor.id, pin: { x: 3300, y: 2100, rotation: 0, config: { puppeteer: { groupId: g.group.id } } } });
    assert.equal(g.tile.object.mesh.position.x, null);
});

test('riders glide with the group, and a turn swings them along an arc', async (t) => {
    const g = await deck(t);
    await g.pins.update(g.group.anchor.id, { rotation: 90 });
    await g.settle();
    g.ticker.run();
    g.advance(175);
    g.ticker.run();
    const mid = g.sailor.object.position;
    // 500 px from the pin all the way round, not cutting across.
    near(Math.hypot(mid.x + 50 - 3000, mid.y + 50 - 2000), 500, 1);
    g.advance(400);
    g.ticker.run();
    near(g.sailor.object.position.x, g.sailor._source.x, 1e-6);
    near(g.sailor.object.position.y, g.sailor._source.y, 1e-6);
});

// ---- turning with the pin --------------------------------------------------------------------------------------

test('a group set not to turn follows its pin about and ignores its turning', async (t) => {
    const g = await deck(t);
    await g.groups.setBehaviour(g.scene, g.group.id, { rotates: false });
    assert.equal(record(g).rotates, false);
    assert.equal(record(g).fixedHeading, 0);

    await g.pins.update(g.group.anchor.id, { rotation: 90 });
    await g.settle();
    assert.equal(g.tile._source.rotation, 0);
    assert.equal(g.tile._source.x, 3400);
    assert.equal(g.sailor._source.rotation, 0);

    await g.pins.update(g.group.anchor.id, { x: 3600, y: 2000 });
    await g.settle();
    assert.equal(g.tile._source.x, 4000);
    assert.equal(g.tile._source.rotation, 0);
});

test('choosing not to turn does not move anything, even when the group already faces away', async (t) => {
    const g = await deck(t);
    await g.pins.update(g.group.anchor.id, { rotation: 90 });
    await g.settle();
    const before = JSON.stringify([g.tile._source, g.sailor._source]);
    await g.groups.setBehaviour(g.scene, g.group.id, { rotates: false });
    await g.settle();
    assert.equal(JSON.stringify([g.tile._source, g.sailor._source]), before);
    assert.equal(record(g).fixedHeading, 90);
});

test('turning it back on records the group against the pin, so nothing swings', async (t) => {
    const g = await deck(t);
    await g.groups.setBehaviour(g.scene, g.group.id, { rotates: false });
    await g.pins.update(g.group.anchor.id, { rotation: 90 });          // turned the pin; the group stood still
    await g.settle();
    const before = JSON.stringify([g.tile._source, g.sailor._source]);

    await g.groups.setBehaviour(g.scene, g.group.id, { rotates: true });
    await g.settle();
    assert.equal(JSON.stringify([g.tile._source, g.sailor._source]), before);
    assert.equal(record(g).rotates, undefined);
    assert.equal(record(g).fixedHeading, undefined);

    await g.pins.update(g.group.anchor.id, { rotation: 180 });         // and now a turn does turn it
    await g.settle();
    near(g.tile._source.rotation, 90, 0.01);
});

test('a group that does not turn refuses to be turned, and says why', async (t) => {
    const g = await deck(t);
    await g.groups.setBehaviour(g.scene, g.group.id, { rotates: false });
    await assert.rejects(() => g.groups.setHeading(g.scene, g.group.id, 90), /does not turn with its pin/);
    await assert.rejects(() => g.groups.rotateBy(g.scene, g.group.id, 90), /does not turn with its pin/);
});

test('a drag shown on screen uses the group\'s fixed heading when it does not turn', async (t) => {
    const g = await deck(t);
    await g.groups.setBehaviour(g.scene, g.group.id, { rotates: false });
    g.emitPin('dragMove', { pinId: g.group.anchor.id, pin: { x: 3100, y: 2000, rotation: 90, config: { puppeteer: { groupId: g.group.id } } } });
    near(g.tile.object.mesh.position.x, 3500, 1e-6);                   // moved 100, not swung round
    near(g.tile.object.mesh.angle, 0, 1e-6);
});

// ---- riders that must stay put ---------------------------------------------------------------------------------

test('when riders may not move about, one moved by hand is put back', async (t) => {
    const g = await deck(t);
    await g.groups.setBehaviour(g.scene, g.group.id, { ridersFree: false });
    await g.sailor.update({ x: 3100, y: 2050 });                       // still on the deck
    await g.settle();
    assert.equal(g.sailor._source.x, 3450);
    assert.equal(g.sailor._source.y, 1950);
    assert.equal(g.sailor.getFlag(FLAG, 'riderOf'), g.group.id);
    assert.equal(record(g).riders.length, 1);
});

test('when riders may move about, as by default, it stays where it was put', async (t) => {
    const g = await deck(t);
    await g.sailor.update({ x: 3100, y: 2050 });
    await g.settle();
    assert.equal(g.sailor._source.x, 3100);
});
