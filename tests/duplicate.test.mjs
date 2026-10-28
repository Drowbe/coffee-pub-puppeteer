// Run with: node --test tests/*.test.mjs
// Duplicating a group on its own scene.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';

const near = (a, b, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);
const FLAG = 'coffee-pub-puppeteer';

async function wagon() {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const library = await import('../scripts/library.js');
    const follower = await import('../scripts/follower.js');
    follower.registerFollower();
    const { scene } = env;
    game.actors.set('A1', { id: 'A1', name: 'Warship', async getTokenDocument(data) { return { toObject: () => ({ name: 'Warship', actorId: 'A1', ...data }) }; } });

    const tile = scene.add('Tile', 'T1', { x: 3000, y: 2000, width: 400, height: 200, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const lamp = scene.add('AmbientLight', 'L1', { x: 3100, y: 2000, rotation: 0 });
    const hum = scene.add('AmbientSound', 'S1', { x: 3000, y: 2100, hidden: true });
    const group = await groups.createGroup(scene, { x: 3000, y: 2000 }, { name: 'Wagon', heading: 90 });
    await groups.addMembers(scene, group.id, [tile, lamp, hum]);
    await groups.renameMember(scene, group.id, 'AmbientLight', 'L1', 'Left lantern');
    await env.settle();
    return { ...env, groups, library, group, tile, lamp, hum };
}

const records = (g) => g.scene.getFlag(FLAG, 'groups');

test('a duplicate is a new group with its own parts and pin, two squares to the right, facing the same way', async () => {
    const g = await wagon();
    const copy = await g.library.duplicateGroup(g.scene, g.group.id);
    await g.settle();
    assert.notEqual(copy.id, g.group.id);
    assert.notEqual(copy.anchor.id, g.group.anchor.id);
    assert.equal(copy.name, 'Wagon copy');
    assert.equal(copy.members.length, 3);
    assert.equal(copy.members.find((m) => m.type === 'AmbientLight').label, 'Left lantern');

    const pin = g.pins.get(copy.anchor.id);
    near(pin.x, 3200);
    near(pin.y, 2000);
    near(pin.rotation, 90, 0.01);
    assert.equal(g.scene.collections.Tile.size, 2);
    assert.equal(Object.keys(records(g)).length, 2);
});

test('the original is untouched, and the two move independently', async () => {
    const g = await wagon();
    const before = JSON.stringify([g.tile._source, g.lamp._source, g.hum._source]);
    const copy = await g.library.duplicateGroup(g.scene, g.group.id);
    await g.settle();
    assert.equal(JSON.stringify([g.tile._source, g.lamp._source, g.hum._source]), before);

    const copyTile = g.scene.collections.Tile.get(copy.members.find((m) => m.type === 'Tile').id);
    const copyX = copyTile._source.x;
    await g.pins.update(copy.anchor.id, { x: copy.applied.x + 500 });
    await g.settle();
    near(copyTile._source.x - copyX, 500);
    assert.equal(g.tile._source.x, 3000);
});

test('the copy keeps the original\'s behaviour choices', async () => {
    const g = await wagon();
    await g.groups.setBehaviour(g.scene, g.group.id, { ease: { mode: 'jump', ms: 800 }, ridersFree: false, announce: true });
    await g.groups.setMountable(g.scene, g.group.id, true);
    const copy = await g.library.duplicateGroup(g.scene, g.group.id);
    assert.deepEqual(copy.ease, { mode: 'jump', ms: 800, speed: 6 });
    assert.equal(copy.ridersFree, false);
    assert.equal(copy.announce, true);
    assert.equal(copy.mountable, true);
});

test('a group with a body is copied with its own body, unlinked or linked as the original', async () => {
    const g = await wagon();
    await g.groups.setBody(g.scene, g.group.id, 'A1', { linked: true });
    const copy = await g.library.duplicateGroup(g.scene, g.group.id);
    await g.settle();
    assert.ok(copy.body);
    assert.notEqual(copy.body.tokenId, g.scene.getFlag(FLAG, 'groups')[g.group.id].body.tokenId);
    assert.equal(g.scene.tokens.get(copy.body.tokenId)._source.actorLink, true);
    assert.equal(g.scene.tokens.size, 2);
});

test('riders are not copied', async () => {
    const g = await wagon();
    const sailor = g.scene.addToken('R1', { x: 2950, y: 1950, name: 'Sailor' });
    await g.groups.mountTokens(g.scene, g.group.id, [sailor]);
    const copy = await g.library.duplicateGroup(g.scene, g.group.id);
    assert.equal(copy.riders, undefined);
    assert.equal(g.scene.tokens.size, 1);
});

test('a hidden group is copied shown, except what was hidden before it was', async () => {
    const g = await wagon();
    await g.groups.setGroupHidden(g.scene, g.group.id, true);
    const copy = await g.library.duplicateGroup(g.scene, g.group.id);
    assert.equal(copy.hidden, undefined);
    const part = (type) => g.scene.getEmbeddedCollection(type).get(copy.members.find((m) => m.type === type).id);
    assert.equal(part('Tile')._source.hidden, false);
    assert.equal(part('AmbientLight')._source.hidden, false);
    assert.equal(part('AmbientSound')._source.hidden, true);
    // and the original is still hidden
    assert.equal(g.tile._source.hidden, true);
});

test('a duplicate can be given a name, and a missing group is refused', async () => {
    const g = await wagon();
    const copy = await g.library.duplicateGroup(g.scene, g.group.id, { name: 'Second wagon' });
    assert.equal(copy.name, 'Second wagon');
    await assert.rejects(() => g.library.duplicateGroup(g.scene, 'nope'), /no group/);
});

test('a duplicate does not touch the library', async () => {
    const g = await wagon();
    await g.library.duplicateGroup(g.scene, g.group.id);
    assert.equal(g.library.listTemplates().length, 0);
});
