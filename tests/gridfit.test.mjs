// Run with: node --test tests/*.test.mjs
// A group saved on one size of square is made the same number of squares wide on a scene with another.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';

const near = (a, b, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

async function wagon(gridSize = 140) {
    const env = installFakes();
    env.scene.grid.size = gridSize;
    env.scene.grid.sizeX = gridSize;
    env.scene.grid.sizeY = gridSize;
    const groups = await import('../scripts/groups.js');
    const library = await import('../scripts/library.js');
    const { registerFollower } = await import('../scripts/follower.js');
    registerFollower();
    const { scene } = env;
    // Ten squares of the saved grid wide, with a light, a sound, a wall and a drawing.
    const deck = scene.add('Tile', 'T1', { x: 1000, y: 1000, width: 10 * gridSize, height: 4 * gridSize, rotation: 0, texture: { src: 'deck.webp', anchorX: 0.5, anchorY: 0.5 } });
    const lamp = scene.add('AmbientLight', 'L1', { x: 1000 + gridSize, y: 1000, rotation: 0, config: { dim: 30, bright: 15 } });
    const bell = scene.add('AmbientSound', 'S1', { x: 1000, y: 1000 - gridSize, radius: 20 });
    const rail = scene.add('Wall', 'W1', { c: [1000 - (5 * gridSize), 1000, 1000 + (5 * gridSize), 1000] });
    const mark = scene.add('Drawing', 'D1', { x: 1000, y: 1000, shape: { type: 'r', width: 2 * gridSize, height: gridSize }, strokeWidth: 4 });
    const group = await groups.createGroup(scene, { x: 1000, y: 1000 }, { name: 'Wagon' });
    await groups.addMembers(scene, group.id, [deck, lamp, bell, rail, mark]);
    await env.settle();
    return { ...env, groups, library, group };
}

const setGrid = (scene, size) => { scene.grid.size = size; scene.grid.sizeX = size; scene.grid.sizeY = size; };
const only = (scene, type, id) => scene.collections[type].get(id);
const stampedOf = (scene, type, saved) => [...scene.collections[type].values()].find((doc) => doc.id !== saved);

test('a saved group records the size of a square it was made on', async () => {
    const g = await wagon(140);
    const id = await g.library.saveGroupToLibrary(g.scene, g.group.id);
    assert.equal(g.library.getTemplate(id).gridSize, 140);
});

test('on a smaller grid it is made the same number of squares wide, in everything measured in pixels', async () => {
    const g = await wagon(140);
    const id = await g.library.saveGroupToLibrary(g.scene, g.group.id);
    setGrid(g.scene, 100);
    await g.library.stampTemplate(g.scene, id, { x: 5000, y: 3000 });
    await g.settle();
    const tile = stampedOf(g.scene, 'Tile', 'T1');
    near(tile._source.width, 1000);                       // ten squares of 100
    near(tile._source.height, 400);
    near(stampedOf(g.scene, 'Wall', 'W1')._source.c[2] - stampedOf(g.scene, 'Wall', 'W1')._source.c[0], 1000);
    const mark = stampedOf(g.scene, 'Drawing', 'D1');
    near(mark._source.shape.width, 200);
    const lamp = stampedOf(g.scene, 'AmbientLight', 'L1');
    near(lamp._source.x - tile._source.x, 100);           // a square to the right of the middle, as before
    // Distances are in the scene's own units, which already follow the grid: not resized.
    assert.equal(lamp._source.config.dim, 30);
    assert.equal(lamp._source.config.bright, 15);
    assert.equal(stampedOf(g.scene, 'AmbientSound', 'S1')._source.radius, 20);
});

test('on a larger grid it is made larger', async () => {
    const g = await wagon(100);
    const id = await g.library.saveGroupToLibrary(g.scene, g.group.id);
    setGrid(g.scene, 140);
    await g.library.stampTemplate(g.scene, id, { x: 5000, y: 3000 });
    await g.settle();
    near(stampedOf(g.scene, 'Tile', 'T1')._source.width, 1400);
});

test('the same grid, or an entry saved before the size was kept, is left as it is', async () => {
    const g = await wagon(140);
    const id = await g.library.saveGroupToLibrary(g.scene, g.group.id);
    await g.library.stampTemplate(g.scene, id, { x: 5000, y: 3000 });
    await g.settle();
    near(stampedOf(g.scene, 'Tile', 'T1')._source.width, 1400);

    const old = structuredClone(g.library.getTemplate(id));
    delete old.gridSize;
    setGrid(g.scene, 100);
    await g.library.stampTemplate(g.scene, old, { x: 7000, y: 3000 });
    await g.settle();
    const widths = [...g.scene.collections.Tile.values()].map((tile) => tile._source.width);
    assert.equal(widths.filter((width) => Math.abs(width - 1400) < 1).length, 3);
});

test('keepPixels makes it the same size in pixels', async () => {
    const g = await wagon(140);
    const id = await g.library.saveGroupToLibrary(g.scene, g.group.id);
    setGrid(g.scene, 100);
    await g.library.stampTemplate(g.scene, id, { x: 5000, y: 3000 }, { keepPixels: true });
    await g.settle();
    near(stampedOf(g.scene, 'Tile', 'T1')._source.width, 1400);
});

test('the copy it makes behaves as a group of the new size: riders and the group move together', async () => {
    const g = await wagon(140);
    const id = await g.library.saveGroupToLibrary(g.scene, g.group.id);
    setGrid(g.scene, 100);
    const copy = await g.library.stampTemplate(g.scene, id, { x: 5000, y: 3000 });
    await g.settle();
    const tile = g.scene.collections.Tile.get(copy.members.find((m) => m.type === 'Tile').id);
    near(tile._source.x, 5000);
    await g.pins.update(copy.anchor.id, { x: 5500, y: 3000 });
    await g.settle();
    near(tile._source.x, 5500);
    near(tile._source.width, 1000);
});

test('Duplicate on the same scene is not resized', async () => {
    const g = await wagon(140);
    const copy = await g.library.duplicateGroup(g.scene, g.group.id);
    const tile = g.scene.collections.Tile.get(copy.members.find((m) => m.type === 'Tile').id);
    near(tile._source.width, 1400);
    assert.equal(only(g.scene, 'Tile', 'T1')._source.width, 1400);
});
