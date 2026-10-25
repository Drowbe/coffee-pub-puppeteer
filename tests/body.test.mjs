// Run with: node --test tests/*.test.mjs
// The body token: an optional token that makes a group targetable. Transparent, locked, sized to cover the group,
// moved with it, never the grip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';
import { rotate } from '../scripts/geometry.js';

const near = (a, b, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);
const TRANSPARENT = 'modules/coffee-pub-puppeteer/images/transparent.png';

async function stage() {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const follower = await import('../scripts/follower.js');
    const prune = await import('../scripts/prune.js');
    follower.registerFollower();
    prune.registerPruning();

    const { scene } = env;
    // An actor like Foundry's: it makes the token data for a token of itself.
    game.actors.set('A1', {
        id: 'A1', name: 'Merchant',
        async getTokenDocument(data) { return { toObject: () => ({ name: 'Merchant', actorId: 'A1', ...data }) }; }
    });
    // A 400 by 200 tile 400 px to the right of the pivot (3000, 2000), and a light that has a place but no size.
    const tile = scene.add('Tile', 'T1', { x: 3400, y: 2000, width: 400, height: 200, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const light = scene.add('AmbientLight', 'L1', { x: 3900, y: 2600, rotation: 0 });
    const group = await groups.createGroup(scene, { x: 3000, y: 2000 }, { name: 'Wagon' });
    await groups.addMembers(scene, group.id, [tile, light]);
    await env.settle();
    return { ...env, groups, tile, light, group };
}

const record = (g) => g.scene.getFlag('coffee-pub-puppeteer', 'groups')[g.group.id];

test('a body is a transparent, locked token of the actor, sized to cover the sized members', async () => {
    const g = await stage();
    const token = await g.groups.setBody(g.scene, g.group.id, 'A1');
    const source = token._source;
    assert.equal(source.actorId, 'A1');
    assert.equal(source.texture.src, TRANSPARENT);
    assert.equal(source.locked, true);
    assert.equal(source.actorLink, false);
    assert.equal(source.sight.enabled, false);
    assert.deepEqual(source.flags['coffee-pub-puppeteer'], { groupId: g.group.id, body: true });
    // The tile spans x 3200..3600, y 1900..2100. The light, far off to one side, says nothing about size.
    assert.equal(source.x, 3200);
    assert.equal(source.y, 1900);
    near(source.width, 4, 0.001);
    near(source.height, 2, 0.001);
    assert.deepEqual(record(g).body, { tokenId: token.id, actorId: 'A1' });
});

test('the body can be linked', async () => {
    const g = await stage();
    const token = await g.groups.setBody(g.scene, g.group.id, 'A1', { linked: true });
    assert.equal(token._source.actorLink, true);
    await g.groups.setBodyLinked(g.scene, g.group.id, false);
    assert.equal(token._source.actorLink, false);
});

test('a group has one body', async () => {
    const g = await stage();
    await g.groups.setBody(g.scene, g.group.id, 'A1');
    await assert.rejects(() => g.groups.setBody(g.scene, g.group.id, 'A1'), /already has a body/);
    await assert.rejects(() => g.groups.setBody(g.scene, 'nope', 'A1'), /no group/);
});

test('an actor that does not exist is refused, and nothing is made', async () => {
    const g = await stage();
    await assert.rejects(() => g.groups.setBody(g.scene, g.group.id, 'ghost'), /no actor/);
    assert.equal(g.scene.tokens.size, 0);
    assert.equal(record(g).body, undefined);
});

test('moving the pin moves the body, though it is locked', async () => {
    const g = await stage();
    const token = await g.groups.setBody(g.scene, g.group.id, 'A1');
    await g.pins.update(g.group.anchor.id, { x: 3500, y: 2300 });
    await g.settle();
    assert.equal(token._source.x, 3700);
    assert.equal(token._source.y, 2200);
    near(token._source.width, 4, 0.001);
});

test('a plain move of the locked body is refused', async () => {
    const g = await stage();
    const token = await g.groups.setBody(g.scene, g.group.id, 'A1');
    await token.update({ x: 0, y: 0 });
    assert.equal(token._source.x, 3200);
});

test('turning the group refits the body to the turned parts', async () => {
    const g = await stage();
    const token = await g.groups.setBody(g.scene, g.group.id, 'A1');
    await g.pins.update(g.group.anchor.id, { rotation: 90 });
    await g.settle();
    // The tile's centre swings round the pivot and the tile turns with it, so it is now 200 wide and 400 tall.
    const centre = rotate(400, 0, 90);
    near(token._source.x, 3000 + centre.x - 100, 1);
    near(token._source.y, 2000 + centre.y - 200, 1);
    near(token._source.width, 2, 0.01);
    near(token._source.height, 4, 0.01);
});

test('adding and removing a part refits the body', async () => {
    const g = await stage();
    const token = await g.groups.setBody(g.scene, g.group.id, 'A1');
    const wall = g.scene.add('Wall', 'W1', { c: [3700, 1900, 3700, 2500] });
    await g.groups.addMembers(g.scene, g.group.id, [wall]);
    near(token._source.width, 5, 0.001);                    // x 3200..3700
    near(token._source.height, 6, 0.001);                   // y 1900..2500
    await g.groups.removeMember(g.scene, g.group.id, 'Wall', 'W1');
    near(token._source.width, 4, 0.001);
    near(token._source.height, 2, 0.001);
});

test('a group with nothing sized gets a small body on the pivot', async () => {
    const g = await stage();
    await g.groups.removeMember(g.scene, g.group.id, 'Tile', 'T1');
    const token = await g.groups.setBody(g.scene, g.group.id, 'A1');
    near(token._source.width, 0.5, 0.001);
    near(token._source.x + 25, 3000, 1);
    near(token._source.y + 25, 2000, 1);
});

test('a token already on the map can be adopted as the body', async () => {
    const g = await stage();
    const token = g.scene.addToken('K1', { x: 100, y: 100, actorId: 'A1', name: 'Dropped Merchant', texture: { src: 'actors/merchant.webp' } });
    await g.groups.adoptBody(g.scene, g.group.id, token);
    assert.equal(token._source.texture.src, TRANSPARENT);
    assert.equal(token._source.locked, true);
    assert.equal(token._source.x, 3200);
    assert.deepEqual(record(g).body, { tokenId: 'K1', actorId: 'A1' });
    assert.equal(token.getFlag('coffee-pub-puppeteer', 'groupId'), g.group.id);
});

test('a token with no actor, or one that already belongs to a group, cannot be adopted', async () => {
    const g = await stage();
    const bare = g.scene.addToken('K1', { x: 0, y: 0 });
    await assert.rejects(() => g.groups.adoptBody(g.scene, g.group.id, bare), /no actor/);
    const taken = g.scene.addToken('K2', { x: 0, y: 0, actorId: 'A1', flags: { 'coffee-pub-puppeteer': { groupId: 'other' } } });
    await assert.rejects(() => g.groups.adoptBody(g.scene, g.group.id, taken), /already belongs/);
    assert.equal(record(g).body, undefined);
});

test('clearing the body deletes its token and leaves the group', async () => {
    const g = await stage();
    const token = await g.groups.setBody(g.scene, g.group.id, 'A1');
    assert.equal(await g.groups.clearBody(g.scene, g.group.id), true);
    await g.settle();
    assert.equal(g.scene.tokens.has(token.id), false);
    assert.equal(record(g).body, undefined);
    assert.equal(record(g).members.length, 2);
    assert.equal(await g.groups.clearBody(g.scene, g.group.id), false);
});

test('deleting the body token by hand leaves the group without a body', async () => {
    const g = await stage();
    const token = await g.groups.setBody(g.scene, g.group.id, 'A1');
    await g.scene.deleteEmbeddedDocuments('Token', [token.id]);
    await g.settle();
    assert.equal(record(g).body, undefined);
    assert.equal(record(g).members.length, 2);
});

test('deleting the group deletes its body', async () => {
    const g = await stage();
    const token = await g.groups.setBody(g.scene, g.group.id, 'A1');
    await g.groups.deleteGroup(g.scene, g.group.id);
    await g.settle();
    assert.equal(g.scene.tokens.has(token.id), false);
});

// ---- the library: a template that names an actor stamps with its body --------------------------------------

test('a group with a body saves the actor to the library, and no token', async () => {
    const g = await stage();
    const library = await import('../scripts/library.js');
    await g.groups.setBody(g.scene, g.group.id, 'A1', { linked: true });
    const id = await library.saveGroupToLibrary(g.scene, g.group.id);
    const template = library.getTemplate(id);
    assert.deepEqual(template.body, { actorId: 'A1', actorName: 'Merchant', linked: true });
    assert.equal(JSON.stringify(template).includes('transparent.png'), false);
    assert.equal(library.listTemplates()[0].actor, 'Merchant');
});

test('every stamp of it comes with its own body, sized to that stamp', async () => {
    const g = await stage();
    const library = await import('../scripts/library.js');
    await g.groups.setBody(g.scene, g.group.id, 'A1');
    const id = await library.saveGroupToLibrary(g.scene, g.group.id);

    const one = await library.stampTemplate(g.scene, id, { x: 6000, y: 4000 });
    const two = await library.stampTemplate(g.scene, id, { x: 8000, y: 4000 }, { heading: 90 });
    await g.settle();
    assert.ok(one.body && two.body && one.body.tokenId !== two.body.tokenId);

    const first = g.scene.tokens.get(one.body.tokenId)._source;
    assert.equal(first.locked, true);
    assert.equal(first.actorLink, false);
    assert.equal(first.texture.src, TRANSPARENT);
    assert.equal(first.x, 6200);                           // the same tile, 400 px right of its own pin
    near(first.width, 4, 0.001);
    const second = g.scene.tokens.get(two.body.tokenId)._source;
    near(second.width, 2, 0.01);                           // turned a quarter: 200 wide, 400 tall
    near(second.height, 4, 0.01);
});

test('a stamp whose actor is not in this world has no body, and says so', async () => {
    const g = await stage();
    const library = await import('../scripts/library.js');
    const { getBlacksmith } = await import('../scripts/blacksmith.js');
    const toasts = [];
    getBlacksmith().toast.show = (options) => toasts.push(options);
    await g.groups.setBody(g.scene, g.group.id, 'A1');
    const id = await library.saveGroupToLibrary(g.scene, g.group.id);
    game.actors.delete('A1');

    const stamped = await library.stampTemplate(g.scene, id, { x: 6000, y: 4000 });
    assert.equal(stamped.body, undefined);
    assert.equal(stamped.members.length, 2);
    assert.equal(toasts.length, 1);
    assert.match(toasts[0].subtitle, /Merchant is not in this world/);
});

test('a template with no actor stamps with no body, as before', async () => {
    const g = await stage();
    const library = await import('../scripts/library.js');
    const id = await library.saveGroupToLibrary(g.scene, g.group.id);
    assert.equal(library.getTemplate(id).body, undefined);
    const stamped = await library.stampTemplate(g.scene, id, { x: 6000, y: 4000 });
    assert.equal(stamped.body, undefined);
    assert.equal(g.scene.tokens.size, 0);
});

test('a template whose body names no actor is refused', async () => {
    const { validateTemplate } = await import('../scripts/template.js');
    assert.throws(() => validateTemplate({ version: 2, members: [], body: {} }), /names no actor/);
});
