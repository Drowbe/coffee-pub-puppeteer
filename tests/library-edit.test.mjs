// Run with: node --test tests/*.test.mjs
// Library entries can be renamed, described and updated from a group.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';

async function drawbridge() {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const library = await import('../scripts/library.js');
    const { registerFollower } = await import('../scripts/follower.js');
    registerFollower();
    const { scene } = env;
    const deck = scene.add('Tile', 'T1', { x: 1000, y: 1000, width: 400, height: 200, rotation: 0, texture: { src: 'deck.webp', anchorX: 0.5, anchorY: 0.5 } });
    const lamp = scene.add('AmbientLight', 'L1', { x: 1100, y: 1050, rotation: 0 });
    const group = await groups.createGroup(scene, { x: 1000, y: 1100 }, { name: 'Drawbridge' });
    await groups.addMembers(scene, group.id, [deck, lamp]);
    await env.settle();
    return { ...env, groups, library, group };
}

test('an entry can be renamed and described, and both are listed', async () => {
    const { scene, library, group } = await drawbridge();
    const id = await library.saveGroupToLibrary(scene, group.id);
    await library.renameTemplate(id, '  Castle drawbridge  ');
    await library.setTemplateDescription(id, 'Raises and lowers, with one lamp.');
    const entry = library.listTemplates()[0];
    assert.equal(entry.name, 'Castle drawbridge');
    assert.equal(entry.description, 'Raises and lowers, with one lamp.');

    await library.setTemplateDescription(id, '   ');
    assert.equal(library.listTemplates()[0].description, '');
    assert.equal('description' in library.getTemplate(id), false);

    await assert.rejects(() => library.renameTemplate(id, '  '), /needs a name/);
    await assert.rejects(() => library.renameTemplate('nope', 'x'), /no template/);
});

test('updating an entry from a group replaces its parts and keeps its id, name and description', async () => {
    const { scene, library, group, groups, settle } = await drawbridge();
    const id = await library.saveGroupToLibrary(scene, group.id);
    await library.renameTemplate(id, 'Bridge');
    await library.setTemplateDescription(id, 'Original.');
    const placed = await library.stampTemplate(scene, id, { x: 6000, y: 3000 });
    const placedCount = placed.members.length;

    // The group on the scene gains a part, then the entry is brought up to date from it.
    const extra = scene.add('Tile', 'T9', { x: 1200, y: 1000, width: 100, height: 100, rotation: 0, texture: { src: 'extra.webp', anchorX: 0.5, anchorY: 0.5 } });
    await groups.addMembers(scene, group.id, [extra]);
    await settle();
    await library.updateTemplateFromGroup(scene, group.id, id);

    assert.equal(library.listTemplates().length, 1);
    assert.equal(library.getTemplate(id).members.length, 3);
    assert.equal(library.getTemplate(id).name, 'Bridge');
    assert.equal(library.getTemplate(id).description, 'Original.');
    // The copy placed earlier is its own and is not changed.
    assert.equal(scene.getFlag('coffee-pub-puppeteer', 'groups')[placed.id].members.length, placedCount);
    await assert.rejects(() => library.updateTemplateFromGroup(scene, group.id, 'nope'), /no template/);
});

test('an entry saved before descriptions existed still lists and fabricates', async () => {
    const { scene, library, group } = await drawbridge();
    const id = await library.saveGroupToLibrary(scene, group.id);
    assert.equal(library.listTemplates()[0].description, '');
    const placed = await library.stampTemplate(scene, id, { x: 6000, y: 3000 });
    assert.equal(placed.members.length, 2);
});
