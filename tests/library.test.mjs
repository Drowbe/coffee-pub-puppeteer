// Run with: node --test tests/*.test.mjs
// Saving a group to the library and stamping it, against the stand-in scene.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';
import { rotate } from '../scripts/geometry.js';

const near = (a, b, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

async function drawbridge() {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const library = await import('../scripts/library.js');
    const { registerFollower } = await import('../scripts/follower.js');
    registerFollower();

    const { scene } = env;
    const deck = scene.add('Tile', 'T1', { x: 1000, y: 1000, width: 400, height: 200, rotation: 0, texture: { src: 'deck.webp', anchorX: 0.5, anchorY: 0.5 } });
    const lamp = scene.add('AmbientLight', 'L1', { x: 1100, y: 1050, rotation: 0, config: { dim: 30 } });
    const rail = scene.add('Wall', 'W1', { c: [1000, 1000, 1400, 1000] });
    const group = await groups.createGroup(scene, { x: 1000, y: 1100 }, { name: 'Drawbridge' });
    await groups.addMembers(scene, group.id, [deck, lamp, rail]);
    await groups.renameMember(scene, group.id, 'AmbientLight', 'L1', 'Gate lamp');
    await env.settle();
    return { ...env, groups, library, group };
}

const allOf = (scene, type) => [...scene.collections[type].values()];

test('a group saved to the library can be listed and read back', async () => {
    const { scene, library, group } = await drawbridge();
    const id = await library.saveGroupToLibrary(scene, group.id);
    const list = library.listTemplates();
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'Drawbridge');
    assert.equal(list[0].members, 3);
    assert.equal(library.getTemplate(id).members.length, 3);
});

test('stamping puts a full copy on the scene and leaves the original alone', async () => {
    const { scene, library, group, settle } = await drawbridge();
    const id = await library.saveGroupToLibrary(scene, group.id);
    const original = JSON.stringify(scene.collections.Tile.get('T1')._source);

    const stamped = await library.stampTemplate(scene, id, { x: 5000, y: 3000 });
    await settle();

    assert.equal(allOf(scene, 'Tile').length, 2);
    assert.equal(allOf(scene, 'AmbientLight').length, 2);
    assert.equal(allOf(scene, 'Wall').length, 2);
    assert.equal(JSON.stringify(scene.collections.Tile.get('T1')._source), original, 'the original tile is untouched');

    // The copy sits at its own pivot: the tile's anchor point is the same distance from it as in the original,
    // which is (0, -100) from the pivot at (1000, 1100).
    const copy = scene.collections.Tile.get(stamped.members.find((m) => m.type === 'Tile').id);
    near(copy._source.x - 5000, 1000 - 1000);
    near(copy._source.y - 3000, 1000 - 1100);
    assert.equal(copy._source.texture.src, 'deck.webp');
});

test('the stamped group keeps its names and is a working group', async () => {
    const { scene, pins, library, group, settle, groups } = await drawbridge();
    const id = await library.saveGroupToLibrary(scene, group.id);
    const stamped = await library.stampTemplate(scene, id, { x: 5000, y: 3000 }, { name: 'Second bridge' });
    await settle();

    assert.equal(stamped.name, 'Second bridge');
    assert.equal(stamped.members.find((m) => m.type === 'AmbientLight').label, 'Gate lamp');

    // Drag its pin: its members follow, the first group's do not.
    const lampOf = (g) => scene.collections.AmbientLight.get(g.members.find((m) => m.type === 'AmbientLight').id);
    const firstLamp = scene.collections.AmbientLight.get('L1');
    const lampBefore = { ...lampOf(stamped)._source };
    const firstBefore = { x: firstLamp._source.x, y: firstLamp._source.y };
    await pins.update(stamped.anchor.id, { x: 5600, y: 3300 });
    await settle();
    near(lampOf(stamped)._source.x - lampBefore.x, 600);
    near(lampOf(stamped)._source.y - lampBefore.y, 300);
    assert.deepEqual({ x: firstLamp._source.x, y: firstLamp._source.y }, firstBefore);
    assert.equal(groups.listGroups(scene).length, 2);
});

test('stamping onto a heading turns the copy about its pivot', async () => {
    const { scene, library, group, settle } = await drawbridge();
    const id = await library.saveGroupToLibrary(scene, group.id);
    const stamped = await library.stampTemplate(scene, id, { x: 4000, y: 2000 }, { heading: 90 });
    await settle();

    const light = scene.collections.AmbientLight.get(stamped.members.find((m) => m.type === 'AmbientLight').id);
    // In the original the lamp is (100, -50) from the pivot (1000, 1100); turned 90 degrees about the new pivot.
    const r = rotate(1100 - 1000, 1050 - 1100, 90);
    near(light._source.x, 4000 + r.x);
    near(light._source.y, 2000 + r.y);
    near(light._source.rotation, 90, 1e-6);
    assert.equal(stamped.heading, 90);
});

