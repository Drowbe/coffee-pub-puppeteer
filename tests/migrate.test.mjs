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
    assert.equal(group.version, 2);
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
