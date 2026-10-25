// Run with: node --test tests/*.test.mjs
// Riders: tokens a group carries. Carried when it moves or turns, free to move inside it, let go when they leave.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';

const near = (a, b, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);
const FLAG = 'coffee-pub-puppeteer';

async function barge() {
    const env = installFakes();
    const { getBlacksmith } = await import('../scripts/blacksmith.js');
    const toasts = [];
    getBlacksmith().toast.show = (options) => toasts.push(options);
    const groups = await import('../scripts/groups.js');
    const follower = await import('../scripts/follower.js');
    const prune = await import('../scripts/prune.js');
    const boarding = await import('../scripts/boarding.js');
    follower.registerFollower();
    prune.registerPruning();
    boarding.registerBoarding();

    const { scene } = env;
    // An 800 by 400 deck centred on the pin at (3000, 2000): x 2600..3400, y 1800..2200.
    const tile = scene.add('Tile', 'T1', { x: 3000, y: 2000, width: 800, height: 400, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const group = await groups.createGroup(scene, { x: 3000, y: 2000 }, { name: 'Barge' });
    await groups.addMembers(scene, group.id, [tile]);
    // A one-square token whose middle is (3100, 2000), 100 px forward of the pin, and one far from the barge.
    const sailor = scene.addToken('R1', { x: 3050, y: 1950, name: 'Sailor' });
    const swimmer = scene.addToken('R2', { x: 6000, y: 6000, name: 'Swimmer' });
    await env.settle();
    return { ...env, groups, toasts, tile, group, sailor, swimmer };
}

const record = (g) => g.scene.getFlag(FLAG, 'groups')[g.group.id];

test('boarding records where the token is in the pin\'s frame, and flags it', async () => {
    const g = await barge();
    const { mounted, skipped } = await g.groups.mountTokens(g.scene, g.group.id, [g.sailor]);
    assert.equal(mounted, 1);
    assert.deepEqual(skipped, []);
    assert.deepEqual(record(g).riders, [{ tokenId: 'R1', dx: 100, dy: 0, drot: 0 }]);
    assert.equal(g.sailor.getFlag(FLAG, 'riderOf'), g.group.id);
});

test('a token that is not on the group, is a body, or is already riding cannot board', async () => {
    const g = await barge();
    await g.groups.mountTokens(g.scene, g.group.id, [g.sailor]);
    const away = await g.groups.mountTokens(g.scene, g.group.id, [g.swimmer]);
    assert.equal(away.mounted, 0);
    assert.match(away.skipped[0], /Swimmer is not on the group/);

    const again = await g.groups.mountTokens(g.scene, g.group.id, [g.sailor]);
    assert.equal(again.mounted, 0);
    assert.deepEqual(again.skipped, []);                  // already aboard this group: nothing to say

    const other = await g.groups.createGroup(g.scene, { x: 3000, y: 2000 }, { name: 'Other' });
    const riding = await g.groups.mountTokens(g.scene, other.id, [g.sailor]);
    assert.match(riding.skipped[0], /already riding/);

    g.swimmer._source.flags[FLAG] = { groupId: 'x', body: true };
    const body = await g.groups.mountTokens(g.scene, g.group.id, [g.swimmer]);
    assert.match(body.skipped[0], /body of a group/);
});

test('moving the pin carries every rider by the same amount', async () => {
    const g = await barge();
    await g.groups.mountTokens(g.scene, g.group.id, [g.sailor]);
    await g.pins.update(g.group.anchor.id, { x: 3500, y: 2300 });
    await g.settle();
    assert.equal(g.sailor._source.x, 3550);
    assert.equal(g.sailor._source.y, 2250);
});

test('turning the group swings a rider about the pin and turns it', async () => {
    const g = await barge();
    await g.groups.mountTokens(g.scene, g.group.id, [g.sailor]);
    await g.pins.update(g.group.anchor.id, { rotation: 90 });
    await g.settle();
    // 100 px forward of the pin, turned a quarter, is 100 px below it.
    near(g.sailor._source.x + 50, 3000, 1);
    near(g.sailor._source.y + 50, 2100, 1);
    near(g.sailor._source.rotation, 90, 0.01);
});

test('a rider moved by hand inside the group stays where it was put, through the next move', async () => {
    const g = await barge();
    await g.groups.mountTokens(g.scene, g.group.id, [g.sailor]);
    await g.sailor.update({ x: 2750, y: 1900 });          // middle (2800, 1950): 200 behind the pin, 50 to one side
    await g.settle();
    assert.equal(g.sailor.getFlag(FLAG, 'riderOf'), g.group.id);
    near(record(g).riders[0].dx, -200);
    near(record(g).riders[0].dy, -50);

    await g.pins.update(g.group.anchor.id, { x: 3600, y: 2000 });
    await g.settle();
    assert.equal(g.sailor._source.x, 3350);
    assert.equal(g.sailor._source.y, 1900);
});

test('a rider moved off the group is let go where it stands', async () => {
    const g = await barge();
    await g.groups.mountTokens(g.scene, g.group.id, [g.sailor]);
    await g.sailor.update({ x: 3500, y: 1950 });          // middle (3550, 2000), past the 3400 edge
    await g.settle();
    assert.deepEqual(record(g).riders, []);
    assert.equal(g.sailor.getFlag(FLAG, 'riderOf'), undefined);
    assert.match(g.toasts.at(-1).subtitle, /Sailor left Barge/);

    await g.pins.update(g.group.anchor.id, { x: 3600, y: 2000 });
    await g.settle();
    assert.equal(g.sailor._source.x, 3500);
});

test('the follower\'s own moves of a rider are not mistaken for a hand move', async () => {
    const g = await barge();
    await g.groups.mountTokens(g.scene, g.group.id, [g.sailor]);
    const before = JSON.stringify(record(g).riders);
    await g.pins.update(g.group.anchor.id, { x: 5000, y: 4000 });
    await g.settle();
    assert.equal(JSON.stringify(record(g).riders), before);
    assert.equal(g.toasts.length, 0);
});

test('a rider can be dismounted on purpose', async () => {
    const g = await barge();
    await g.groups.mountTokens(g.scene, g.group.id, [g.sailor]);
    assert.equal(await g.groups.dismountToken(g.scene, g.group.id, 'R1'), true);
    assert.deepEqual(record(g).riders, []);
    assert.equal(g.sailor.getFlag(FLAG, 'riderOf'), undefined);
    assert.equal(await g.groups.dismountToken(g.scene, g.group.id, 'R1'), false);
});

test('a token created on a group that lets riders board boards it', async () => {
    const g = await barge();
    await g.groups.setMountable(g.scene, g.group.id, true);
    const [dropped] = await g.scene.createEmbeddedDocuments('Token', [{ x: 2850, y: 1950, name: 'Dropped' }]);
    await g.settle();
    assert.equal(dropped.getFlag(FLAG, 'riderOf'), g.group.id);
    assert.equal(record(g).riders.length, 1);
    assert.match(g.toasts.at(-1).subtitle, /Dropped is riding Barge/);
});

test('a token created on a group that does not let riders board stays an ordinary token', async () => {
    const g = await barge();
    const [dropped] = await g.scene.createEmbeddedDocuments('Token', [{ x: 2850, y: 1950, name: 'Dropped' }]);
    await g.settle();
    assert.equal(dropped.getFlag(FLAG, 'riderOf'), undefined);
    assert.equal(record(g).riders, undefined);
});

test('a token created off the group, or as a body, does not board', async () => {
    const g = await barge();
    await g.groups.setMountable(g.scene, g.group.id, true);
    const [far] = await g.scene.createEmbeddedDocuments('Token', [{ x: 9000, y: 9000, name: 'Far' }]);
    const [body] = await g.scene.createEmbeddedDocuments('Token', [{ x: 2850, y: 1950, name: 'Body', flags: { [FLAG]: { groupId: 'x', body: true } } }]);
    await g.settle();
    assert.equal(far.getFlag(FLAG, 'riderOf'), undefined);
    assert.equal(body.getFlag(FLAG, 'riderOf'), undefined);
    assert.equal(record(g).riders, undefined);
});

test('a rider whose token is deleted is no longer aboard, and the group still moves', async () => {
    const g = await barge();
    await g.groups.mountTokens(g.scene, g.group.id, [g.sailor]);
    await g.scene.deleteEmbeddedDocuments('Token', ['R1']);
    await g.settle();
    assert.deepEqual(record(g).riders, []);
    await g.pins.update(g.group.anchor.id, { x: 3500, y: 2000 });
    await g.settle();
    assert.equal(g.tile._source.x, 3500);
});

test('deleting the group lets its riders go, and leaves them where they are', async () => {
    const g = await barge();
    await g.groups.mountTokens(g.scene, g.group.id, [g.sailor]);
    await g.groups.deleteGroup(g.scene, g.group.id);
    await g.settle();
    assert.equal(g.sailor.getFlag(FLAG, 'riderOf'), undefined);
    assert.equal(g.scene.tokens.has('R1'), true);
});

test('a rider cannot be made the body of a group', async () => {
    const g = await barge();
    game.actors.set('A1', { id: 'A1', name: 'M', async getTokenDocument(data) { return { toObject: () => ({ actorId: 'A1', ...data }) }; } });
    g.sailor._source.actorId = 'A1';
    await g.groups.mountTokens(g.scene, g.group.id, [g.sailor]);
    const other = await g.groups.createGroup(g.scene, { x: 8000, y: 8000 }, { name: 'Other' });
    await assert.rejects(() => g.groups.adoptBody(g.scene, other.id, g.sailor), /already belongs/);
});

// ---- boarding by moving onto the group ------------------------------------------------------------------------

test('a token that moves onto a group that lets tokens board, boards it', async () => {
    const g = await barge();
    await g.groups.setMountable(g.scene, g.group.id, true);
    await g.swimmer.update({ x: 2950, y: 1950 });         // middle (3000, 2000), on the deck
    await g.settle();
    assert.equal(g.swimmer.getFlag(FLAG, 'riderOf'), g.group.id);
    assert.deepEqual(record(g).riders, [{ tokenId: 'R2', dx: 0, dy: 0, drot: 0 }]);
    assert.match(g.toasts.at(-1).subtitle, /Swimmer is riding Barge/);
});

test('a token that moves onto a group that does not let tokens board does not', async () => {
    const g = await barge();
    await g.swimmer.update({ x: 2950, y: 1950 });
    await g.settle();
    assert.equal(g.swimmer.getFlag(FLAG, 'riderOf'), undefined);
});

test('a token that moves about off the group, or only turns on it, does not board', async () => {
    const g = await barge();
    await g.groups.setMountable(g.scene, g.group.id, true);
    await g.swimmer.update({ x: 7000, y: 7000 });
    await g.settle();
    assert.equal(g.swimmer.getFlag(FLAG, 'riderOf'), undefined);

    g.swimmer._source.x = 2950;
    g.swimmer._source.y = 1950;                           // put on the deck without a move the hook can see
    await g.swimmer.update({ rotation: 90 });
    await g.settle();
    assert.equal(g.swimmer.getFlag(FLAG, 'riderOf'), undefined);
});

test('a body never boards, even when it moves onto the group', async () => {
    const g = await barge();
    await g.groups.setMountable(g.scene, g.group.id, true);
    const body = g.scene.addToken('B1', { x: 6000, y: 6000, name: 'Body', flags: { [FLAG]: { groupId: 'other', body: true } } });
    await body.update({ x: 2950, y: 1950 });
    await g.settle();
    assert.equal(body.getFlag(FLAG, 'riderOf'), undefined);
});

test('a token dismounted on purpose stays off while it is on the group, and boards again after leaving and returning', async () => {
    const g = await barge();
    await g.groups.setMountable(g.scene, g.group.id, true);
    await g.sailor.update({ x: 3040, y: 1950 });          // walks on
    await g.settle();
    assert.equal(g.sailor.getFlag(FLAG, 'riderOf'), g.group.id);

    await g.groups.dismountToken(g.scene, g.group.id, 'R1');
    assert.equal(g.sailor.getFlag(FLAG, 'stayed'), g.group.id);
    await g.sailor.update({ x: 3000, y: 1950 });          // wanders about the deck
    await g.settle();
    assert.equal(g.sailor.getFlag(FLAG, 'riderOf'), undefined);

    await g.sailor.update({ x: 5000, y: 1950 });          // steps off
    await g.settle();
    assert.equal(g.sailor.getFlag(FLAG, 'stayed'), undefined);
    await g.sailor.update({ x: 3000, y: 1950 });          // and back on
    await g.settle();
    assert.equal(g.sailor.getFlag(FLAG, 'riderOf'), g.group.id);
});

test('boarding on purpose ends a stay', async () => {
    const g = await barge();
    await g.groups.mountTokens(g.scene, g.group.id, [g.sailor]);
    await g.groups.dismountToken(g.scene, g.group.id, 'R1');
    assert.equal(g.sailor.getFlag(FLAG, 'stayed'), g.group.id);
    await g.groups.mountTokens(g.scene, g.group.id, [g.sailor]);
    assert.equal(g.sailor.getFlag(FLAG, 'stayed'), undefined);
    assert.equal(g.sailor.getFlag(FLAG, 'riderOf'), g.group.id);
});