test('two stamps are two groups with their own pins', async () => {
    const { scene, pins, library, group, settle } = await drawbridge();
    const id = await library.saveGroupToLibrary(scene, group.id);
    const a = await library.stampTemplate(scene, id, { x: 4000, y: 2000 });
    const b = await library.stampTemplate(scene, id, { x: 7000, y: 2000 });
    await settle();
    assert.notEqual(a.id, b.id);
    assert.notEqual(a.anchor.id, b.anchor.id);
    assert.ok(pins.exists(a.anchor.id) && pins.exists(b.anchor.id));
    const ids = new Set([...a.members, ...b.members].map((m) => m.id));
    assert.equal(ids.size, 6, 'no member is shared between the copies');
});

test('a template imported from JSON can be stamped; bad JSON is refused with a reason', async () => {
    const { scene, library, group, settle } = await drawbridge();
    const id = await library.saveGroupToLibrary(scene, group.id);
    const text = JSON.stringify(library.getTemplate(id));
    await library.deleteTemplate(id);
    assert.equal(library.listTemplates().length, 0);

    const again = await library.importTemplate(text);
    assert.equal(library.listTemplates().length, 1);
    const stamped = await library.stampTemplate(scene, again, { x: 100, y: 100 });
    await settle();
    assert.equal(stamped.members.length, 3);

    await assert.rejects(library.importTemplate('not json'), /not JSON/);
    await assert.rejects(library.importTemplate('{"version":99}'), /not a usable template/);
});

test('deleting a library entry does not touch groups already placed', async () => {
    const { scene, library, group, groups, settle } = await drawbridge();
    const id = await library.saveGroupToLibrary(scene, group.id);
    await library.stampTemplate(scene, id, { x: 100, y: 100 });
    await library.deleteTemplate(id);
    await settle();
    assert.equal(groups.listGroups(scene).length, 2);
    assert.equal(await library.deleteTemplate(id), false);
});

test('deleting a group does not touch the library entry saved from it', async () => {
    const { scene, library, group, groups, settle } = await drawbridge();
    const id = await library.saveGroupToLibrary(scene, group.id);
    await groups.deleteGroup(scene, group.id, { removeMembers: true });
    await settle();
    assert.equal(library.listTemplates().length, 1);
    assert.equal(library.getTemplate(id).members.length, 3);
    // And it still stamps.
    const again = await library.stampTemplate(scene, id, { x: 4000, y: 2000 });
    assert.equal(again.members.length, 3);
});

test('a stamp ties each part to its own document even when Foundry returns them in another order', async () => {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const library = await import('../scripts/library.js');
    const { scene } = env;
    const bed = scene.add('Tile', 'T1', { x: 3000, y: 2000, width: 400, height: 800, rotation: 0, texture: { src: 'bed.webp', anchorX: 0.5, anchorY: 0.5 } });
    const canopy = scene.add('Tile', 'T2', { x: 3000, y: 2000, width: 400, height: 800, rotation: 90, texture: { src: 'canopy.webp', anchorX: 0.5, anchorY: 0.5 } });
    const horse = scene.add('Tile', 'T3', { x: 3000, y: 1500, width: 200, height: 400, rotation: 180, texture: { src: 'horse.webm', anchorX: 0.5, anchorY: 0.5 } });
    const group = await groups.createGroup(scene, { x: 3000, y: 2200 }, { name: 'Wagon' });
    await groups.addMembers(scene, group.id, [bed, canopy, horse]);
    await env.settle();

    const copy = await library.stampTemplate(scene, library.getTemplate(await library.saveGroupToLibrary(scene, group.id)), { x: 6000, y: 2200 });
    await env.settle();
    for (const member of copy.members) {
        const doc = scene.getEmbeddedCollection('Tile').get(member.id);
        const art = doc._source.texture.src.split('.')[0];
        const original = { bed, canopy, horse }[art]._source;
        assert.deepEqual([doc._source.x, doc._source.y], [original.x + 3000, original.y], `${art} place`);
        assert.equal(doc._source.rotation, original.rotation, `${art} rotation`);
        // and the group's record of that part is the record of that document
        const { memberUpdate } = await import('../scripts/geometry.js');
        const wanted = memberUpdate(member, doc._source, copy.applied);
        assert.deepEqual([doc._source.x, doc._source.y, doc._source.rotation], [wanted.x, wanted.y, wanted.rotation], `${art} record`);
    }
});

