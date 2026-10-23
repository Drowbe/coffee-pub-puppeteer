// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { captureMember, memberUpdate, memberExtent, extentCentre } from '../scripts/geometry.js';
import { TEMPLATE_VERSION, buildTemplate, validateTemplate, stampMembers } from '../scripts/template.js';

const near = (a, b, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

// A small group: a tile, a light and a wall, captured around a pivot at (2000, 2000) facing 30 degrees.
function sampleGroup() {
    const anchor = { x: 2000, y: 2000, heading: 30 };
    const docs = [
        ['Tile', 'T1', { _id: 'T1', _stats: { x: 1 }, x: 1700, y: 1900, width: 600, height: 200, rotation: 10, levels: ['L1'], texture: { src: 'cart.webp' }, flags: { 'some-module': { a: 1 } } }],
        ['AmbientLight', 'L1', { _id: 'L1', x: 2300, y: 2100, rotation: 45, config: { dim: 20 } }],
        ['Wall', 'W1', { _id: 'W1', c: [1800, 2200, 2200, 2200], move: 20 }]
    ];
    const group = {
        id: 'g1', name: 'Cart', anchor: { type: 'pin', id: 'p1' }, heading: 30, applied: anchor,
        members: docs.map(([type, id, data]) => captureMember(type, id, data, anchor))
    };
    const sources = new Map(docs.map(([type, id, data]) => [`${type}:${id}`, data]));
    return { group, sources, anchor, docs };
}

test('a template carries offsets and a snapshot, and none of the source identity', () => {
    const { group, sources } = sampleGroup();
    const t = buildTemplate(group, sources);
    assert.equal(t.version, TEMPLATE_VERSION);
    assert.equal(t.name, 'Cart');
    assert.equal(t.members.length, 3);
    for (const member of t.members) {
        assert.ok(!('id' in member), 'a member id names a document on the source scene');
        assert.ok(!('_id' in member.data) && !('_stats' in member.data) && !('levels' in member.data));
    }
    assert.deepEqual(t.members[0].data.texture, { src: 'cart.webp' });
    assert.deepEqual(t.members[0].data.flags, { 'some-module': { a: 1 } });
});

test('building a template does not alter the group or the sources', () => {
    const { group, sources } = sampleGroup();
    const before = JSON.stringify([group, [...sources]]);
    buildTemplate(group, sources);
    assert.equal(JSON.stringify([group, [...sources]]), before);
});

test('a member whose document is gone is left out', () => {
    const { group, sources } = sampleGroup();
    sources.delete('AmbientLight:L1');
    assert.equal(buildTemplate(group, sources).members.length, 2);
});

test('the template survives JSON, which is how it is saved', () => {
    const { group, sources } = sampleGroup();
    const t = buildTemplate(group, sources);
    assert.deepEqual(JSON.parse(JSON.stringify(t)), t);
});

test('stamping at the original pivot puts every member back where it was', () => {
    const { group, sources, anchor, docs } = sampleGroup();
    const stamped = stampMembers(buildTemplate(group, sources), anchor);
    stamped.forEach(({ type, data }, i) => {
        const original = docs[i][2];
        if (type === 'Wall') assert.deepEqual(data.c, original.c);
        else { near(data.x, original.x); near(data.y, original.y); }
        if ('rotation' in original) near(data.rotation, original.rotation, 1e-6);
    });
});

test('two stamps are independent, rigid copies', () => {
    const { group, sources } = sampleGroup();
    const t = buildTemplate(group, sources);
    const a = stampMembers(t, { x: 500, y: 500, heading: 0 });
    const b = stampMembers(t, { x: 9000, y: 4000, heading: 90 });

    // Different objects, so changing one cannot touch the other.
    assert.notEqual(a[0].data, b[0].data);
    a[0].data.texture.src = 'changed.webp';
    assert.equal(b[0].data.texture.src, 'cart.webp');

    // Each copy is the same shape: its extent centre sits the same distance from its own pivot.
    const spread = (stamp, pivot) => {
        const c = extentCentre(stamp.flatMap(({ type, data }) => memberExtent(type, data)));
        return Math.hypot(c.x - pivot.x, c.y - pivot.y);
    };
    near(spread(a, { x: 500, y: 500 }), spread(b, { x: 9000, y: 4000 }), 2);
});

test('stamping onto a heading turns the copy about its pivot', () => {
    const { group, sources } = sampleGroup();
    const t = buildTemplate(group, sources);
    const flat = stampMembers(t, { x: 0, y: 0, heading: 0 });
    const turned = stampMembers(t, { x: 0, y: 0, heading: 90 });
    // The light's own heading moves with the group.
    const rotation = (stamp) => stamp.find((m) => m.type === 'AmbientLight').data.rotation;
    near((rotation(turned) - rotation(flat) + 360) % 360, 90, 1e-6);
});

test('stamped data carries nothing that would collide on the new scene', () => {
    const { group, sources, anchor } = sampleGroup();
    for (const { data } of stampMembers(buildTemplate(group, sources), anchor)) {
        assert.ok(!('_id' in data) && !('levels' in data));
    }
});

test('a template that cannot be stamped is refused with a reason', () => {
    const good = buildTemplate(sampleGroup().group, sampleGroup().sources);
    assert.doesNotThrow(() => validateTemplate(good));
    assert.throws(() => validateTemplate(null), /not an object/);
    assert.throws(() => validateTemplate({ ...good, version: 99 }), /version 99/);
    assert.throws(() => validateTemplate({ ...good, members: 'x' }), /no members list/);
    assert.throws(() => validateTemplate({ ...good, members: [{ type: 'Token', data: {}, dx: 0, dy: 0 }] }), /unsupported type/);
    assert.throws(() => validateTemplate({ ...good, members: [{ type: 'Tile', data: {} }] }), /no position/);
    assert.throws(() => validateTemplate({ ...good, members: [{ type: 'Wall', data: {}, c: [1, 2] }] }), /no position/);
    assert.throws(() => stampMembers({ ...good, version: 2 }, { x: 0, y: 0, heading: 0 }), /not a usable template/);
});
