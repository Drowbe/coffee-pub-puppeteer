// Run with: node --test tests/*.test.mjs
// Selecting one member of a group on the canvas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';

function canvasWith(scene, { pivot = { x: 1000, y: 1000 }, size = { width: 1000, height: 800 }, scale = 1 } = {}) {
    const calls = { activated: [], controlled: [], panned: [] };
    globalThis.canvas = {
        stage: { pivot: { ...pivot }, scale: { x: scale } },
        app: { screen: { ...size } },
        getLayerByEmbeddedName: (type) => ({ activate: () => calls.activated.push(type) }),
        animatePan: (options) => calls.panned.push(options)
    };
    const giveObject = (doc, bounds) => {
        doc.object = { bounds, control: (options) => calls.controlled.push({ id: doc.id, ...options }) };
    };
    return { calls, giveObject };
}

test('selecting a member switches to its layer and selects only it', async () => {
    const env = installFakes();
    const { selectMember } = await import('../scripts/groups.js');
    const { calls, giveObject } = canvasWith(env.scene);
    const light = env.scene.add('AmbientLight', 'L1', { x: 1000, y: 1000 });
    giveObject(light, { x: 990, y: 990, width: 20, height: 20 });

    assert.equal(selectMember(env.scene, 'AmbientLight', 'L1'), true);
    assert.deepEqual(calls.activated, ['AmbientLight']);
    assert.deepEqual(calls.controlled, [{ id: 'L1', releaseOthers: true }]);
    assert.deepEqual(calls.panned, [], 'it is already in view');
});

test('Shift adds to the selection instead of replacing it', async () => {
    const env = installFakes();
    const { selectMember } = await import('../scripts/groups.js');
    const { calls, giveObject } = canvasWith(env.scene);
    const wall = env.scene.add('Wall', 'W1', { c: [900, 900, 1100, 900] });
    giveObject(wall, { x: 900, y: 900, width: 200, height: 1 });
    selectMember(env.scene, 'Wall', 'W1', { add: true });
    assert.deepEqual(calls.controlled, [{ id: 'W1', releaseOthers: false }]);
});

test('a member that is off screen is brought into view, centred on itself', async () => {
    const env = installFakes();
    const { selectMember } = await import('../scripts/groups.js');
    const { calls, giveObject } = canvasWith(env.scene);
    const tile = env.scene.add('Tile', 'T1', { x: 9000, y: 6000 });
    giveObject(tile, { x: 8800, y: 5800, width: 400, height: 400 });
    selectMember(env.scene, 'Tile', 'T1');
    assert.equal(calls.panned.length, 1);
    assert.equal(calls.panned[0].x, 9000);
    assert.equal(calls.panned[0].y, 6000);
});

test('zoom is taken into account when deciding what is in view', async () => {
    const env = installFakes();
    const { selectMember } = await import('../scripts/groups.js');
    // Zoomed in 4x, the screen shows only 250 by 200 scene pixels around the pivot.
    const { calls, giveObject } = canvasWith(env.scene, { scale: 4 });
    const sound = env.scene.add('AmbientSound', 'S1', { x: 1400, y: 1000 });
    giveObject(sound, { x: 1390, y: 990, width: 20, height: 20 });
    selectMember(env.scene, 'AmbientSound', 'S1');
    assert.equal(calls.panned.length, 1);
});

test('a member that is not on the canvas selects nothing and says so', async () => {
    const env = installFakes();
    const { selectMember } = await import('../scripts/groups.js');
    const { calls } = canvasWith(env.scene);
    env.scene.add('Note', 'N1', { x: 1, y: 1 });          // a document with no placeable on screen
    assert.equal(selectMember(env.scene, 'Note', 'N1'), false);
    assert.equal(selectMember(env.scene, 'Note', 'nope'), false);
    assert.deepEqual(calls.activated, []);
    assert.deepEqual(calls.controlled, []);
});
