// Run with: node --test tests/*.test.mjs
// A pin group faces where its pin faces: Blacksmith turns the pin (Shift + wheel) and the group follows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';
import { rotate } from '../scripts/geometry.js';

const near = (a, b, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

async function gate() {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const follower = await import('../scripts/follower.js');
    follower.registerFollower();
    const { scene } = env;
    const tile = scene.add('Tile', 'T1', { x: 3400, y: 2000, width: 400, height: 100, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const light = scene.add('AmbientLight', 'L1', { x: 3200, y: 2000, rotation: 0 });
    const group = await groups.createGroup(scene, { x: 3000, y: 2000 }, { name: 'Gate' });
    await groups.addMembers(scene, group.id, [tile, light]);
    await env.settle();
    return { ...env, groups, tile, light, group };
}

test('the pin type is declared rotatable, or Shift + wheel would do nothing for it', async () => {
    const env = installFakes();
    let given = null;
    const { getBlacksmith } = await import('../scripts/blacksmith.js');
    getBlacksmith().pins.registerPinTaxonomy = (moduleId, data) => { given = { moduleId, data }; };
    const { registerPinType } = await import('../scripts/groups.js');
    registerPinType();
    assert.equal(given.moduleId, 'coffee-pub-puppeteer');
    assert.equal(given.data.pinCategories.group.rotatable, true);
    assert.equal(given.data.pinCategories.group.copyable, false);
    assert.ok(env);
});

test('turning the pin, as Shift + wheel does, turns the group about it', async () => {
    const { pins, group, tile, light, settle } = await gate();
    const before = { light: { x: light._source.x, y: light._source.y }, tile: { x: tile._source.x, y: tile._source.y } };

    await pins.update(group.anchor.id, { rotation: 90 });       // one write, once the wheel stops
    await settle();

    const r = rotate(before.light.x - 3000, before.light.y - 2000, 90);
    near(light._source.x, 3000 + r.x);
    near(light._source.y, 2000 + r.y);
    near(light._source.rotation, 90, 1e-6);
    near(tile._source.rotation, 90, 1e-6);
});

test('turning the group from the editor writes the pin, so both always agree', async () => {
    const { scene, pins, groups, group, light, settle } = await gate();
    await groups.rotateBy(scene, group.id, 45);
    await settle();
    assert.equal(pins.get(group.anchor.id).rotation, 45);
    near(light._source.rotation, 45, 1e-6);

    // Then the wheel turns it further, from where the editor left it.
    await pins.update(group.anchor.id, { rotation: 50 });
    await settle();
    near(light._source.rotation, 50, 1e-6);
    await groups.rotateBy(scene, group.id, 10);
    await settle();
    assert.equal(pins.get(group.anchor.id).rotation, 60);
});

test('the heading in the record mirrors the pin', async () => {
    const { scene, pins, group, settle } = await gate();
    await pins.update(group.anchor.id, { rotation: 135 });
    await settle();
    assert.equal(scene.getFlag('coffee-pub-puppeteer', 'groups')[group.id].heading, 135);
});

test('a turn of 5 degrees per wheel notch moves the group by 5 degrees each time', async () => {
    const { pins, group, light, settle } = await gate();
    for (let notch = 1; notch <= 4; notch += 1) {
        await pins.update(group.anchor.id, { rotation: 5 * notch });
        await settle();
        near(light._source.rotation, 5 * notch, 1e-6);
    }
});

test('a group made facing a heading puts that heading on its pin', async () => {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const made = await groups.createGroup(env.scene, { x: 10, y: 10 }, { name: 'Facing', heading: 270 });
    assert.equal(env.pins.get(made.anchor.id).rotation, 270);
    assert.equal(made.heading, 270);
    assert.equal(made.applied.heading, 270);
});

test('a heading Blacksmith rounds is used as it was stored, so the group is not nudged by the difference', async () => {
    const env = installFakes();
    // Blacksmith keeps two decimals.
    const create = env.pins.create;
    env.pins.create = async (data, options) => create({ ...data, rotation: Math.round(data.rotation * 100) / 100 }, options);
    const groups = await import('../scripts/groups.js');
    const made = await groups.createGroup(env.scene, { x: 10, y: 10 }, { name: 'Rounded', heading: 33.3333 });
    assert.equal(made.heading, 33.33);
    assert.equal(made.applied.heading, 33.33);
    assert.equal(env.pins.get(made.anchor.id).rotation, 33.33);
});

test('stamping onto a heading places the members for the heading the pin stored', async () => {
    const env = installFakes();
    const create = env.pins.create;
    env.pins.create = async (data, options) => create({ ...data, rotation: Math.round(data.rotation * 100) / 100 }, options);
    const groups = await import('../scripts/groups.js');
    const library = await import('../scripts/library.js');
    const follower = await import('../scripts/follower.js');
    follower.registerFollower();
    const { scene } = env;
    const lamp = scene.add('AmbientLight', 'L1', { x: 1100, y: 1000, rotation: 0 });
    const group = await groups.createGroup(scene, { x: 1000, y: 1000 }, { name: 'Lamp post' });
    await groups.addMembers(scene, group.id, [lamp]);
    const id = await library.saveGroupToLibrary(scene, group.id);

    const stamped = await library.stampTemplate(scene, id, { x: 5000, y: 3000 }, { heading: 33.3333 });
    await env.settle();
    const copy = scene.collections.AmbientLight.get(stamped.members[0].id);
    // The lamp is 100 px from the pivot; it must sit exactly where the stored 33.33 degrees puts it, and the follower
    // must find nothing left to correct.
    const r = rotate(100, 0, 33.33);
    near(copy._source.x, 5000 + r.x, 0.6);
    near(copy._source.y, 3000 + r.y, 0.6);
    const before = { x: copy._source.x, y: copy._source.y };
    await follower.syncAllGroups();
    await env.settle();
    assert.deepEqual({ x: copy._source.x, y: copy._source.y }, before);
});

test('a half-made stamp is cleaned up, not left on the map', async () => {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const library = await import('../scripts/library.js');
    const { scene } = env;
    const tile = scene.add('Tile', 'T1', { x: 1000, y: 1000, width: 100, height: 100, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const wall = scene.add('Wall', 'W1', { c: [900, 900, 1100, 900] });
    const group = await groups.createGroup(scene, { x: 1000, y: 1000 }, { name: 'Pair' });
    await groups.addMembers(scene, group.id, [tile, wall]);
    const id = await library.saveGroupToLibrary(scene, group.id);

    // Walls fail to create, after the tile has been.
    const create = scene.createEmbeddedDocuments.bind(scene);
    scene.createEmbeddedDocuments = async (type, datas, options) => {
        if (type === 'Wall') throw new Error('a wall could not be made');
        return create(type, datas, options);
    };
    await assert.rejects(library.stampTemplate(scene, id, { x: 4000, y: 4000 }), /a wall could not be made/);
    await env.settle();
    assert.equal(scene.collections.Tile.size, 1, 'the half-stamped tile is removed');
    assert.equal(groups.listGroups(scene).length, 1, 'only the original group is left');
});

// ---- groups saved before the heading moved to the pin --------------------------------------------------

test('an older pin group keeps its heading: it is handed to the pin once, and nothing moves', async () => {
    const env = installFakes();
    const follower = await import('../scripts/follower.js');
    const { scene, pins } = env;
    const light = scene.add('AmbientLight', 'L1', { x: 5000, y: 3100, rotation: 40 });   // already turned 40 degrees
    scene.flags['coffee-pub-puppeteer'] = {
        groups: {
            g1: {
                id: 'g1', name: 'Old', anchor: { type: 'pin', id: 'p1' }, version: 2, heading: 40,
                applied: { x: 5000, y: 3000, heading: 40 },
                members: [{ type: 'AmbientLight', id: 'L1', dx: 100, dy: 0, drot: 0 }]
            }
        }
    };
    await pins.create({ id: 'p1', x: 5000, y: 3000 });            // a pin that has never been turned
    await env.settle();
    const before = { x: light._source.x, y: light._source.y, rotation: light._source.rotation };

    const { migrateGroups } = await import('../scripts/migrate.js');
    assert.equal(await migrateGroups(), 1);
    await env.settle();

    follower.registerFollower();                 // only now, as in the real start-up
    await follower.syncAllGroups();
    await env.settle();

    assert.equal(pins.get('p1').rotation, 40);
    assert.equal(scene.getFlag('coffee-pub-puppeteer', 'groups').g1.version, 4);
    assert.deepEqual({ x: light._source.x, y: light._source.y, rotation: light._source.rotation }, before);
});

test('a pin that was already turned is not overwritten by an older heading', async () => {
    const env = installFakes();
    const { scene, pins } = env;
    scene.flags['coffee-pub-puppeteer'] = {
        groups: { g1: { id: 'g1', name: 'Old', anchor: { type: 'pin', id: 'p1' }, version: 2, heading: 40, applied: { x: 0, y: 0, heading: 40 }, members: [] } }
    };
    await pins.create({ id: 'p1', x: 0, y: 0, rotation: 75 });
    const { migrateGroups } = await import('../scripts/migrate.js');
    await migrateGroups();
    assert.equal(pins.get('p1').rotation, 75);
});

test('a group that already faces down needs nothing from the pin', async () => {
    const env = installFakes();
    const { scene, pins } = env;
    scene.flags['coffee-pub-puppeteer'] = {
        groups: { g1: { id: 'g1', name: 'Old', anchor: { type: 'pin', id: 'p1' }, version: 2, heading: 0, applied: { x: 0, y: 0, heading: 0 }, members: [] } }
    };
    await pins.create({ id: 'p1', x: 0, y: 0 });
    const updates = [];
    const update = pins.update;
    pins.update = async (...args) => { updates.push(args); return update(...args); };
    const { migrateGroups } = await import('../scripts/migrate.js');
    await migrateGroups();
    assert.equal(updates.length, 0);
});
