// The group bounds overlay: for every group on the scene in view, the box that holds its members (turned
// with the group), its pivot, and which way it faces. Each tool shows its own objects one layer at a time, so
// without this there is no way to see the group as one thing. Off by default; the choice is per user.
import { MODULE_ID } from './constants.js';
import { getBlacksmith } from './blacksmith.js';
import { MEMBER_TYPES, memberExtent, groupBounds, rotate } from './geometry.js';
import { getGroups } from './store.js';

const STORAGE_KEY = `${MODULE_ID}.showBounds`;
const COLOUR = 0xff9a1f;
const MEMBER_COLOUR = 0x39d2ff;

let enabled = readPreference();
let graphics = null;
let frame = null;

function readPreference() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

export const boundsShown = () => enabled;

export function setBoundsShown(value) {
    enabled = !!value;
    try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0'); } catch { /* a remembered choice is a convenience */ }
    draw();
}

export const toggleBounds = () => setBoundsShown(!enabled);

export function registerOverlay() {
    const { HookManager } = getBlacksmith();
    const hook = (name, callback) => HookManager.registerHook({
        name,
        description: 'Puppeteer: keep the group bounds overlay current',
        context: MODULE_ID,
        priority: 4,
        key: `${MODULE_ID}-overlay-${name}`,
        callback
    });

    hook('canvasReady', () => { graphics = null; schedule(); });
    hook('canvasTearDown', () => { graphics = null; });
    hook('updateScene', (scene, changes) => {
        if (scene.id !== canvas.scene?.id) return;
        const touched = foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.groups`)
            || foundry.utils.hasProperty(changes, 'flags.coffee-pub-blacksmith.pins');
        if (touched) schedule();
    });
    for (const type of MEMBER_TYPES) {
        hook(`update${type}`, (doc) => { if (doc.parent?.id === canvas.scene?.id) schedule(); });
        hook(`delete${type}`, (doc) => { if (doc.parent?.id === canvas.scene?.id) schedule(); });
    }
}

// Many updates arrive together (a whole group moving); draw once per frame.
function schedule() {
    if (frame !== null) return;
    frame = requestAnimationFrame(() => { frame = null; draw(); });
}

function ensureGraphics(layer) {
    if (!graphics || graphics.destroyed || graphics.parent !== layer) {
        graphics = new PIXI.Graphics();
        graphics.eventMode = 'none';
        layer.addChild(graphics);
    }
    return graphics;
}

function draw() {
    const scene = canvas?.scene;
    // Blacksmith's utilities layer is the place for overlays; it exists once the canvas has drawn.
    const layer = canvas?.['blacksmith-utilities-layer'];
    if (!scene || !layer) return;
    const g = ensureGraphics(layer);
    g.clear();
    if (!enabled) return;

    const { pins } = getBlacksmith();
    for (const group of Object.values(getGroups(scene))) {
        const pin = group.anchor.type === 'pin' ? pins.get(group.anchor.id, { sceneId: scene.id }) : null;
        const anchor = pin ? { x: pin.x, y: pin.y, heading: group.heading } : { ...group.applied };

        const points = [];
        const outlines = [];
        for (const member of group.members) {
            const doc = scene.getEmbeddedCollection(member.type).get(member.id);
            if (!doc) continue;
            const extent = memberExtent(member.type, doc._source);
            points.push(...extent);
            outlines.push({ type: member.type, extent });
        }
        if (!points.length) continue;

        const bounds = groupBounds(points, anchor);
        g.lineStyle(3, COLOUR, 0.9);
        g.beginFill(COLOUR, 0.06);
        g.drawPolygon(bounds.corners.flatMap((c) => [c.x, c.y]));
        g.endFill();

        // Each member where the group believes it is, so a member drawn away from its object is plain to see.
        g.lineStyle(2, MEMBER_COLOUR, 0.9);
        for (const { extent } of outlines) {
            if (extent.length === 1) {
                g.drawCircle(extent[0].x, extent[0].y, 9);
            } else if (extent.length === 2) {
                g.moveTo(extent[0].x, extent[0].y);
                g.lineTo(extent[1].x, extent[1].y);
            } else {
                g.drawPolygon(extent.flatMap((c) => [c.x, c.y]));
            }
        }

        // The pivot, and a tick showing which way the group faces (heading zero faces down the screen).
        const arm = 20;
        g.lineStyle(2, COLOUR, 1);
        g.moveTo(anchor.x - arm, anchor.y);
        g.lineTo(anchor.x + arm, anchor.y);
        g.moveTo(anchor.x, anchor.y - arm);
        g.lineTo(anchor.x, anchor.y + arm);
        g.drawCircle(anchor.x, anchor.y, 7);
        const tip = rotate(0, 70, group.heading);
        g.lineStyle(4, COLOUR, 1);
        g.moveTo(anchor.x, anchor.y);
        g.lineTo(anchor.x + tip.x, anchor.y + tip.y);
    }
}

/** Redraw now. For the first draw after the canvas is ready, and when the preference changes. */
export const redrawBounds = () => schedule();
