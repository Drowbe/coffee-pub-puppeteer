// Run with: node --test tests/*.test.mjs
// Damage levels: when a group's token reaches a health level, the group's rules for that level run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';

const live = (g) => g.scene.getFlag('coffee-pub-puppeteer', 'groups')[g.group.id];

async function cart() {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const follower = await import('../scripts/follower.js');
    const health = await import('../scripts/health.js');
    follower.registerFollower();
    health.registerHealth();
    const { scene } = env;
    const ran = [];
    game.macros = new Map([['M1', { id: 'M1', name: 'Wreck', execute: async (scope) => { ran.push(scope); } }]]);
    game.actors.set('A1', { id: 'A1', name: 'Wagon', async getTokenDocument(data) { return { toObject: () => ({ name: 'Wagon', actorId: 'A1', ...data }) }; } });
    const tile = scene.add('Tile', 'T1', { x: 3000, y: 2000, width: 400, height: 200, rotation: 0, texture: { src: 'cart.webp', anchorX: 0.5, anchorY: 0.5 } });
    const group = await groups.createGroup(scene, { x: 3000, y: 2000 }, { name: 'Cart' });
    await groups.addMembers(scene, group.id, [tile]);
    const token = await groups.setBody(scene, group.id, 'A1');
    const live_ = scene.tokens.get(token.id);
    const hurt = async (value, max = 100) => {
        live_.actor = { hp: { value, max } };
        env.fire('updateActor', { id: 'A1' }, {});
        await env.settle();
    };
    await env.settle();
    return { ...env, groups, health, group, tile, ran, hurt, body: live_ };
}

const damaged = (g) => g.groups.addEvent(g.scene, g.group.id, { on: 'health', at: 'bloodied', do: 'image', target: 'T1', value: 'cart-damaged.webp' });

test('a health rule needs a level and an image rule needs one of the group\'s tiles', async () => {
    const g = await cart();
    const rule = await damaged(g);
    assert.deepEqual(live(g).events, [{ id: rule.id, on: 'health', do: 'image', value: 'cart-damaged.webp', at: 'bloodied', target: 'T1' }]);
    await assert.rejects(() => g.groups.addEvent(g.scene, g.group.id, { on: 'health', do: 'sound', value: 'x.ogg' }), /health level/);
    await assert.rejects(() => g.groups.addEvent(g.scene, g.group.id, { on: 'health', at: 'bloodied', do: 'image', value: 'x.webp' }), /one of the group's tiles/);
    await assert.rejects(() => g.groups.addEvent(g.scene, g.group.id, { on: 'health', at: 'bloodied', do: 'image', target: 'NOPE', value: 'x.webp' }), /one of the group's tiles/);
});

test('when the token reaches the level, the picture changes once', async () => {
    const g = await cart();
    await damaged(g);
    await g.hurt(90);                                      // a scratch is still healthy
    assert.equal(g.tile._source.texture.src, 'cart.webp');
    await g.hurt(60);                                      // injured: no rule for it
    assert.equal(g.tile._source.texture.src, 'cart.webp');
    await g.hurt(40);                                      // bloodied
    assert.equal(g.tile._source.texture.src, 'cart-damaged.webp');
    assert.equal(live(g).healthLevel, 'bloodied');
    // The same level again changes nothing.
    g.tile._source.texture.src = 'touched.webp';
    await g.hurt(35);
    assert.equal(g.tile._source.texture.src, 'touched.webp');
});

test('healing back runs the rule for healthy, and the group remembers nothing for it', async () => {
    const g = await cart();
    await damaged(g);
    await g.groups.addEvent(g.scene, g.group.id, { on: 'health', at: 'healthy', do: 'image', target: 'T1', value: 'cart.webp' });
    await g.hurt(30);
    assert.equal(g.tile._source.texture.src, 'cart-damaged.webp');
    await g.hurt(100);
    assert.equal(g.tile._source.texture.src, 'cart.webp');
    assert.equal(live(g).healthLevel, undefined);
});

test('a hit that skips a level runs only the level it landed on', async () => {
    const g = await cart();
    await damaged(g);
    await g.groups.addEvent(g.scene, g.group.id, { on: 'health', at: 'critical', do: 'macro', value: 'M1' });
    await g.hurt(10);
    assert.equal(g.tile._source.texture.src, 'cart.webp');
    assert.equal(g.ran.length, 1);
    assert.deepEqual([g.ran[0].event.name, g.ran[0].event.level, g.ran[0].event.from], ['health', 'critical', 'healthy']);
});

test('an unlinked token is watched through its own update, and an unreadable actor changes nothing', async () => {
    const g = await cart();
    await damaged(g);
    g.body.actor = { hp: { value: 40, max: 100 } };
    g.fire('updateToken', g.body, { delta: { system: {} } });
    await g.settle();
    assert.equal(g.tile._source.texture.src, 'cart-damaged.webp');

    g.body.actor = { hp: null };
    g.fire('updateToken', g.body, { delta: {} });
    await g.settle();
    assert.equal(live(g).healthLevel, 'bloodied');

    // A move of the token says nothing about its health.
    g.body.actor = { hp: { value: 100, max: 100 } };
    g.fire('updateToken', g.body, { x: 10 });
    await g.settle();
    assert.equal(live(g).healthLevel, 'bloodied');
});

test('only the active GM reacts', async () => {
    const g = await cart();
    await damaged(g);
    game.users.activeGM = { isSelf: false };
    await g.hurt(10);
    assert.equal(g.tile._source.texture.src, 'cart.webp');
});
