// Run with: node --test tests/*.test.mjs
// A group that faces its direction of travel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';
import { travelHeading } from '../scripts/anchor.js';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);
const live = (g) => g.scene.getFlag('coffee-pub-puppeteer', 'groups')[g.group.id];

async function boat(behaviour = { facesTravel: true }) {
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const follower = await import('../scripts/follower.js');
    follower.registerFollower();
    const { scene } = env;
    // A boat 400 long and 100 wide, lying along the way it faces at heading zero (down the map).
    const hull = scene.add('Tile', 'T1', { x: 3000, y: 2000, width: 100, height: 400, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const group = await groups.createGroup(scene, { x: 3000, y: 2000 }, { name: 'Boat' });
    await groups.addMembers(scene, group.id, [hull]);
    await groups.setBehaviour(scene, group.id, behaviour);
    await env.settle();
    return { ...env, groups, group, hull, grid: scene.grid.sizeX ?? scene.grid.size };
}

const pose = (heading, x = 3000, y = 2000) => ({ x, y, heading });

test('the heading of a move is Foundry\'s rotation: down is 0, west 90, up 180, east 270', () => {
    const group = { facesTravel: true };
    const go = (dx, dy) => travelHeading(group, pose(0), pose(0, 3000 + dx, 2000 + dy), 100);
    near(go(0, 300), 0);
    near(go(-300, 0), 90);
    near(go(0, -300), 180);
    near(go(300, 0), 270);
    near(go(300, 300), 315);
});

test('no heading is chosen unless the group asks for one, can turn, and was only moved', () => {
    const to = pose(0, 3500);
    assert.equal(travelHeading({}, pose(0), to, 100), null, 'not asked for');
    assert.equal(travelHeading({ facesTravel: true, rotates: false }, pose(0), to, 100), null, 'does not turn with its pin');
    assert.equal(travelHeading({ facesTravel: true }, pose(0), pose(45, 3500), 100), null, 'the pin was turned by hand as well');
    assert.equal(travelHeading({ facesTravel: true }, pose(0), pose(0, 3020), 100), null, 'a nudge is not a journey');
});

test('moving the pin turns the group to face the way it went, and the pin turns with it', async () => {
    const g = await boat();
    await g.pins.update(g.group.anchor.id, { x: 3500 });
    await g.settle();
    near(live(g).heading, 270);
    near(g.pins.get(g.group.anchor.id).rotation, 270);
    // The hull is now lying along the east-west line, centred where the pin is.
    near(g.hull._source.x, 3500);
    near(g.hull._source.rotation, 270);
    near(g.pins.get(g.group.anchor.id).x, 3500);
});

test('a second move turns it again, and a move back turns it round', async () => {
    const g = await boat();
    await g.pins.update(g.group.anchor.id, { x: 3500 });
    await g.settle();
    await g.pins.update(g.group.anchor.id, { y: 2600 });
    await g.settle();
    near(live(g).heading, 0);
    await g.pins.update(g.group.anchor.id, { y: 2000 });
    await g.settle();
    near(live(g).heading, 180);
    near(g.hull._source.rotation, 180);
});

test('turning the pin by hand is obeyed, and the group does not face its travel when it is off', async () => {
    const g = await boat();
    await g.pins.update(g.group.anchor.id, { x: 3500, rotation: 45 });
    await g.settle();
    near(live(g).heading, 45);

    const plain = await boat({});
    await plain.pins.update(plain.group.anchor.id, { x: 3500 });
    await plain.settle();
    near(live(plain).heading, 0);
});

test('turning it off removes the setting, a duplicate keeps it, and it cannot turn a group that does not turn', async () => {
    const g = await boat();
    assert.equal(live(g).facesTravel, true);
    const library = await import('../scripts/library.js');
    const copy = await library.duplicateGroup(g.scene, g.group.id);
    assert.equal(copy.facesTravel, true);
    await g.groups.setBehaviour(g.scene, g.group.id, { facesTravel: false });
    assert.equal(live(g).facesTravel, undefined);

    await g.groups.setBehaviour(g.scene, g.group.id, { facesTravel: true, rotates: false });
    await g.pins.update(g.group.anchor.id, { x: 3500 });
    await g.settle();
    near(live(g).heading, 0);
});
