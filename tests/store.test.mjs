// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';

test('every shape of group change is seen as a change to what is on screen', async () => {
    const { groupsTouched } = await import('../scripts/store.js');
    const mod = 'coffee-pub-puppeteer';
    assert.equal(groupsTouched({ flags: { [mod]: { groups: { g1: { name: 'x' } } } } }), true, 'a group made or changed');
    assert.equal(groupsTouched({ flags: { [mod]: { groups: { '-=g1': null } } } }), true, 'a group deleted');
    assert.equal(groupsTouched({ flags: { [mod]: { '-=groups': null } } }), true, 'every group gone at once');
    assert.equal(groupsTouched({ flags: { [`-=${mod}`]: null } }), true, 'all of Puppeteer\'s flags removed');
    assert.equal(groupsTouched({ flags: { 'coffee-pub-blacksmith': { pins: [] } } }), true, 'a pin made, moved or deleted');
});

test('an unrelated scene change is not', async () => {
    const { groupsTouched } = await import('../scripts/store.js');
    assert.equal(groupsTouched({ name: 'A scene' }), false);
    assert.equal(groupsTouched({ flags: { 'some-other-module': { a: 1 } } }), false);
    assert.equal(groupsTouched(undefined), false);
    assert.equal(groupsTouched({ flags: null }), false);
});

test('deleting a group reports a change that is recognised, and the group is gone from the list', async () => {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const { groupsTouched } = await import('../scripts/store.js');
    const seen = [];
    env.hooks.push({ name: 'updateScene', callback: (scene, changes) => seen.push(changes) });

    const one = await groups.createGroup(env.scene, { x: 100, y: 100 }, { name: 'One' });
    const two = await groups.createGroup(env.scene, { x: 200, y: 200 }, { name: 'Two' });
    await env.settle();
    seen.length = 0;

    await groups.deleteGroup(env.scene, one.id);
    await env.settle();
    assert.ok(seen.length > 0 && seen.every(groupsTouched), 'each update caused by deleting is recognised');
    assert.deepEqual(groups.listGroups(env.scene).map((g) => g.name), ['Two']);

    // Deleting the last one leaves an empty list.
    await groups.deleteGroup(env.scene, two.id);
    await env.settle();
    assert.deepEqual(groups.listGroups(env.scene), []);
});
