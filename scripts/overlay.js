// The group bounds overlay: for every group on the scene in view, the box that holds its members (turned
// with the group), its pivot, and which way it faces. Each tool shows its own objects one layer at a time, so
// without this there is no way to see the group as one thing. Off by default; the choice is per user.
import { MODULE_ID } from './constants.js';
import { getBlacksmith } from './blacksmith.js';
import { MEMBER_TYPES, memberExtent, memberOutlines, groupBounds, rotate } from './geometry.js';
import { getGroups, groupsTouched } from './store.js';
import { anchorState } from './anchor.js';

const STORAGE_KEY = `${MODULE_ID}.showBounds`;
export const BOUNDS_BAR_ITEM = 'bounds';
const COLOUR = 0xff9a1f;
const MEMBER_COLOUR = 0x39d2ff;

let enabled = readPreference();
let graphics = null;
let labels = [];
let frame = null;

function readPreference() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

export const boundsShown = () => enabled;

export function setBoundsShown(value) {
    enabled = !!value;
    // The button on the Puppeteer bar shows whether the overlay is on, however it was switched.
    try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0'); } catch { /* a remembered choice is a convenience */ }
    getBlacksmith().updateSecondaryBarItemActive(MODULE_ID, BOUNDS_BAR_ITEM, enabled);
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

    hook('canvasReady', () => { graphics = null; labels = []; schedule(); });
    hook('canvasTearDown', () => { graphics = null; labels = []; });
    hook('updateScene', (scene, changes) => {
        if (scene.id !== canvas.scene?.id) return;
        if (groupsTouched(changes)) schedule();
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
    for (const label of labels) label.destroy();
    labels = [];
    if (!enabled) return;

    for (const group of Object.values(getGroups(scene))) {
        const anchor = anchorState(scene, group) ?? { ...group.applied };

        const points = [];
        const outlines = [];
        for (const member of group.members) {
            const doc = scene.getEmbeddedCollection(member.type).get(member.id);
            if (!doc) continue;
            points.push(...memberExtent(member.type, doc._source));
            outlines.push(...memberOutlines(member.type, doc._source));
        }
        if (!points.length) continue;

        const bounds = groupBounds(points, anchor);
        g.lineStyle(3, COLOUR, 0.9);
        g.beginFill(COLOUR, 0.06);
        g.drawPolygon(bounds.corners.flatMap((c) => [c.x, c.y]));
        g.endFill();

        // The side the Width field in the editor measures: the group's own side to side, drawn heavier and named.
        const [left, right] = bounds.corners;
        g.lineStyle(7, COLOUR, 1);
        g.moveTo(left.x, left.y);
        g.lineTo(right.x, right.y);
        const middle = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
        const out = Math.hypot(middle.x - bounds.centre.x, middle.y - bounds.centre.y) || 1;
        // The text and its style are two arguments, as Foundry's PIXI takes them; one object would be drawn as "[object Object]".
        const label = new PIXI.Text('Width', { fontSize: 22, fontWeight: 'bold', fill: 0xffffff, stroke: 0x000000, strokeThickness: 5 });
        label.anchor.set(0.5);
        label.eventMode = 'none';
        label.position.set(middle.x + (((middle.x - bounds.centre.x) / out) * 24), middle.y + (((middle.y - bounds.centre.y) / out) * 24));
        layer.addChild(label);
        labels.push(label);

        // Each member where the group believes it is, so a member drawn away from its object is plain to see.
        g.lineStyle(2, MEMBER_COLOUR, 0.9);
        for (const extent of outlines) {
            if (extent.length === 1) {
                g.drawCircle(extent[0].x, extent[0].y, 9);
            } else if (extent.length === 2) {
                g.moveTo(extent[0].x, extent[0].y);
                g.lineTo(extent[1].x, extent[1].y);
            } else {
                g.drawPolygon(extent.flatMap((c) => [c.x, c.y]));
            }
        }

        // The pivot, and a tick showing which way the group's front points: its heading (zero faces down the screen) turned
        // by where the front of its picture is measured from that.
        const arm = 20;
        g.lineStyle(2, COLOUR, 1);
        g.moveTo(anchor.x - arm, anchor.y);
        g.lineTo(anchor.x + arm, anchor.y);
        g.moveTo(anchor.x, anchor.y - arm);
        g.lineTo(anchor.x, anchor.y + arm);
        g.drawCircle(anchor.x, anchor.y, 7);
        const tip = rotate(0, 70, anchor.heading + (Number(group.front) || 0));
        g.lineStyle(4, COLOUR, 1);
        g.moveTo(anchor.x, anchor.y);
        g.lineTo(anchor.x + tip.x, anchor.y + tip.y);
    }
}

/** Redraw now. For the first draw after the canvas is ready, and when the preference changes. */
export const redrawBounds = () => schedule();
