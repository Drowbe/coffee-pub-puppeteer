// Run with: node --test tests/*.test.mjs
// Group events: when something happens to a group, play a sound or run a macro.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';

const live = (g) => g.scene.getFlag('coffee-pub-puppeteer', 'groups')[g.group.id];

async function ship() {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const follower = await import('../scripts/follower.js');
    follower.registerFollower();
    const { scene } = env;
    const ran = [];
    game.macros = new Map([['M1', { id: 'M1', name: 'Fog horn', execute: async (scope) => { ran.push(scope); } }]]);
    const tile = scene.add('Tile', 'T1', { x: 3000, y: 2000, width: 400, height: 200, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const group = await groups.createGroup(scene, { x: 3000, y: 2000 }, { name: 'Galleon' });
    await groups.addMembers(scene, group.id, [tile]);
    await groups.setMountable(scene, group.id, true);
    await env.settle();
    return { ...env, groups, group, ran, tile };
}

test('a rule is stored with an id, and refused if it is not a trigger, an action and a value', async () => {
    const g = await ship();
    const rule = await g.groups.addEvent(g.scene, g.group.id, { on: 'move', do: 'sound', value: ' sounds/creak.ogg ' });
    assert.ok(rule.id);
    assert.deepEqual(live(g).events, [{ id: rule.id, on: 'move', do: 'sound', value: 'sounds/creak.ogg' }]);
    await assert.rejects(() => g.groups.addEvent(g.scene, g.group.id, { on: 'sneeze', do: 'sound', value: 'x' }), /happens when/);
    await assert.rejects(() => g.groups.addEvent(g.scene, g.group.id, { on: 'move', do: 'explode', value: 'x' }), /can sound, macro, image/);
    await assert.rejects(() => g.groups.addEvent(g.scene, g.group.id, { on: 'move', do: 'macro', value: '  ' }), /choose a macro/);
});

test('a group can have twenty rules and no more, and a rule can be removed', async () => {
    const g = await ship();
    const first = await g.groups.addEvent(g.scene, g.group.id, { on: 'move', do: 'sound', value: 'a.ogg' });
    for (let i = 1; i < 20; i += 1) await g.groups.addEvent(g.scene, g.group.id, { on: 'move', do: 'sound', value: `a${i}.ogg` });
    await assert.rejects(() => g.groups.addEvent(g.scene, g.group.id, { on: 'move', do: 'sound', value: 'b.ogg' }), /20 events/);
    assert.equal(await g.groups.removeEvent(g.scene, g.group.id, first.id), true);
    assert.equal(await g.groups.removeEvent(g.scene, g.group.id, first.id), false);
    assert.equal(live(g).events.length, 19);
});

test('moving the group plays its sound to everyone and runs its macro, once per move', async () => {
    const g = await ship();
    await g.groups.addEvent(g.scene, g.group.id, { on: 'move', do: 'sound', value: 'sounds/creak.ogg' });
    await g.groups.addEvent(g.scene, g.group.id, { on: 'move', do: 'macro', value: 'M1' });
    await g.groups.addEvent(g.scene, g.group.id, { on: 'hide', do: 'sound', value: 'sounds/never.ogg' });
    await g.pins.update(g.group.anchor.id, { x: 3500 });
    await g.settle();
    assert.deepEqual(g.sounds.map((s) => [s.sound, s.broadcast]), [['sounds/creak.ogg', true]]);
    assert.equal(g.ran.length, 1);
    assert.equal(g.ran[0].event.name, 'move');
    assert.equal(g.ran[0].group.name, 'Galleon');
    assert.equal(g.ran[0].event.to.x, 3500);
    await g.pins.update(g.group.anchor.id, { y: 2400 });
    await g.settle();
    assert.equal(g.ran.length, 2);
});

test('hiding and showing fire their own rules', async () => {
    const g = await ship();
    await g.groups.addEvent(g.scene, g.group.id, { on: 'hide', do: 'sound', value: 'down.ogg' });
    await g.groups.addEvent(g.scene, g.group.id, { on: 'show', do: 'sound', value: 'up.ogg' });
    await g.groups.setGroupHidden(g.scene, g.group.id, true);
    await g.groups.setGroupHidden(g.scene, g.group.id, true);       // already hidden: nothing happens
    await g.groups.setGroupHidden(g.scene, g.group.id, false);
    assert.deepEqual(g.sounds.map((s) => s.sound), ['down.ogg', 'up.ogg']);
});

test('boarding and leaving fire their rules with the token', async () => {
    const g = await ship();
    await g.groups.addEvent(g.scene, g.group.id, { on: 'board', do: 'macro', value: 'M1' });
    await g.groups.addEvent(g.scene, g.group.id, { on: 'leave', do: 'sound', value: 'splash.ogg' });
    const sailor = g.scene.addToken('R1', { x: 2950, y: 1950, name: 'Sailor' });
    await g.groups.mountTokens(g.scene, g.group.id, [sailor]);
    assert.equal(g.ran.length, 1);
    assert.deepEqual(g.ran[0].event.token, { id: 'R1', name: 'Sailor' });
    await g.groups.dismountToken(g.scene, g.group.id, 'R1');
    assert.deepEqual(g.sounds.map((s) => s.sound), ['splash.ogg']);
});

test('a rule that fails is skipped, the rest still run, and the group still moves', async () => {
    const g = await ship();
    game.macros.set('BAD', { id: 'BAD', name: 'Broken', execute: async () => { throw new Error('boom'); } });
    await g.groups.addEvent(g.scene, g.group.id, { on: 'move', do: 'macro', value: 'BAD' });
    await g.groups.addEvent(g.scene, g.group.id, { on: 'move', do: 'macro', value: 'GONE' });
    await g.groups.addEvent(g.scene, g.group.id, { on: 'move', do: 'macro', value: 'M1' });
    const error = console.error;
    console.error = () => {};
    try {
        globalThis.fromUuid = async () => null;
        await g.pins.update(g.group.anchor.id, { x: 3500 });
        await g.settle();
    } finally {
        console.error = error;
    }
    assert.equal(g.ran.length, 1);
    assert.equal(g.tile._source.x, 3500);
});

test('a duplicate keeps the rules', async () => {
    const g = await ship();
    await g.groups.addEvent(g.scene, g.group.id, { on: 'move', do: 'sound', value: 'a.ogg' });
    const library = await import('../scripts/library.js');
    const copy = await library.duplicateGroup(g.scene, g.group.id);
    assert.equal(copy.events.length, 1);
    assert.equal(copy.events[0].value, 'a.ogg');
});
