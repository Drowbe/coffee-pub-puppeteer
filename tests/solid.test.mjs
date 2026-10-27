// Run with: node --test tests/*.test.mjs
// Boarding by the solid part of a picture: the transparent parts of a tile do not count as on the group.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';

// An 800 by 400 tile centred on the pin at (3000, 2000). Its picture is solid only in the left half (x < 3000), which a
// stand-in for Foundry's mesh reports through containsCanvasPoint.
async function ship() {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const riders = await import('../scripts/riders.js');
    const { scene } = env;
    const tile = scene.add('Tile', 'T1', { x: 3000, y: 2000, width: 800, height: 400, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const asked = [];
    globalThis.canvas.tiles = {
        get: (id) => (id === 'T1' ? { mesh: { containsCanvasPoint: (point, threshold) => { asked.push(threshold); return point.x < 3000; } } } : undefined)
    };
    const group = await groups.createGroup(scene, { x: 3000, y: 2000 }, { name: 'Ship' });
    await groups.addMembers(scene, group.id, [tile]);
    await env.settle();
    return { ...env, groups, riders, group, asked };
}

const live = (g) => g.scene.getFlag('coffee-pub-puppeteer', 'groups')[g.group.id];

test('a point on the solid part of a picture is on the group; one on a transparent part is not', async () => {
    const g = await ship();
    assert.equal(g.riders.insideGroup(g.scene, live(g), { x: 2800, y: 2000 }), true);
    assert.equal(g.riders.insideGroup(g.scene, live(g), { x: 3200, y: 2000 }), false);
});

test('a point outside the box is never on the group', async () => {
    const g = await ship();
    assert.equal(g.riders.insideGroup(g.scene, live(g), { x: 2000, y: 2000 }), false);
});

test('with solid parts only turned off, the whole box counts', async () => {
    const g = await ship();
    await g.groups.setBehaviour(g.scene, g.group.id, { solidOnly: false });
    assert.equal(live(g).solidOnly, false);
    assert.equal(g.riders.insideGroup(g.scene, live(g), { x: 3200, y: 2000 }), true);
    await g.groups.setBehaviour(g.scene, g.group.id, { solidOnly: true });
    assert.equal('solidOnly' in live(g), false);
    assert.equal(g.riders.insideGroup(g.scene, live(g), { x: 3200, y: 2000 }), false);
});

test('a tile that has not been drawn cannot be judged, so the box counts', async () => {
    const g = await ship();
    globalThis.canvas.tiles = { get: () => undefined };
    assert.equal(g.riders.insideGroup(g.scene, live(g), { x: 3200, y: 2000 }), true);
});

test('the tile\'s own higher alpha threshold is honoured, and 0.25 is the least asked for', async () => {
    const g = await ship();
    g.riders.insideGroup(g.scene, live(g), { x: 2800, y: 2000 });
    assert.deepEqual(g.asked, [0.25]);
    g.tile ??= g.scene.getEmbeddedCollection('Tile').get('T1');
    g.scene.getEmbeddedCollection('Tile').get('T1')._source.texture.alphaThreshold = 0.6;
    g.asked.length = 0;
    g.riders.insideGroup(g.scene, live(g), { x: 2800, y: 2000 });
    assert.deepEqual(g.asked, [0.6]);
});

test('a token standing on a transparent corner cannot board; one on the solid part can', async () => {
    const g = await ship();
    const dry = g.scene.addToken('R1', { x: 2750, y: 1950, name: 'Dry' });       // middle 2800, 2000: solid
    const wet = g.scene.addToken('R2', { x: 3150, y: 1950, name: 'Wet' });       // middle 3200, 2000: transparent
    const aboard = await g.groups.mountTokens(g.scene, g.group.id, [dry]);
    assert.equal(aboard.mounted, 1);
    const off = await g.groups.mountTokens(g.scene, g.group.id, [wet]);
    assert.equal(off.mounted, 0);
    assert.match(off.skipped[0], /Wet is not on the group/);
});
