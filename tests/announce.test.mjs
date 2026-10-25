// Run with: node --test tests/*.test.mjs
// What Puppeteer says and plays: chat cards for boarding (when asked for), a sound for stamping, and the toast channel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';

async function barge() {
    const env = installFakes();
    const { getBlacksmith } = await import('../scripts/blacksmith.js');
    const toasts = [];
    getBlacksmith().toast.show = (options) => toasts.push(options);
    const groups = await import('../scripts/groups.js');
    const follower = await import('../scripts/follower.js');
    const boarding = await import('../scripts/boarding.js');
    follower.registerFollower();
    boarding.registerBoarding();
    const { scene } = env;
    const tile = scene.add('Tile', 'T1', { x: 3000, y: 2000, width: 800, height: 400, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const group = await groups.createGroup(scene, { x: 3000, y: 2000 }, { name: 'The <Gull>' });
    await groups.addMembers(scene, group.id, [tile]);
    const sailor = scene.addToken('R1', { x: 3050, y: 1950, name: 'Sailor' });
    await env.settle();
    return { ...env, groups, group, sailor, toasts };
}

test('a group that does not announce says nothing in chat when a token boards', async () => {
    const g = await barge();
    await g.groups.mountTokens(g.scene, g.group.id, [g.sailor]);
    assert.equal(g.cards.length, 0);
    assert.equal(g.sounds.length, 0);
});

test('a group that announces posts a public card when a token boards, and another when it leaves', async () => {
    const g = await barge();
    await g.groups.setBehaviour(g.scene, g.group.id, { announce: true });
    await g.groups.mountTokens(g.scene, g.group.id, [g.sailor]);
    assert.equal(g.cards.length, 1);
    assert.equal(g.cards[0].moduleId, 'coffee-pub-puppeteer');
    assert.equal(g.cards[0].type, 'boarded');
    assert.equal(g.cards[0].parts[0].title, 'Boarded');
    assert.match(g.cards[0].parts[1].blocks[0].text, /\*\*Sailor\*\* boards \*\*The &lt;Gull&gt;\*\*/);
    assert.equal(g.cards[0].whisper, undefined);

    await g.groups.dismountToken(g.scene, g.group.id, 'R1');
    assert.equal(g.cards.length, 2);
    assert.equal(g.cards[1].type, 'disembarked');
    assert.match(g.cards[1].parts[1].blocks[0].text, /\*\*Sailor\*\* leaves/);
});

test('the announcement is heard by everyone, softly', async () => {
    const g = await barge();
    await g.groups.setBehaviour(g.scene, g.group.id, { announce: true });
    await g.groups.mountTokens(g.scene, g.group.id, [g.sailor]);
    assert.deepEqual(g.sounds.at(-1), { sound: 'button-02', volume: '0.5', loop: false, broadcast: true });
});

test('a rider walking off a group that announces is announced too', async () => {
    const g = await barge();
    await g.groups.setBehaviour(g.scene, g.group.id, { announce: true });
    await g.groups.mountTokens(g.scene, g.group.id, [g.sailor]);
    await g.sailor.update({ x: 5000, y: 1950 });
    await g.settle();
    assert.equal(g.cards.at(-1).type, 'disembarked');
});

test('stamping a template plays a soft sound on this screen only', async () => {
    const g = await barge();
    const library = await import('../scripts/library.js');
    const id = await library.saveGroupToLibrary(g.scene, g.group.id);
    await library.stampTemplate(g.scene, id, { x: 6000, y: 4000 });
    assert.deepEqual(g.sounds.at(-1), { sound: 'button-01', volume: '0.5', loop: false, broadcast: false });
});

test('every toast Puppeteer shows is on its own channel', async () => {
    const g = await barge();
    await g.groups.mountTokens(g.scene, g.group.id, [g.sailor]);
    await g.sailor.update({ x: 5000, y: 1950 });
    await g.settle();
    assert.ok(g.toasts.length > 0);
    assert.ok(g.toasts.every((toast) => toast.channel === 'puppeteer'));
});
