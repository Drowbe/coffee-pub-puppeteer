// Run with: node --test tests/*.test.mjs
// Placing a group by clicking the map: the pointer carries the group, a click chooses the place.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';

class Node2 {
    constructor() { this.children = []; this.position = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } }; this.destroyed = false; this.anchor = { set() {} }; }
    addChild(child) { this.children.push(child); return child; }
    addChildAt(child) { this.children.push(child); return child; }
    destroy() { this.destroyed = true; }
}
class Graphics extends Node2 { lineStyle() {} moveTo() {} lineTo() {} drawCircle() {} drawPolygon() {} }

async function stage() {
    const env = installFakes();
    const listeners = { pointermove: new Set(), pointerdown: new Set() };
    const keys = new Set();
    const layer = new Node2();
    layer.toLocal = (global) => ({ x: global.x, y: global.y });
    globalThis.PIXI = { Container: Node2, Sprite: Node2, Graphics };
    globalThis.foundry.canvas = { loadTexture: async () => ({}) };
    globalThis.canvas = {
        ...(globalThis.canvas ?? {}),
        scene: env.scene,
        mousePosition: { x: 100, y: 200 },
        'blacksmith-utilities-layer': layer,
        stage: { cursor: 'default', on: (name, fn) => listeners[name].add(fn), off: (name, fn) => listeners[name].delete(fn) }
    };
    globalThis.document = { getElementById: () => ({ style: { cursor: '' } }), addEventListener: (name, fn) => keys.add(fn), removeEventListener: (name, fn) => keys.delete(fn) };
    const { pickPlacement } = await import('../scripts/placement.js');
    const template = { version: 2, name: 'Cart', anchorType: 'pin', members: [
        { type: 'Tile', dx: 100, dy: 0, drot: 0, data: { x: 100, y: 0, width: 200, height: 100, rotation: 0, texture: { src: 'cart.webp', anchorX: 0.5, anchorY: 0.5 } } },
        { type: 'AmbientLight', dx: 0, dy: 50, drot: 0, data: { x: 0, y: 50, rotation: 0 } }
    ] };
    return { ...env, pickPlacement, template, listeners, keys, layer };
}

test('the group is shown at the pointer, and a left click gives that place', async () => {
    const g = await stage();
    const placing = g.pickPlacement(g.template);
    const ghost = g.layer.children[0];
    assert.deepEqual([ghost.position.x, ghost.position.y, ghost.visible], [100, 200, true], 'starts where the pointer already is');
    for (const move of g.listeners.pointermove) move({ global: { x: 640, y: 480 } });
    assert.deepEqual([ghost.position.x, ghost.position.y], [640, 480]);
    for (const down of g.listeners.pointerdown) down({ button: 0, global: { x: 700, y: 500 } });
    assert.deepEqual(await placing, { x: 700, y: 500 });
    assert.equal(ghost.destroyed, true, 'the picture goes');
    assert.deepEqual([g.listeners.pointermove.size, g.listeners.pointerdown.size, g.keys.size], [0, 0, 0], 'nothing is left listening');
    assert.equal(canvas.stage.cursor, 'default');
});

test('right-click and Escape give up', async () => {
    const g = await stage();
    let placing = g.pickPlacement(g.template);
    for (const down of g.listeners.pointerdown) down({ button: 2, global: { x: 1, y: 1 } });
    assert.equal(await placing, null);

    placing = g.pickPlacement(g.template);
    for (const key of g.keys) key({ key: 'Escape' });
    assert.equal(await placing, null);
    assert.equal(g.listeners.pointerdown.size, 0);
});

test('starting another placement gives up the first', async () => {
    const g = await stage();
    const first = g.pickPlacement(g.template);
    const second = g.pickPlacement(g.template);
    assert.equal(await first, null);
    for (const down of g.listeners.pointerdown) down({ button: 0, global: { x: 5, y: 6 } });
    assert.deepEqual(await second, { x: 5, y: 6 });
});
