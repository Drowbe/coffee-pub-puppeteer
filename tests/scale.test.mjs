// Run with: node --test tests/*.test.mjs
// Resizing a group about its pin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';

const near = (a, b, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);
const live = (g) => g.scene.getFlag('coffee-pub-puppeteer', 'groups')[g.group.id];

async function stage() {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const follower = await import('../scripts/follower.js');
    follower.registerFollower();
    const { scene } = env;
    game.actors.set('A1', { id: 'A1', name: 'Wagon', async getTokenDocument(data) { return { toObject: () => ({ name: 'Wagon', actorId: 'A1', ...data }) }; } });
    // Around a pin at 3000, 2000, facing down.
    const tile = scene.add('Tile', 'T1', { x: 3100, y: 2000, width: 200, height: 100, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const drawing = scene.add('Drawing', 'D1', { x: 2800, y: 1900, rotation: 0, shape: { type: 'r', width: 100, height: 60 }, strokeWidth: 4 });
    const lamp = scene.add('AmbientLight', 'L1', { x: 3200, y: 2100, rotation: 0, config: { dim: 40, bright: 20 } });
    const hum = scene.add('AmbientSound', 'S1', { x: 2900, y: 2100, radius: 30 });
    const wall = scene.add('Wall', 'W1', { c: [2800, 1800, 2800, 2200] });
    const note = scene.add('Note', 'N1', { x: 3000, y: 1900 });
    const region = scene.add('Region', 'R1', { shapes: [
        { type: 'rectangle', x: 3000, y: 2200, width: 200, height: 100, rotation: 0, anchorX: 0, anchorY: 0 },
        { type: 'circle', x: 3300, y: 2000, radius: 50 },
        { type: 'polygon', points: [3000, 2300, 3100, 2300, 3100, 2400] }
    ] });
    const group = await groups.createGroup(scene, { x: 3000, y: 2000 }, { name: 'Camp' });
    await groups.addMembers(scene, group.id, [tile, drawing, lamp, hum, wall, note, region]);
    await env.settle();
    return { ...env, groups, group, tile, drawing, lamp, hum, wall, note, region };
}

test('doubling a group puts every part twice as far from the pin and makes it twice as big', async () => {
    const g = await stage();
    assert.deepEqual(await g.groups.scaleGroup(g.scene, g.group.id, 2), { scaled: 7 });
    // tile: centre 100 right of the pin becomes 200
    assert.equal(g.tile._source.x, 3200);
    assert.equal(g.tile._source.y, 2000);
    assert.deepEqual([g.tile._source.width, g.tile._source.height], [400, 200]);
    // drawing: centre was (2850, 1930), 150 left and 70 above the pin; now 300 left and 140 above, 200 by 120
    assert.deepEqual([g.drawing._source.shape.width, g.drawing._source.shape.height], [200, 120]);
    near(g.drawing._source.x + 100, 2700);
    near(g.drawing._source.y + 60, 1860);
    assert.equal(g.drawing._source.strokeWidth, 8);
    // light and sound: further away, reaching further
    assert.deepEqual([g.lamp._source.x, g.lamp._source.y], [3400, 2200]);
    assert.deepEqual([g.lamp._source.config.dim, g.lamp._source.config.bright], [80, 40]);
    assert.deepEqual([g.hum._source.x, g.hum._source.y, g.hum._source.radius], [2800, 2200, 60]);
    // wall: both ends twice as far
    assert.deepEqual(g.wall._source.c, [2600, 1600, 2600, 2400]);
    // note keeps its size and moves to twice the distance
    assert.deepEqual([g.note._source.x, g.note._source.y], [3000, 1800]);
    // region: each shape further and bigger
    const [rect, circle, polygon] = g.region._source.shapes;
    assert.deepEqual([rect.x, rect.y, rect.width, rect.height], [3000, 2400, 400, 200]);
    assert.deepEqual([circle.x, circle.y, circle.radius], [3600, 2000, 100]);
    assert.deepEqual(polygon.points, [3000, 2600, 3200, 2600, 3200, 2800]);
});

test('doubling and then halving puts everything back', async () => {
    const g = await stage();
    const before = JSON.stringify([g.tile, g.drawing, g.lamp, g.hum, g.wall, g.note, g.region].map((d) => d._source));
    await g.groups.scaleGroup(g.scene, g.group.id, 2);
    await g.groups.scaleGroup(g.scene, g.group.id, 0.5);
    assert.equal(JSON.stringify([g.tile, g.drawing, g.lamp, g.hum, g.wall, g.note, g.region].map((d) => d._source)), before);
});

test('a resized group still moves with its pin, and turns about it', async () => {
    const g = await stage();
    await g.groups.scaleGroup(g.scene, g.group.id, 2);
    await g.pins.update(g.group.anchor.id, { x: 3500, rotation: 90 });
    await g.settle();
    // The tile was 200 right of the pin; a quarter turn puts it 200 above... Foundry turns clockwise on screen: right becomes down.
    near(g.tile._source.x, 3500);
    near(g.tile._source.y, 2200);
    assert.equal(g.tile._source.rotation, 90);
});

test('riders keep their size and stand twice as far from the pin; the token is refitted', async () => {
    const g = await stage();
    await g.groups.setBody(g.scene, g.group.id, 'A1');
    const sailor = g.scene.addToken('R1', { x: 3150, y: 2050, name: 'Sailor' });         // middle at 3200, 2100
    await g.groups.mountTokens(g.scene, g.group.id, [sailor]);
    const { width: wasWidth, height: wasHeight } = g.scene.tokens.get(live(g).body.tokenId)._source;
    await g.groups.scaleGroup(g.scene, g.group.id, 2);
    await g.settle();
    assert.equal(sailor._source.width, 1);
    near(sailor._source.x + 50, 3400);
    near(sailor._source.y + 50, 2200);
    const after = g.scene.tokens.get(live(g).body.tokenId)._source;
    assert.ok(after.width > wasWidth && after.height > wasHeight, 'the token grew to cover the group');
});

test('a factor outside the limits, or none, is refused; one is a no-op', async () => {
    const g = await stage();
    await assert.rejects(() => g.groups.scaleGroup(g.scene, g.group.id, 0.05), /between 0.1 and 10/);
    await assert.rejects(() => g.groups.scaleGroup(g.scene, g.group.id, 20), /between 0.1 and 10/);
    await assert.rejects(() => g.groups.scaleGroup(g.scene, g.group.id, 'big'), /between 0.1 and 10/);
    const before = JSON.stringify(g.tile._source);
    assert.deepEqual(await g.groups.scaleGroup(g.scene, g.group.id, 1), { scaled: 0 });
    assert.equal(JSON.stringify(g.tile._source), before);
    await assert.rejects(() => g.groups.scaleGroup(g.scene, 'nope', 2), /no group/);
});

test('a group that was moved first is resized about where its pin now is', async () => {
    const g = await stage();
    await g.pins.update(g.group.anchor.id, { x: 4000 });
    await g.settle();
    await g.groups.scaleGroup(g.scene, g.group.id, 2);
    assert.equal(g.tile._source.x, 4200);
});

test('a group remembers how far it has been resized, and Reset puts it back', async () => {
    const g = await stage();
    await g.groups.scaleGroup(g.scene, g.group.id, 2);
    assert.equal(live(g).scale, 2);
    await g.groups.scaleGroup(g.scene, g.group.id, 1.25);
    assert.equal(live(g).scale, 2.5);
    assert.deepEqual(await g.groups.resetScale(g.scene, g.group.id), { scaled: 7 });
    assert.equal('scale' in live(g), false);
    assert.deepEqual([g.tile._source.width, g.tile._source.height], [200, 100]);
    near(g.tile._source.x, 3100);
    assert.deepEqual(await g.groups.resetScale(g.scene, g.group.id), { scaled: 0 }, 'nothing to reset');
});

test('Smaller and Bigger by the same step are opposites', async () => {
    const g = await stage();
    await g.groups.scaleGroup(g.scene, g.group.id, 1.25);
    await g.groups.scaleGroup(g.scene, g.group.id, 1 / 1.25);
    assert.equal('scale' in live(g), false);
    near(g.tile._source.width, 200, 2);
});

test('a group can be reset from beyond the limits of one call', async () => {
    const g = await stage();
    await g.groups.scaleGroup(g.scene, g.group.id, 10);
    await g.groups.scaleGroup(g.scene, g.group.id, 2);
    assert.equal(live(g).scale, 20);
    await g.groups.resetScale(g.scene, g.group.id);
    assert.equal('scale' in live(g), false);
});

test('a group is set to a width in squares, and reports the width it has', async () => {
    const g = await stage();
    // The tile is 200 wide at 100 to the right of the pin, the drawing and others lie to the left; ask the group.
    const before = g.groups.groupWidth(g.scene, live(g));
    assert.ok(before > 0);
    await g.groups.setGroupWidth(g.scene, g.group.id, before * 2);
    near(g.groups.groupWidth(g.scene, live(g)), before * 2, 0.05);
    assert.equal(live(g).scale, 2);
    await assert.rejects(() => g.groups.setGroupWidth(g.scene, g.group.id, 0), /above zero/);
    await assert.rejects(() => g.groups.setGroupWidth(g.scene, g.group.id, before * 50), /times its width/);
});
