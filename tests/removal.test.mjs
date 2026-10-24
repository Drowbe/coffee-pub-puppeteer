// Run with: node --test tests/*.test.mjs
// Deleting a group, and what happens to a group when its token is deleted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';

const ACTIONS = { SUBMIT: 'submit', CANCEL: 'cancel', CLOSE: 'close' };

async function cart(answer) {
    const env = installFakes();
    const { getBlacksmith } = await import('../scripts/blacksmith.js');
    const blacksmith = getBlacksmith();
    const asked = [];
    const toasts = [];
    blacksmith.toast.show = (options) => toasts.push(options);
    blacksmith.dialog = {
        ACTIONS,
        wait: async (options) => { asked.push(options); return typeof answer === 'function' ? answer(options) : answer; }
    };

    const groups = await import('../scripts/groups.js');
    const follower = await import('../scripts/follower.js');
    const { registerTokenRemoval } = await import('../scripts/token-removed.js');
    const { registerPruning } = await import('../scripts/prune.js');
    follower.registerFollower();
    registerTokenRemoval();
    registerPruning();

    const { scene } = env;
    const token = scene.addToken('K1', { x: 5000, y: 3000, rotation: 0, name: 'Cart' });
    const tile = scene.add('Tile', 'T1', { x: 5050, y: 3350, width: 400, height: 900, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const light = scene.add('AmbientLight', 'L1', { x: 4900, y: 3100, rotation: 0 });
    const wall = scene.add('Wall', 'W1', { c: [4800, 3000, 4800, 3800] });
    const region = scene.add('Region', 'R1', { name: 'Zone', shapes: [{ type: 'circle', x: 5000, y: 3100, radius: 100 }] });
    const group = await groups.createTokenGroup(scene, token);
    await groups.addMembers(scene, group.id, [tile, light, wall, region]);
    await env.settle();
    return { ...env, groups, token, tile, light, wall, region, group, asked, toasts };
}

const deleteToken = async (env) => {
    env.scene.tokens.delete('K1');
    env.fire('deleteToken', env.token, {}, 'u1');
    await env.settle();
};

// ---- deleting a group from the editor ---------------------------------------------------------------------

test('deleting a group leaves its parts on the scene by default', async () => {
    const env = await cart();
    const result = await env.groups.deleteGroup(env.scene, env.group.id);
    await env.settle();
    assert.deepEqual(result, { removed: 0 });
    assert.equal(env.groups.listGroups(env.scene).length, 0);
    assert.equal(env.scene.collections.Tile.size + env.scene.collections.AmbientLight.size + env.scene.collections.Wall.size + env.scene.collections.Region.size, 4);
});

test('deleting a group and its parts removes every part from the scene and counts them', async () => {
    const env = await cart();
    const result = await env.groups.deleteGroup(env.scene, env.group.id, { removeMembers: true });
    await env.settle();
    assert.deepEqual(result, { removed: 4 });
    assert.equal(env.scene.collections.Tile.size, 0);
    assert.equal(env.scene.collections.AmbientLight.size, 0);
    assert.equal(env.scene.collections.Wall.size, 0);
    assert.equal(env.scene.collections.Region.size, 0);
    assert.equal(env.groups.listGroups(env.scene).length, 0);
    assert.ok(env.scene.tokens.has('K1'), 'the token itself is not a part');
    assert.equal(env.token.getFlag('coffee-pub-puppeteer', 'groupId'), undefined);
});

test('a part that is already gone is not counted or an error', async () => {
    const env = await cart();
    env.scene.collections.Wall.delete('W1');
    const result = await env.groups.deleteGroup(env.scene, env.group.id, { removeMembers: true });
    assert.equal(result.removed, 3);
});

test('other groups are untouched when one is deleted with its parts', async () => {
    const env = await cart();
    const other = env.scene.add('Tile', 'T2', { x: 100, y: 100, width: 10, height: 10, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const second = await env.groups.createGroup(env.scene, { x: 100, y: 100 }, { name: 'Other' });
    await env.groups.addMembers(env.scene, second.id, [other]);
    await env.groups.deleteGroup(env.scene, env.group.id, { removeMembers: true });
    await env.settle();
    assert.ok(env.scene.collections.Tile.has('T2'));
    assert.equal(env.groups.listGroups(env.scene).length, 1);
});

// ---- deleting the token ---------------------------------------------------------------------------------

test('deleting a token asks what to do, and names the group and how many parts it holds', async () => {
    const env = await cart({ action: ACTIONS.CLOSE, value: null });
    await deleteToken(env);
    assert.equal(env.asked.length, 1);
    assert.match(env.asked[0].content, /Cart/);
    assert.match(env.asked[0].content, /Cart<\/strong>, which the group/);
    assert.match(env.asked[0].content, /4 parts/);
    assert.deepEqual(env.asked[0].buttons.map((b) => b.action), ['pin', 'record', 'parts']);
    assert.equal(env.asked[0].buttons.find((b) => b.action === 'parts').destructive, true);
});

test('closing the question leaves the group as it was', async () => {
    const env = await cart({ action: ACTIONS.CLOSE, value: null });
    await deleteToken(env);
    assert.equal(env.groups.listGroups(env.scene).length, 1);
    assert.equal(env.scene.collections.Tile.size, 1);
});

test('"keep the parts, on a pin" turns the group into a pin group where the token was', async () => {
    const env = await cart({ action: ACTIONS.SUBMIT, value: 'pin' });
    const before = JSON.stringify([...env.scene.collections.Tile.values()].map((d) => d._source));
    await deleteToken(env);
    const [group] = env.groups.listGroups(env.scene);
    assert.equal(group.anchor.type, 'pin');
    const pin = env.pins.get(group.anchor.id);
    assert.deepEqual({ x: pin.x, y: pin.y }, { x: 5050, y: 3050 });
    assert.equal(JSON.stringify([...env.scene.collections.Tile.values()].map((d) => d._source)), before, 'nothing moved');
    assert.equal(env.scene.collections.Wall.size, 1);
    // And it is a working pin group.
    const lightBefore = env.light._source.x;
    await env.pins.update(group.anchor.id, { x: 5250, y: 3050 });
    await env.settle();
    assert.equal(env.light._source.x - lightBefore, 200);
});

test('"delete only the group" removes the group and leaves every part', async () => {
    const env = await cart({ action: ACTIONS.SUBMIT, value: 'record' });
    await deleteToken(env);
    assert.equal(env.groups.listGroups(env.scene).length, 0);
    assert.equal(env.scene.collections.Tile.size + env.scene.collections.AmbientLight.size + env.scene.collections.Wall.size + env.scene.collections.Region.size, 4);
});

test('"delete the group and its parts" clears the cart from the map', async () => {
    const env = await cart({ action: ACTIONS.SUBMIT, value: 'parts' });
    await deleteToken(env);
    assert.equal(env.groups.listGroups(env.scene).length, 0);
    assert.equal(env.scene.collections.Tile.size + env.scene.collections.AmbientLight.size + env.scene.collections.Wall.size + env.scene.collections.Region.size, 0);
    assert.match(env.toasts.at(-1).subtitle, /4 parts removed/);
});

test('only the GM who deleted the token is asked, once', async () => {
    const env = await cart({ action: ACTIONS.CLOSE, value: null });
    env.scene.tokens.delete('K1');
    env.fire('deleteToken', env.token, {}, 'someone-else');         // another client's deletion
    await env.settle();
    assert.equal(env.asked.length, 0);

    globalThis.game.user.isGM = false;                               // a player who somehow deleted it
    env.fire('deleteToken', env.token, {}, 'u1');
    await env.settle();
    assert.equal(env.asked.length, 0);
});

test('a token that only carries a copied flag asks nothing', async () => {
    const env = await cart({ action: ACTIONS.CLOSE, value: null });
    const copy = env.scene.addToken('K2', { x: 1, y: 1, flags: structuredClone(env.token._source.flags) });
    env.scene.tokens.delete('K2');
    env.fire('deleteToken', copy, {}, 'u1');
    await env.settle();
    assert.equal(env.asked.length, 0);
});
