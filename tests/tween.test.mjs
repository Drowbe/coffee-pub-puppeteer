// Run with: node --test tests/*.test.mjs
// The tween: members follow a token's displayed (animated) pose, frame by frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';
import { rotate } from '../scripts/geometry.js';
import { resetTween } from '../scripts/tween.js';

const near = (a, b, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

// A display object as Foundry would hold it: something with a position and an angle we can read back.
const sprite = () => ({ position: { x: null, y: null, set(x, y) { this.x = x; this.y = y; } }, angle: null });

async function cart() {
    resetTween();
    const env = installFakes();
    const groups = await import('../scripts/groups.js');
    const follower = await import('../scripts/follower.js');
    const { registerTween } = await import('../scripts/tween.js');
    follower.registerFollower();
    registerTween();

    const { scene } = env;
    const token = scene.addToken('K1', { x: 5000, y: 3000, rotation: 0, name: 'Cart' });
    const tile = scene.add('Tile', 'T1', { x: 5050, y: 3350, width: 400, height: 900, rotation: 0, texture: { anchorX: 0.5, anchorY: 0.5 } });
    const light = scene.add('AmbientLight', 'L1', { x: 4900, y: 3100, rotation: 0 });
    const note = scene.add('Note', 'N1', { x: 5100, y: 3050 });
    const drawing = scene.add('Drawing', 'D1', { x: 4900, y: 3200, shape: { width: 200, height: 100 }, rotation: 0 });

    const group = await groups.createTokenGroup(scene, token);
    await groups.addMembers(scene, group.id, [tile, light, note, drawing]);
    await env.settle();

    // What Foundry draws, per member; and the token as Foundry shows it mid-glide.
    tile.object = { mesh: sprite(), document: tile };
    note.object = { position: sprite().position, document: note };
    drawing.object = { shape: sprite(), document: drawing };
    token.width = 1;
    token.height = 1;
    const glide = (x, y, rotation, animating = true) => {
        token.x = x; token.y = y; token.rotation = rotation;           // the animated values
        token.animationContexts = animating ? new Map([['move', {}]]) : new Map();
    };
    const frame = (animating = true) => env.fire('refreshToken', { document: token, animationContexts: token.animationContexts }, {});
    return { ...env, groups, token, tile, light, note, drawing, group, glide, frame };
}

test('mid-glide, a tile is drawn where the group would be for the token\'s displayed position', async () => {
    const { token, tile, glide, frame } = await cart();
    // The token is going from (5000, 3000) to (6000, 3000) and is half way.
    token._source.x = 6000;
    glide(5500, 3000, 0);
    frame();
    // The tile sat 300 below the token's centre, so it is 300 below the displayed centre, not the final one.
    near(tile.object.mesh.position.x, 5550);
    near(tile.object.mesh.position.y, 3350);
    near(tile.object.mesh.angle, 0, 1e-6);
});

test('the last frame lands exactly on the final pose', async () => {
    const { token, tile, glide, frame } = await cart();
    token._source.x = 6000;
    glide(6000, 3000, 0);
    frame();
    near(tile.object.mesh.position.x, 6050);
    near(tile.object.mesh.position.y, 3350);
});

test('a turn is followed too, about the displayed centre', async () => {
    const { token, tile, glide, frame } = await cart();
    token._source.rotation = 90;
    glide(5000, 3000, 45);                                            // half way through a quarter turn
    frame();
    const r = rotate(0, 300, 45);
    near(tile.object.mesh.position.x, 5050 + r.x);
    near(tile.object.mesh.position.y, 3050 + r.y);
    near(tile.object.mesh.angle, 45, 1e-6);
});

test('notes and drawings are drawn along with it as well', async () => {
    const { token, note, drawing, glide, frame } = await cart();
    token._source.x = 6000;
    glide(5500, 3000, 0);
    frame();
    near(note.object.position.x, 5100 + 500);
    near(note.object.position.y, 3050);
    // A drawing is positioned by the centre of its box.
    near(drawing.object.shape.position.x, 4900 + 500 + 100);
    near(drawing.object.shape.position.y, 3200 + 50);
});

test('nothing is drawn when the token is not animating', async () => {
    const { token, tile, glide, frame } = await cart();
    glide(5500, 3000, 0, false);
    frame();
    assert.equal(tile.object.mesh.position.x, null);
});

test('lights are left to their documents: they cannot be animated by moving a sprite', async () => {
    const { token, light, glide, frame } = await cart();
    light.object = { position: sprite().position, document: light };
    token._source.x = 6000;
    glide(5500, 3000, 0);
    frame();
    assert.equal(light.object.position.x, null);
});

test('a token with no group, or a copied one, draws nothing', async () => {
    const { scene, tile, fire } = await cart();
    const glideOf = (doc, x, y) => {
        doc.x = x; doc.y = y; doc.rotation = 0; doc.width = 1; doc.height = 1;
        fire('refreshToken', { document: doc, animationContexts: new Map([['move', {}]]) }, {});
    };

    // A copy carries the flag but the group's record names the original.
    const copy = scene.addToken('K2', { x: 0, y: 0, flags: structuredClone(scene.tokens.get('K1')._source.flags) });
    glideOf(copy, 400, 400);
    assert.equal(tile.object.mesh.position.x, null);

    const plain = scene.addToken('K3', { x: 0, y: 0 });
    glideOf(plain, 10, 10);
    assert.equal(tile.object.mesh.position.x, null);
});

test('when Foundry redraws a gliding tile from its document, the tweened pose goes straight back', async () => {
    const { token, tile, glide, frame, fire } = await cart();
    token._source.x = 6000;
    glide(5500, 3000, 0);
    frame();
    const during = { x: tile.object.mesh.position.x, y: tile.object.mesh.position.y };

    // The follower's write lands and Foundry redraws the tile at its final spot.
    tile.object.mesh.position.set(6050, 3350);
    fire('refreshTile', tile.object, {});
    assert.deepEqual({ x: tile.object.mesh.position.x, y: tile.object.mesh.position.y }, during);
});

test('after the glide, a redraw is Foundry\'s own, not held', async () => {
    const { token, tile, glide, frame, fire } = await cart();
    token._source.x = 6000;
    glide(5500, 3000, 0);
    frame();

    const realNow = performance.now.bind(performance);
    performance.now = () => realNow() + 1000;                        // well past the hold
    try {
        tile.object.mesh.position.set(6050, 3350);
        fire('refreshTile', tile.object, {});
        near(tile.object.mesh.position.x, 6050);
    } finally {
        performance.now = realNow;
    }
});

test('a member that is not on the canvas yet is skipped without error', async () => {
    const { token, tile, glide, frame } = await cart();
    tile.object = undefined;
    token._source.x = 6000;
    glide(5500, 3000, 0);
    assert.doesNotThrow(() => frame());
});
