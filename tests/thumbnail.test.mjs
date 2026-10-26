// Run with: node --test tests/*.test.mjs
// The thumbnail of a group: what it shows and where, and that a library entry still saves without one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';
import { thumbnailPlan, makeThumbnail, THUMBNAIL_SIZE } from '../scripts/thumbnail.js';
import { validateTemplate } from '../scripts/template.js';

const live = (g) => g.scene.getFlag('coffee-pub-puppeteer', 'groups')[g.group.id];
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

async function cart() {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const library = await import('../scripts/library.js');
    const { scene } = env;
    // A deck 800 by 400 turned a quarter, a wall along its left edge, a lantern and a hum.
    const deck = scene.add('Tile', 'T1', { x: 3000, y: 2000, width: 800, height: 400, rotation: 0, texture: { src: 'cart.webp', anchorX: 0.5, anchorY: 0.5 }, alpha: 0.8 });
    const wall = scene.add('Wall', 'W1', { c: [2600, 1800, 2600, 2200] });
    const lamp = scene.add('AmbientLight', 'L1', { x: 3300, y: 2000 });
    const hum = scene.add('AmbientSound', 'S1', { x: 3000, y: 2100 });
    const group = await groups.createGroup(scene, { x: 3000, y: 2000 }, { name: 'Cart' });
    await groups.addMembers(scene, group.id, [deck, wall, lamp, hum]);
    await env.settle();
    return { ...env, groups, library, group };
}

test('the plan fits the group into a square, centred, with every kind of part', async () => {
    const g = await cart();
    const plan = thumbnailPlan(g.scene, live(g));
    assert.equal(plan.size, THUMBNAIL_SIZE);
    // The group spans x 2600..3400 (800) and y 1800..2200 (400): the long side fills the square less its padding.
    near(plan.scale, (THUMBNAIL_SIZE - 12) / 800);
    // Its middle (3000, 2000) lands in the middle of the square.
    near((3000 * plan.scale) + plan.offset.x, THUMBNAIL_SIZE / 2);
    near((2000 * plan.scale) + plan.offset.y, THUMBNAIL_SIZE / 2);
    assert.deepEqual(plan.items.map((item) => item.kind).sort(), ['point', 'sound', 'tile', 'wall']);
});

test('a tile carries what is needed to draw its picture where it is', async () => {
    const g = await cart();
    const tile = thumbnailPlan(g.scene, live(g)).items.find((item) => item.kind === 'tile');
    assert.equal(tile.src, 'cart.webp');
    assert.deepEqual([tile.x, tile.y, tile.width, tile.height, tile.rotation], [3000, 2000, 800, 400, 0]);
    assert.deepEqual([tile.anchorX, tile.anchorY, tile.scaleX, tile.scaleY, tile.alpha], [0.5, 0.5, 1, 1, 0.8]);
});

test('a group with nothing on the scene has no plan', async () => {
    const g = await cart();
    g.scene.collections.Tile.clear();
    g.scene.collections.Wall.clear();
    g.scene.collections.AmbientLight.clear();
    g.scene.collections.AmbientSound.clear();
    assert.equal(thumbnailPlan(g.scene, live(g)), null);
});

test('without a canvas to draw on there is no thumbnail, and no error', async () => {
    const g = await cart();
    assert.equal(await makeThumbnail(g.scene, live(g)), null);
});

test('a library entry still saves, lists and updates when no thumbnail can be drawn', async () => {
    const g = await cart();
    const id = await g.library.saveGroupToLibrary(g.scene, g.group.id);
    assert.equal(g.library.listTemplates()[0].thumbnail, null);
    await g.library.updateTemplateFromGroup(g.scene, g.group.id, id);
    assert.equal(g.library.listTemplates().length, 1);
});

test('a thumbnail on an entry is kept by an update that cannot draw a new one, listed, and must be an image', async () => {
    const g = await cart();
    const id = await g.library.saveGroupToLibrary(g.scene, g.group.id);
    const template = g.library.getTemplate(id);
    template.thumbnail = 'data:image/webp;base64,AAAA';
    await g.library.saveTemplate(template, id);
    assert.equal(g.library.listTemplates()[0].thumbnail, 'data:image/webp;base64,AAAA');

    assert.doesNotThrow(() => validateTemplate(template));
    assert.throws(() => validateTemplate({ ...template, thumbnail: 'http://elsewhere/x.png' }), /not an image/);
    assert.throws(() => validateTemplate({ ...template, thumbnail: 42 }), /not an image/);
});
