// Run with: node --test tests/*.test.mjs
// Sorting the library into categories.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';

async function shelf() {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const library = await import('../scripts/library.js');
    const { scene } = env;
    const tile = scene.add('Tile', 'T1', { x: 3000, y: 2000, width: 200, height: 200, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const group = await groups.createGroup(scene, { x: 3000, y: 2000 }, { name: 'Cart' });
    await groups.addMembers(scene, group.id, [tile]);
    await env.settle();
    const cart = await library.saveGroupToLibrary(scene, group.id);
    const hut = await library.saveGroupToLibrary(scene, group.id);
    await library.renameTemplate(hut, 'Hut');
    return { ...env, groups, library, group, cart, hut };
}

const entry = (g, id) => g.library.listTemplates().find((template) => template.id === id);

test('entries start uncategorised, and an entry put in a category is listed in it', async () => {
    const g = await shelf();
    assert.equal(entry(g, g.cart).category, null);
    const vehicles = await g.library.createCategory('Vehicles');
    await g.library.setTemplateCategory(g.cart, vehicles);
    assert.equal(entry(g, g.cart).category, vehicles);
    assert.equal(entry(g, g.hut).category, null);
    assert.deepEqual(g.library.listCategories().map((c) => [c.name, c.count]), [['Vehicles', 1]]);
    await g.library.setTemplateCategory(g.cart, null);
    assert.equal(entry(g, g.cart).category, null);
});

test('categories are named, listed by name, and their names are not repeated', async () => {
    const g = await shelf();
    await g.library.createCategory('Vehicles');
    await g.library.createCategory('Buildings');
    assert.deepEqual(g.library.listCategories().map((c) => c.name), ['Buildings', 'Vehicles']);
    await assert.rejects(() => g.library.createCategory(' vehicles '), /already a category/);
    await assert.rejects(() => g.library.createCategory('  '), /needs a name/);
    const [buildings] = g.library.listCategories();
    await g.library.renameCategory(buildings.id, 'Structures');
    assert.deepEqual(g.library.listCategories().map((c) => c.name), ['Structures', 'Vehicles']);
    await assert.rejects(() => g.library.renameCategory(buildings.id, 'Vehicles'), /already a category/);
    await g.library.renameCategory(buildings.id, 'STRUCTURES');          // its own name, differently written, is allowed
});

test('an entry cannot be put in a category that is not there', async () => {
    const g = await shelf();
    await assert.rejects(() => g.library.setTemplateCategory(g.cart, 'nothing'), /no category/);
    await assert.rejects(() => g.library.setTemplateCategory('nothing', null), /no template/);
});

test('deleting a category keeps its entries, uncategorised', async () => {
    const g = await shelf();
    const vehicles = await g.library.createCategory('Vehicles');
    await g.library.setTemplateCategory(g.cart, vehicles);
    assert.equal(await g.library.deleteCategory(vehicles), true);
    assert.equal(await g.library.deleteCategory(vehicles), false);
    assert.equal(g.library.listTemplates().length, 2);
    assert.equal(entry(g, g.cart).category, null);
    assert.equal('category' in g.library.getTemplate(g.cart), false);
});

test('replacing an entry from a group keeps its category', async () => {
    const g = await shelf();
    const vehicles = await g.library.createCategory('Vehicles');
    await g.library.setTemplateCategory(g.cart, vehicles);
    await g.library.updateTemplateFromGroup(g.scene, g.group.id, g.cart);
    assert.equal(entry(g, g.cart).category, vehicles);
});

test('a file names the category, and importing it finds or makes the one of that name', async () => {
    const g = await shelf();
    const vehicles = await g.library.createCategory('Vehicles');
    await g.library.setTemplateCategory(g.cart, vehicles);
    const file = g.library.exportTemplateData(g.cart);
    assert.equal(file.category, 'Vehicles');
    assert.equal(g.library.exportTemplateData(g.hut).category, undefined);

    const same = await g.library.importTemplate(JSON.stringify(file));
    assert.equal(entry(g, same).category, vehicles, 'the category here of that name');
    await g.library.deleteCategory(vehicles);
    const made = await g.library.importTemplate(JSON.stringify(file));
    const [created] = g.library.listCategories();
    assert.equal(created.name, 'Vehicles');
    assert.equal(entry(g, made).category, created.id, 'made when it is not there');
    assert.equal('category' in g.library.getTemplate(made) && typeof g.library.getTemplate(made).category, 'string');
});
