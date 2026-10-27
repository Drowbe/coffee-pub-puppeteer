// Placing a group on the map: the group follows the pointer with its pin under the crosshair, and a click puts the pin
// there. Right-click or Escape gives up. The group is shown as it will stand, at its true size, drawn on Blacksmith's
// utilities layer where nothing it draws can be picked up or changed.
import { getBlacksmith } from './blacksmith.js';
import { stampMembers } from './template.js';
import { memberOutlines } from './geometry.js';
import { createGroup } from './groups.js';

const COLOUR = 0xff9a1f;
const VIDEO = /\.(mp4|webm|m4v|ogv|mov)(\?.*)?$/i;

// The placement in progress, if there is one: calling it gives it up.
let cancelCurrent = null;

/** Draw one outline the way the bounds overlay does: a ring for a point, a line for two, a shape for more. */
function outline(g, extent) {
    g.lineStyle(2, COLOUR, 0.9);
    if (extent.length === 1) g.drawCircle(extent[0].x, extent[0].y, 9);
    else if (extent.length === 2) { g.moveTo(extent[0].x, extent[0].y); g.lineTo(extent[1].x, extent[1].y); }
    else g.drawPolygon(extent.flatMap((c) => [c.x, c.y]));
}

/**
 * Fill `ghost` with a template as it would stand with its pin at the origin: a tile as its own picture, anything else (or
 * a tile that cannot be drawn, such as a video) as an outline, and the pin as a small cross.
 */
async function drawGhost(ghost, template) {
    const lines = new PIXI.Graphics();
    ghost.addChild(lines);
    for (const { type, data } of stampMembers(template, { x: 0, y: 0, heading: 0 })) {
        let drawn = false;
        const src = data.texture?.src;
        if (type === 'Tile' && src && !VIDEO.test(src)) {
            try {
                const texture = await foundry.canvas.loadTexture(src);
                if (ghost.destroyed) return;
                const sprite = new PIXI.Sprite(texture);
                sprite.anchor.set(data.texture.anchorX ?? 0.5, data.texture.anchorY ?? 0.5);
                sprite.position.set(data.x, data.y);
                sprite.angle = data.rotation ?? 0;
                sprite.width = data.width;
                sprite.height = data.height;
                ghost.addChildAt(sprite, 0);
                drawn = true;
            } catch { /* a picture that will not load is drawn as an outline instead */ }
        }
        if (!drawn && !ghost.destroyed) for (const extent of memberOutlines(type, data)) outline(lines, extent);
    }
    if (ghost.destroyed) return;
    lines.lineStyle(2, COLOUR, 1);
    lines.moveTo(-20, 0);
    lines.lineTo(20, 0);
    lines.moveTo(0, -20);
    lines.lineTo(0, 20);
    lines.drawCircle(0, 0, 7);
}

/**
 * Let the GM choose where a template goes. The group follows the pointer, pin first; a left click chooses the place,
 * right-click or Escape gives up. Starting another placement gives up the one in progress.
 * @param {object} template  A template (see template.js).
 * @returns {Promise<{x: number, y: number}|null>} The scene point, or null if it was given up.
 */
export function pickPlacement(template) {
    cancelCurrent?.();
    return new Promise((resolve) => {
        const layer = canvas['blacksmith-utilities-layer'] ?? canvas.interface;
        const ghost = new PIXI.Container();
        ghost.alpha = 0.7;
        ghost.eventMode = 'none';
        ghost.visible = false;
        layer.addChild(ghost);
        drawGhost(ghost, template).catch((error) => console.error('Puppeteer: drawing the group to place failed', error));

        const board = document.getElementById('board') ?? canvas.app?.view;
        const stageCursor = canvas.stage.cursor;
        const boardCursor = board?.style?.cursor;
        canvas.stage.cursor = 'crosshair';
        if (board) board.style.cursor = 'crosshair';

        const follow = (point) => {
            ghost.position.set(point.x, point.y);
            ghost.visible = true;
        };
        const start = canvas.mousePosition;
        if (start && Number.isFinite(start.x)) follow(start);

        const finish = (point) => {
            canvas.stage.off('pointermove', onMove);
            canvas.stage.off('pointerdown', onDown);
            document.removeEventListener('keydown', onKey);
            canvas.stage.cursor = stageCursor || 'default';
            if (board) board.style.cursor = boardCursor ?? '';
            if (!ghost.destroyed) ghost.destroy({ children: true });
            if (cancelCurrent === cancel) cancelCurrent = null;
            resolve(point);
        };
        const cancel = () => finish(null);
        const onMove = (event) => follow(layer.toLocal(event.global));
        const onDown = (event) => {
            if (event.button === 2 || event.data?.originalEvent?.button === 2) { cancel(); return; }
            if (event.button > 0) return;
            const at = layer.toLocal(event.global);
            finish({ x: at.x, y: at.y });
        };
        const onKey = (event) => { if (event.key === 'Escape') cancel(); };

        canvas.stage.on('pointermove', onMove);
        canvas.stage.on('pointerdown', onDown);
        document.addEventListener('keydown', onKey);
        cancelCurrent = cancel;
        getBlacksmith().utils.postConsoleAndNotification('Puppeteer', 'Placing a group: click the map', null, true, false);
    });
}

/**
 * A new, empty group, placed by click: its pin follows the pointer, and a click puts the group there.
 * @returns {Promise<object|null>} The group, or null if the placement was given up.
 */
export async function placeNewGroup() {
    const { toast } = getBlacksmith();
    toast.show({ title: 'Place the group', subtitle: 'Click the map where the pin goes. Right-click or Escape cancels.', icon: 'fa-solid fa-up-down-left-right', channel: 'puppeteer', duration: 4 });
    const point = await pickPlacement({ version: 2, name: 'Group', members: [] });
    if (!point) return null;
    return createGroup(canvas.scene, point, { name: 'Group' });
}
