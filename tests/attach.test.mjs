// Run with: node --test tests/*.test.mjs
// Moving an existing group between a pin and a token without moving anything in the scene.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';
import { rotate } from '../scripts/geometry.js';

const near = (a, b, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

// A pin group with a tile, a light and a wall, and a token standing on the cart.
async function pinCart() {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const follower = await import('../scripts/follower.js');
    follower.registerFollower();
    const { scene } = env;

    const tile = scene.add('Tile', 'T1', { x: 5050, y: 3350, width: 400, height: 900, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const light = scene.add('AmbientLight', 'L1', { x: 4900, y: 3100, rotation: 0 });
    const wall = scene.add('Wall', 'W1', { c: [4800, 3000, 4800, 3800] });
    const group = await groups.createGroup(scene, { x: 6000, y: 2000 }, { name: 'Wagon' });   // the pin is nowhere near the cart
    await groups.addMembers(scene, group.id, [tile, light, wall]);
    await groups.renameMember(scene, group.id, 'AmbientLight', 'L1', 'Front lamp');
    // A token standing on the cart, turned a little.
    const token = scene.addToken('K1', { x: 5000, y: 3000, rotation: 30, name: 'Cart' });
    await env.settle();
    return { ...env, groups, follower, tile, light, wall, group, token };
}

const snapshot = (...docs) => JSON.stringify(docs.map((d) => d._source));

test('attaching a group to a token moves nothing and drops its pin', async () => {
    const { scene, pins, groups, group, token, tile, light, wall, settle } = await pinCart();
    const before = snapshot(tile, light, wall);
    const pinId = group.anchor.id;

    const attached = await groups.attachToToken(scene, group.id, token);
    await settle();

    assert.equal(snapshot(tile, light, wall), before, 'no member may move');
    assert.equal(attached.anchor.type, 'token');
    assert.equal(attached.anchor.id, 'K1');
    assert.equal(token.getFlag('coffee-pub-puppeteer', 'groupId'), group.id);
    assert.equal(pins.exists(pinId), false, 'the old pin is removed');
    assert.equal(attached.members.find((m) => m.type === 'AmbientLight').label, 'Front lamp', 'names are kept');
});

test('after attaching, the group follows the token and turns about its centre', async () => {
    const { scene, groups, group, token, tile, light, settle } = await pinCart();
    await groups.attachToToken(scene, group.id, token);
    await settle();

    const pivotBefore = { x: 5050, y: 3050 };
    const lightBefore = { x: light._source.x, y: light._source.y };
    await token.update({ x: 5600, y: 3000, rotation: 120 });
    await settle();

    const pivot = { x: 5650, y: 3050 };
    // Turned by the change in heading (30 to 120 = 90) about the token, and carried with it.
    const r = rotate(lightBefore.x - pivotBefore.x, lightBefore.y - pivotBefore.y, 90);
    near(light._source.x, pivot.x + r.x);
    near(light._source.y, pivot.y + r.y);
    near(light._source.rotation, 90, 1e-6);
    near(tile._source.rotation, 90, 1e-6);
});

test('a group already on a token, or a token already in use, is refused', async () => {
    const { scene, groups, group, token, settle } = await pinCart();
    await groups.attachToToken(scene, group.id, token);
    await settle();
    await assert.rejects(groups.attachToToken(scene, group.id, token), /already follows a token/);

    const second = await groups.createGroup(scene, { x: 100, y: 100 }, { name: 'Other' });
    await assert.rejects(groups.attachToToken(scene, second.id, token), /already anchors a group/);
});

test('moving a group back to a pin puts the pin at the token and moves nothing', async () => {
    const { scene, pins, groups, group, token, tile, light, wall, settle } = await pinCart();
    await groups.attachToToken(scene, group.id, token);
    await settle();
    const before = snapshot(tile, light, wall);

    const back = await groups.detachToPin(scene, group.id);
    await settle();

    assert.equal(snapshot(tile, light, wall), before, 'no member may move');
    assert.equal(back.anchor.type, 'pin');
    const pin = pins.get(back.anchor.id);
    near(pin.x, 5050);
    near(pin.y, 3050);
    assert.equal(back.heading, 30);
    assert.equal(token.getFlag('coffee-pub-puppeteer', 'groupId'), undefined);
    assert.ok(scene.tokens.has('K1'), 'the token stays');
});

test('after moving back to a pin, the pin drives the group and the token no longer does', async () => {
    const { scene, pins, groups, group, token, light, settle } = await pinCart();
    await groups.attachToToken(scene, group.id, token);
    await settle();
    const back = await groups.detachToPin(scene, group.id);
    await settle();

    const start = { x: light._source.x, y: light._source.y };
    await token.update({ x: 9000, y: 4000 });
    await settle();
    assert.deepEqual({ x: light._source.x, y: light._source.y }, start, 'the token is no longer the anchor');

    await pins.update(back.anchor.id, { x: 5050 + 200, y: 3050 - 100 });
    await settle();
    near(light._source.x - start.x, 200);
    near(light._source.y - start.y, -100);
});

test('only a group on a token can be moved back to a pin', async () => {
    const { scene, groups, group } = await pinCart();
    await assert.rejects(groups.detachToPin(scene, group.id), /not on a token/);
});

test('a token and its group face the same way: attach facing north, turn to face south, both turn', async () => {
    // Foundry's rotation 0 faces down the screen (south); 180 faces up (north).
    const { scene, groups, group, token, tile, light, settle } = await pinCart();
    await token.update({ rotation: 180 });                       // the token faces north
    await groups.setHeading(scene, group.id, 180);               // and the group is set to face north too
    await settle();
    const northTile = tile._source.rotation;
    const lightOffset = { x: light._source.x - 6000, y: light._source.y - 2000 };   // measured from the old pin

    await groups.attachToToken(scene, group.id, token);
    await settle();
    const pivot = { x: token._source.x + 50, y: token._source.y + 50 };
    const beforeLight = { x: light._source.x, y: light._source.y };

    // Turn the token to face south: every member turns the same half turn about the token, and the group
    // reports the token's heading.
    await token.update({ rotation: 0 });
    await settle();
    const r = rotate(beforeLight.x - pivot.x, beforeLight.y - pivot.y, 180);
    near(light._source.x, pivot.x + r.x);
    near(light._source.y, pivot.y + r.y);
    near(((tile._source.rotation - northTile) % 360 + 360) % 360, 180, 1e-6);   // a half turn
    assert.equal(scene.getFlag('coffee-pub-puppeteer', 'groups')[group.id].heading, 0);

    // And the other way: turning the group from the editor turns the token.
    await groups.rotateBy(scene, group.id, 180);
    await settle();
    near(token._source.rotation, 180, 1e-6);
    assert.ok(Number.isFinite(lightOffset.x));
});
