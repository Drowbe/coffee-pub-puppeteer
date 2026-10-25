// Run with: node --test tests/*.test.mjs
// A pin group moves smoothly: it follows the pointer while the pin is dragged, and eases from where it was when
// a pin moves or turns for any other reason.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';
import { rotate } from '../scripts/geometry.js';
import { resetTween } from '../scripts/tween.js';

const near = (a, b, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);
const easeOut = (t) => 1 - ((1 - t) ** 3);

const sprite = () => ({ position: { x: null, y: null, set(x, y) { this.x = x; this.y = y; } }, angle: null });

// A clock that moves only when told to, put back after the test.
function clock(t) {
    const real = performance.now.bind(performance);
    let now = 5000;
    performance.now = () => now;
    t.after(() => { performance.now = real; });
    return { advance: (ms) => { now += ms; }, now: () => now };
}

async function gate(t) {
    resetTween();
    const time = clock(t);
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const follower = await import('../scripts/follower.js');
    const { registerTween } = await import('../scripts/tween.js');
    follower.registerFollower();
    registerTween();

    const { scene } = env;
    // A tile 400 px right of the pivot (3000, 2000), a note below it, and a light that cannot be tweened.
    const tile = scene.add('Tile', 'T1', { x: 3400, y: 2000, width: 300, height: 100, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const note = scene.add('Note', 'N1', { x: 3000, y: 2300 });
    const light = scene.add('AmbientLight', 'L1', { x: 3200, y: 2000, rotation: 0 });
    const group = await groups.createGroup(scene, { x: 3000, y: 2000 }, { name: 'Gate' });
    await groups.addMembers(scene, group.id, [tile, note, light]);
    await env.settle();

    tile.object = { mesh: sprite(), document: tile };
    note.object = { position: sprite().position, document: note };
    const optionsSeen = [];
    const write = scene.updateEmbeddedDocuments.bind(scene);
    scene.updateEmbeddedDocuments = (type, updates, options) => { optionsSeen.push({ type, options }); return write(type, updates, options); };
    return { ...env, ...time, groups, follower, tile, note, light, group, optionsSeen };
}

const at = (g) => ({ x: g.tile.object.mesh.position.x, y: g.tile.object.mesh.position.y, angle: g.tile.object.mesh.angle });

test('the follower says where the group was, in the options of what it writes', async (t) => {
    const g = await gate(t);
    await g.pins.update(g.group.anchor.id, { x: 3400, y: 2000 });
    await g.settle();
    const tileWrite = g.optionsSeen.find((c) => c.type === 'Tile');
    assert.equal(tileWrite.options.puppeteer.follower, true);
    assert.deepEqual(tileWrite.options.puppeteer.glide, { groupId: g.group.id, from: { x: 3000, y: 2000, heading: 0 } });
});

test('when a pin moves, the group eases from where it was to where the pin is, then stops', async (t) => {
    const g = await gate(t);
    const start = at(g);                                    // nothing drawn yet
    assert.equal(start.x, null);

    await g.pins.update(g.group.anchor.id, { x: 3400, y: 2000 });     // moves 400 right
    await g.settle();

    // The first frame is where it was.
    g.ticker.run();
    near(g.tile.object.mesh.position.x, 3400, 0.5);
    // Half way through the time, an ease-out is most of the way there.
    g.advance(175);
    g.ticker.run();
    near(g.tile.object.mesh.position.x, 3400 + (400 * easeOut(0.5)), 0.5);
    near(g.note.object.position.x, 3000 + (400 * easeOut(0.5)), 0.5);
    // At the end it is exactly where the documents are, and the animation stops.
    g.advance(400);
    g.ticker.run();
    near(g.tile.object.mesh.position.x, g.tile._source.x, 1e-6);
    near(g.tile.object.mesh.position.y, g.tile._source.y, 1e-6);
    assert.equal(g.ticker.fns.size, 0, 'the ticker is released when nothing is moving');
});

test('a turn swings the members along an arc, not a straight line', async (t) => {
    const g = await gate(t);
    await g.pins.update(g.group.anchor.id, { rotation: 90 });
    await g.settle();
    g.ticker.run();
    g.advance(175);
    g.ticker.run();

    const heading = 90 * easeOut(0.5);
    const r = rotate(400, 0, heading);                      // the tile is 400 px from the pivot, along x
    near(g.tile.object.mesh.position.x, 3000 + r.x, 0.5);
    near(g.tile.object.mesh.position.y, 2000 + r.y, 0.5);
    near(g.tile.object.mesh.angle, heading, 0.5);
    // On a chord it would be 400 * cos(45 degrees) from the pivot at the half way point; on the arc it is 400.
    near(Math.hypot(g.tile.object.mesh.position.x - 3000, g.tile.object.mesh.position.y - 2000), 400, 0.6);
});

test('it turns the short way round', async (t) => {
    const g = await gate(t);
    await g.pins.update(g.group.anchor.id, { rotation: 350 });         // 10 degrees back, not 350 forward
    await g.settle();
    g.ticker.run();
    g.advance(175);
    g.ticker.run();
    const angle = g.tile.object.mesh.angle;
    assert.ok(angle < 0 || angle > 340, `angle ${angle} went the long way`);
});

test('dragging the pin: the group follows the pointer on the screen that is dragging', async (t) => {
    const g = await gate(t);
    g.emitPin('dragMove', { pinId: g.group.anchor.id, pin: { x: 3300, y: 2100, rotation: 0, config: { puppeteer: { groupId: g.group.id } } } });
    near(g.tile.object.mesh.position.x, 3700);
    near(g.tile.object.mesh.position.y, 2100);
    near(g.note.object.position.x, 3300);
    near(g.note.object.position.y, 2400);

    g.emitPin('dragMove', { pinId: g.group.anchor.id, pin: { x: 3350, y: 2150, rotation: 0, config: { puppeteer: { groupId: g.group.id } } } });
    near(g.tile.object.mesh.position.x, 3750);
});

test('after a drag, the drop does not glide: the members stay where they were drawn', async (t) => {
    const g = await gate(t);
    g.emitPin('dragMove', { pinId: g.group.anchor.id, pin: { x: 3300, y: 2100, rotation: 0, config: { puppeteer: { groupId: g.group.id } } } });
    g.advance(100);
    await g.pins.update(g.group.anchor.id, { x: 3300, y: 2100 });        // the drop is saved
    await g.settle();
    g.ticker.run();
    assert.equal(g.ticker.fns.size, 0, 'no glide was started');
    // The documents are at the destination, and so is what is drawn.
    near(g.tile._source.x, 3700);
    near(g.tile.object.mesh.position.x, 3700);
});

test('a drag event for a pin that is no group\'s, or another group\'s, is ignored', async (t) => {
    const g = await gate(t);
    g.emitPin('dragMove', { pinId: 'someone-elses', pin: { x: 1, y: 1, config: { puppeteer: { groupId: 'nope' } } } });
    g.emitPin('dragMove', { pinId: 'other', pin: { x: 1, y: 1, config: {} } });
    g.emitPin('dragMove', { pinId: 'wrong-pin', pin: { x: 1, y: 1, config: { puppeteer: { groupId: g.group.id } } } });
    assert.equal(g.tile.object.mesh.position.x, null);
});

test('a second move during a glide eases on from where the group is drawn, with no snap back', async (t) => {
    const g = await gate(t);
    await g.pins.update(g.group.anchor.id, { x: 3400, y: 2000 });
    await g.settle();
    g.ticker.run();
    g.advance(100);
    g.ticker.run();
    const mid = g.tile.object.mesh.position.x;                            // somewhere between 3400 and 3800

    await g.pins.update(g.group.anchor.id, { x: 3800, y: 2000 });         // the pin moves again, 400 further
    await g.settle();
    g.ticker.run();                                                       // the first frame of the second glide
    near(g.tile.object.mesh.position.x, mid, 0.5);
});

test('lights are not drawn by the tween, and a group with nothing to tween does no work', async (t) => {
    const g = await gate(t);
    g.light.object = { position: sprite().position, document: g.light };
    await g.pins.update(g.group.anchor.id, { x: 3400, y: 2000 });
    await g.settle();
    g.ticker.run();
    g.advance(100);
    g.ticker.run();
    assert.equal(g.light.object.position.x, null);
});

test('the tween never changes a document', async (t) => {
    const g = await gate(t);
    await g.pins.update(g.group.anchor.id, { x: 3400, y: 2000 });
    await g.settle();
    const final = JSON.stringify([g.tile._source, g.note._source]);
    g.ticker.run();
    g.advance(100);
    g.ticker.run();
    g.emitPin('dragMove', { pinId: g.group.anchor.id, pin: { x: 3500, y: 2000, rotation: 0, config: { puppeteer: { groupId: g.group.id } } } });
    assert.equal(JSON.stringify([g.tile._source, g.note._source]), final);
});
