// Run with: node --test tests/*.test.mjs
// A group that hangs from a token: a cart a player pilots. Run against the stand-in scene.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';
import { rotate, memberExtent, extentCentre } from '../scripts/geometry.js';

const near = (a, b, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

// The token's footprint is one square (100 px), so its pivot is 50 px in from its x, y.
const centre = (token) => ({ x: token._source.x + 50, y: token._source.y + 50 });

async function cart({ withToast = false } = {}) {
    const env = installFakes();
    const toasts = [];
    if (withToast) {
        const { getBlacksmith } = await import('../scripts/blacksmith.js');
        getBlacksmith().toast.show = (options) => toasts.push(options);
    }
    const groups = await import('../scripts/groups.js');
    const follower = await import('../scripts/follower.js');
    follower.registerFollower();

    const { scene } = env;
    const token = scene.addToken('K1', { x: 5000, y: 3000, rotation: 0, name: 'Cart' });
    const tile = scene.add('Tile', 'T1', { x: 5050, y: 3350, width: 400, height: 900, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const light = scene.add('AmbientLight', 'L1', { x: 4900, y: 3100, rotation: 0 });
    const wall = scene.add('Wall', 'W1', { c: [4800, 3000, 4800, 3800] });

    const group = await groups.createTokenGroup(scene, token);
    await groups.addMembers(scene, group.id, [tile, light, wall]);
    await env.settle();
    return { ...env, groups, follower, token, tile, light, wall, group, toasts };
}

test('a group made on a token records the token and flags it', async () => {
    const { scene, token, group } = await cart();
    assert.equal(group.anchor.type, 'token');
    assert.equal(group.anchor.id, 'K1');
    assert.equal(group.version, 2);
    assert.equal(token.getFlag('coffee-pub-puppeteer', 'groupId'), group.id);
    assert.deepEqual(scene.getFlag('coffee-pub-puppeteer', 'groups')[group.id].applied, { x: 5050, y: 3050, heading: 0 });
});

test('moving the token moves every member by the same amount', async () => {
    const { token, tile, light, wall, settle } = await cart();
    const before = { tile: { ...tile._source }, light: { ...light._source }, wall: [...wall._source.c] };
    await token.update({ x: 5600, y: 2700 });
    await settle();
    near(tile._source.x - before.tile.x, 600);
    near(tile._source.y - before.tile.y, -300);
    near(light._source.x - before.light.x, 600);
    near(light._source.y - before.light.y, -300);
    near(wall._source.c[3] - before.wall[3], -300);
});

test('turning the token turns the whole group rigidly about the token centre', async () => {
    const { token, tile, light, wall, settle } = await cart();
    const pivot = centre(token);
    const before = { light: { ...light._source }, tile: { ...tile._source }, wall: [...wall._source.c] };
    await token.update({ rotation: 90 });
    await settle();

    const turned = (p) => { const r = rotate(p.x - pivot.x, p.y - pivot.y, 90); return { x: pivot.x + r.x, y: pivot.y + r.y }; };
    const l = turned(before.light);
    near(light._source.x, l.x);
    near(light._source.y, l.y);
    near(light._source.rotation, 90, 1e-6);
    const t = turned(before.tile);
    near(tile._source.x, t.x);
    near(tile._source.y, t.y);
    near(tile._source.rotation, 90, 1e-6);
    const w = turned({ x: before.wall[2], y: before.wall[3] });
    near(wall._source.c[2], w.x);
    near(wall._source.c[3], w.y);
});

test('a move and a rotation that arrive as separate updates end up consistent', async () => {
    const { token, tile, settle } = await cart();
    // As Foundry delivered one drag: position and rotation together, then a rotation-only correction.
    await token.update({ x: 6000, y: 3500, rotation: 80 });
    await token.update({ rotation: 27 });
    await settle();
    const pivot = centre(token);
    near(pivot.x, 6050);
    near(pivot.y, 3550);
    near(tile._source.rotation, 27, 1e-6);
    // The tile sits where a rigid copy of its original offset (0, 300) from the pivot would, turned 27 degrees.
    const r = rotate(0, 300, 27);
    near(tile._source.x, pivot.x + r.x);
    near(tile._source.y, pivot.y + r.y);
});

test('turning and turning back puts everything exactly where it began', async () => {
    const { token, tile, light, wall, settle } = await cart();
    const before = JSON.stringify([tile._source, light._source, wall._source]);
    await token.update({ rotation: 135 });
    await settle();
    await token.update({ rotation: 0 });
    await settle();
    assert.equal(JSON.stringify([tile._source, light._source, wall._source]), before);
});

test('rotating the group from the editor turns the token', async () => {
    const { scene, token, groups, group, tile, settle } = await cart();
    await groups.rotateBy(scene, group.id, 90);
    await settle();
    near(token._source.rotation, 90, 1e-6);
    near(tile._source.rotation, 90, 1e-6);
    await groups.setHeading(scene, group.id, 0);
    await settle();
    near(token._source.rotation, 0, 1e-6);
});

test('a copied token does not drive the original group', async () => {
    const { scene, tile, settle } = await cart();
    // A duplicate carries the flag but is a different token, so the group does not name it.
    const copy = scene.addToken('K2', { x: 1000, y: 1000, flags: structuredClone(scene.tokens.get('K1')._source.flags) });
    const before = { ...tile._source };
    await copy.update({ x: 1500, y: 1500 });
    await settle();
    assert.deepEqual({ ...tile._source }, before);
});

test('a member the GM moves by hand is re-recorded against the token', async () => {
    const { scene, token, light, settle } = await cart();
    await scene.updateEmbeddedDocuments('AmbientLight', [{ _id: 'L1', x: 4850, y: 3150 }], {});
    await settle();
    await token.update({ x: 5400, y: 3000, rotation: 90 });
    await settle();
    const pivot = centre(token);
    const r = rotate(4850 - 5050, 3150 - 3050, 90);
    near(light._source.x, pivot.x + r.x);
    near(light._source.y, pivot.y + r.y);
});

test('with no GM connected the mover is told once, and nothing moves', async () => {
    const { token, tile, settle, toasts } = await cart({ withToast: true });
    globalThis.game.users.activeGM = null;
    const before = { ...tile._source };
    await token.update({ x: 5300, y: 3000 });
    await token.update({ x: 5600, y: 3000 });
    await settle();
    assert.deepEqual({ ...tile._source }, before);
    assert.equal(toasts.length, 1, 'one warning, not one per step of the drag');
    assert.match(toasts[0].title, /No GM/);
});

test('when a GM comes online the group catches up with where the token is', async () => {
    const { token, tile, settle, follower } = await cart({ withToast: true });
    globalThis.game.users.activeGM = null;
    await token.update({ x: 6000, y: 3000 });
    await settle();
    const stranded = tile._source.x;

    globalThis.game.users.activeGM = { isSelf: true };
    await follower.syncAllGroups();
    await settle();
    near(tile._source.x - stranded, 1000);
});

test('deleting a token group frees the token and leaves its parts where they are', async () => {
    const { scene, token, tile, groups, group, settle } = await cart();
    const before = { ...tile._source };
    await groups.deleteGroup(scene, group.id);
    await settle();
    assert.equal(scene.getFlag('coffee-pub-puppeteer', 'groups')[group.id], undefined);
    assert.equal(token.getFlag('coffee-pub-puppeteer', 'groupId'), undefined);
    assert.ok(scene.tokens.has('K1'));
    await token.update({ x: 7000 });
    await settle();
    assert.deepEqual({ ...tile._source }, before);
});

test('a group on a token has no pivot to move, and says so', async () => {
    const { scene, groups, group } = await cart();
    await assert.rejects(groups.recenterPivot(scene, group.id), /pivots on that token/);
});

test('a token cannot anchor two groups', async () => {
    const { scene, token, groups } = await cart();
    await assert.rejects(groups.createTokenGroup(scene, token), /already anchors a group/);
});

test('the diagnosis of a token group reports the token as the anchor', async () => {
    const { scene, groups, group } = await cart();
    const report = groups.diagnoseGroup(scene, group.id);
    assert.equal(report.anchorType, 'token');
    assert.deepEqual(report.anchor, { x: 5050, y: 3050, heading: 0 });
    assert.equal(report.anchorMatchesApplied, true);
    assert.ok(report.members.every((m) => m.state === 'in place'));
});

test('the bounds of a token group are drawn around its members, turned with the token', async () => {
    const { token, tile, light, wall, settle } = await cart();
    await token.update({ rotation: 90 });
    await settle();
    const points = [
        ...memberExtent('Tile', tile._source), ...memberExtent('AmbientLight', light._source), ...memberExtent('Wall', wall._source)
    ];
    const c = extentCentre(points);
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y));
});