async function wagonWithBehaviour() {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const library = await import('../scripts/library.js');
    const { scene } = env;
    const bed = scene.add('Tile', 'T1', { x: 3000, y: 2000, width: 400, height: 800, rotation: 0, texture: { src: 'bed.webp', anchorX: 0.5, anchorY: 0.5 } });
    const canopy = scene.add('Tile', 'T2', { x: 3000, y: 2000, width: 400, height: 800, rotation: 0, texture: { src: 'canopy.webp', anchorX: 0.5, anchorY: 0.5 } });
    const group = await groups.createGroup(scene, { x: 3000, y: 2200 }, { name: 'Wagon' });
    await groups.addMembers(scene, group.id, [bed, canopy]);
    await groups.setMountable(scene, group.id, true);
    await groups.setBehaviour(scene, group.id, { ease: { mode: 'travel', speed: 4 }, facesTravel: true, front: 180, solidOnly: false, announce: true, ridersFree: false });
    await groups.addEvent(scene, group.id, { on: 'pause', do: 'stop' });
    await groups.addEvent(scene, group.id, { on: 'move', do: 'image', value: 'wrecked.webp', target: 'T2' });
    await env.settle();
    return { ...env, groups, library, group };
}

test('a library entry carries how the group behaves, so a fabricated group is mountable and moves as it did', async () => {
    const g = await wagonWithBehaviour();
    const id = await g.library.saveGroupToLibrary(g.scene, g.group.id);
    const copy = await g.library.stampTemplate(g.scene, id, { x: 6000, y: 2200 });
    assert.equal(copy.mountable, true);
    assert.deepEqual(copy.ease, { mode: 'travel', ms: 350, speed: 4 });
    assert.equal(copy.facesTravel, true);
    assert.equal(copy.front, 180);
    assert.equal(copy.solidOnly, false);
    assert.equal(copy.announce, true);
    assert.equal(copy.ridersFree, false);
    assert.equal(copy.events.length, 2);
});

test('a stamped event that changes a tile points at the stamp\'s own tile, not the original\'s', async () => {
    const g = await wagonWithBehaviour();
    const copy = await g.library.stampTemplate(g.scene, await g.library.saveGroupToLibrary(g.scene, g.group.id), { x: 6000, y: 2200 });
    const rule = copy.events.find((event) => event.do === 'image');
    assert.notEqual(rule.target, 'T2');
    assert.equal(copy.members[1].id, rule.target, 'the second part is the canopy');
    assert.equal('targetIndex' in rule, false);
});

test('an entry saved before behaviour travelled still stamps, with the defaults', async () => {
    const g = await wagonWithBehaviour();
    const template = g.groups.exportGroup(g.scene, g.group.id);
    delete template.behaviour;
    const copy = await g.library.stampTemplate(g.scene, template, { x: 6000, y: 2200 });
    assert.equal(copy.mountable, undefined);
    assert.equal(copy.events, undefined);
});

test('a duplicate points its events at its own tiles too', async () => {
    const g = await wagonWithBehaviour();
    const copy = await g.library.duplicateGroup(g.scene, g.group.id);
    assert.equal(copy.mountable, true);
    assert.equal(copy.events.find((event) => event.do === 'image').target, copy.members[1].id);
});

test('a name already on the scene is not used twice: the next stamp is numbered', async () => {
    const g = await wagonWithBehaviour();
    const id = await g.library.saveGroupToLibrary(g.scene, g.group.id);
    const one = await g.library.stampTemplate(g.scene, id, { x: 6000, y: 2200 });
    const two = await g.library.stampTemplate(g.scene, id, { x: 7000, y: 2200 });
    const three = await g.library.stampTemplate(g.scene, id, { x: 8000, y: 2200 }, { name: 'Wagon 2' });
    assert.deepEqual([one.name, two.name, three.name], ['Wagon 2', 'Wagon 3', 'Wagon 4']);
    assert.equal(g.groups.uniqueGroupName(g.scene, 'Cart'), 'Cart', 'a free name is kept');
    assert.equal(g.groups.uniqueGroupName(g.scene, 'WAGON'), 'WAGON 5', 'names are compared without regard to case, and count on past the ones taken');
    assert.equal(g.groups.uniqueGroupName(g.scene, '  '), 'Group');
});

test('a duplicate is numbered too, and its token is named for it', async () => {
    const g = await wagonWithBehaviour();
    game.actors.set('A1', { id: 'A1', name: 'Wagon actor', async getTokenDocument(data) { return { toObject: () => ({ name: 'Wagon actor', actorId: 'A1', ...data }) }; } });
    await g.groups.setBody(g.scene, g.group.id, 'A1');
    const first = await g.library.duplicateGroup(g.scene, g.group.id);
    const second = await g.library.duplicateGroup(g.scene, g.group.id);
    assert.deepEqual([first.name, second.name], ['Wagon copy', 'Wagon copy 2']);
    assert.equal(g.scene.tokens.get(first.body.tokenId)._source.name, 'Wagon copy');
    assert.equal(g.scene.tokens.get(second.body.tokenId)._source.name, 'Wagon copy 2');
    assert.notEqual(first.body.tokenId, second.body.tokenId);
    assert.equal(g.scene.tokens.get(first.body.tokenId)._source.actorLink, false, 'unlinked: its own hit points');
});
