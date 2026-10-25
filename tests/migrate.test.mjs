// Run with: node --test tests/*.test.mjs
// A group saved before the v14 tile fix is repaired from where its tile actually is.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';

const near = (a, b, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

async function oldGroup() {
    const env = installFakes();
    const { registerFollower } = await import('../scripts/follower.js');
    registerFollower();
    const { scene } = env;

    // A centred 1800 x 800 tile at (5000, 3000), as v14 draws it, with a light beside it.
    scene.add('Tile', 'T1', { x: 5000, y: 3000, width: 1800, height: 800, rotation: 90, texture: { anchorX: 0.5, anchorY: 0.5 } });
    scene.add('AmbientLight', 'L1', { x: 4800, y: 2600, rotation: 0 });

    // The pin sits at (5530, 3500). The record is the old kind: no version, and the tile's offset was measured
    // for (x + width / 2, y + height / 2) = (5900, 3400), which is not where the tile is.
    scene.flags['coffee-pub-puppeteer'] = {
        groups: {
            g1: {
                id: 'g1', name: 'Wagon', anchor: { type: 'pin', id: 'p1' }, heading: 0,
                applied: { x: 5530, y: 3500, heading: 0 },
                members: [
                    { type: 'Tile', id: 'T1', dx: 5900 - 5530, dy: 3400 - 3500, drot: 90 },
                    { type: 'AmbientLight', id: 'L1', dx: 4800 - 5530, dy: 2600 - 3500, drot: 0 }
                ]
            }
        }
    };
    await env.pins.create({ id: 'p1', x: 5530, y: 3500 });
    await env.settle();
    return env;
}

test('an older group has its tile re-recorded from where the tile is, and is marked current', async () => {
    const { scene, settle } = await oldGroup();
    const { migrateGroups } = await import('../scripts/migrate.js');
    assert.equal(await migrateGroups(), 1);
    await settle();

    const group = scene.getFlag('coffee-pub-puppeteer', 'groups').g1;
    assert.equal(group.version, 4);
    const tile = group.members.find((m) => m.type === 'Tile');
    near(tile.dx, 5000 - 5530);
    near(tile.dy, 3000 - 3500);
    // The light was never affected and is left alone.
    assert.deepEqual(group.members.find((m) => m.type === 'AmbientLight'), { type: 'AmbientLight', id: 'L1', dx: -730, dy: -900, drot: 0 });
});

test('after the repair the tile follows the pin without jumping', async () => {
    const { scene, pins, settle } = await oldGroup();
    const { migrateGroups } = await import('../scripts/migrate.js');
    await migrateGroups();
    await settle();

    await pins.update('p1', { x: 6030, y: 3700 });
    await settle();
    const tile = scene.collections.Tile.get('T1')._source;
    near(tile.x, 5000 + 500);
    near(tile.y, 3000 + 200);
});

test('a group that is already current is left alone, and so is running it twice', async () => {
    const { scene, settle } = await oldGroup();
    const { migrateGroups } = await import('../scripts/migrate.js');
    await migrateGroups();
    await settle();
    const after = JSON.stringify(scene.getFlag('coffee-pub-puppeteer', 'groups'));
    assert.equal(await migrateGroups(), 0);
    assert.equal(JSON.stringify(scene.getFlag('coffee-pub-puppeteer', 'groups')), after);
});

test('only the active GM migrates', async () => {
    const { scene } = await oldGroup();
    globalThis.game.users.activeGM = { isSelf: false };
    const { migrateGroups } = await import('../scripts/migrate.js');
    assert.equal(await migrateGroups(), 0);
    assert.equal(scene.getFlag('coffee-pub-puppeteer', 'groups').g1.version, undefined);
});

// ---- version 4: the grip is always a pin ------------------------------------------------------------------

async function tokenGroup({ withToken = true } = {}) {
    const env = installFakes();
    const toasts = [];
    const { getBlacksmith } = await import('../scripts/blacksmith.js');
    getBlacksmith().toast.show = (options) => toasts.push(options);
    const { registerFollower } = await import('../scripts/follower.js');
    registerFollower();
    const { scene } = env;

    // A cart token whose centre is (5050, 3050), turned 90 degrees, with a tile and a light a way off.
    const token = withToken ? scene.addToken('K1', { x: 5000, y: 3000, rotation: 90, name: 'Cart', flags: { 'coffee-pub-puppeteer': { groupId: 'g1' } } }) : null;
    scene.add('Tile', 'T1', { x: 5050, y: 3450, width: 200, height: 100, rotation: 90, texture: { anchorX: 0.5, anchorY: 0.5 } });
    scene.add('AmbientLight', 'L1', { x: 4850, y: 3050, rotation: 0 });
    scene.flags['coffee-pub-puppeteer'] = {
        groups: {
            g1: {
                id: 'g1', name: 'Cart', anchor: { type: 'token', id: 'K1' }, version: 3, heading: 90,
                applied: { x: 5050, y: 3050, heading: 90 },
                members: [
                    { type: 'Tile', id: 'T1', dx: 400, dy: 0, drot: 0 },
                    { type: 'AmbientLight', id: 'L1', dx: 0, dy: 200, drot: 0 }
                ]
            }
        }
    };
    return { ...env, token, toasts };
}

test('a group that followed a token now hangs from a pin where the token was, and nothing moves', async () => {
    const { scene, pins, token, settle, toasts } = await tokenGroup();
    const tile = { ...scene.collections.Tile.get('T1')._source };
    const light = { ...scene.collections.AmbientLight.get('L1')._source };
    const { migrateGroups } = await import('../scripts/migrate.js');
    assert.equal(await migrateGroups(), 1);
    await settle();

    const group = scene.getFlag('coffee-pub-puppeteer', 'groups').g1;
    assert.equal(group.version, 4);
    assert.equal(group.anchor.type, 'pin');
    const pin = pins.get(group.anchor.id);
    near(pin.x, 5050);
    near(pin.y, 3050);
    near(pin.rotation, 90);
    // Every member is exactly where it was.
    assert.deepEqual(scene.collections.Tile.get('T1')._source.x, tile.x);
    assert.deepEqual(scene.collections.Tile.get('T1')._source.y, tile.y);
    assert.deepEqual(scene.collections.AmbientLight.get('L1')._source.x, light.x);
    // The token is an ordinary token again, unchanged but for no longer carrying the group's flag.
    assert.equal(token.getFlag('coffee-pub-puppeteer', 'groupId'), undefined);
    assert.equal(token._source.x, 5000);
    assert.equal(token._source.texture, undefined);
    assert.equal(toasts.length, 1);
    assert.match(toasts[0].subtitle, /Cart used to follow a token/);
});

test('the converted group follows its pin, and the old token no longer drives it', async () => {
    const { scene, pins, token, settle } = await tokenGroup();
    const { migrateGroups } = await import('../scripts/migrate.js');
    await migrateGroups();
    await settle();
    const group = scene.getFlag('coffee-pub-puppeteer', 'groups').g1;
    const before = scene.collections.Tile.get('T1')._source.x;

    await token.update({ x: 7000, y: 5000 });
    await settle();
    assert.equal(scene.collections.Tile.get('T1')._source.x, before);

    await pins.update(group.anchor.id, { x: 5650, y: 3050 });
    await settle();
    near(scene.collections.Tile.get('T1')._source.x - before, 600);
});

test('a group whose token is gone is converted too, to a pin where the group last was', async () => {
    const { scene, pins, settle } = await tokenGroup({ withToken: false });
    const { migrateGroups } = await import('../scripts/migrate.js');
    assert.equal(await migrateGroups(), 1);
    await settle();
    const group = scene.getFlag('coffee-pub-puppeteer', 'groups').g1;
    assert.equal(group.anchor.type, 'pin');
    const pin = pins.get(group.anchor.id);
    near(pin.x, 5050);
    near(pin.y, 3050);
});

test('with no token groups, nothing is announced', async () => {
    const { scene, toasts } = await tokenGroup();
    scene.flags['coffee-pub-puppeteer'].groups.g1.version = 4;
    scene.flags['coffee-pub-puppeteer'].groups.g1.anchor = { type: 'pin', id: 'p1' };
    const { migrateGroups } = await import('../scripts/migrate.js');
    assert.equal(await migrateGroups(), 0);
    assert.equal(toasts.length, 0);
});
