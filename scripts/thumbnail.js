// A thumbnail of a group, taken when it is saved to the library. It is drawn from the group's own parts, not captured from
// the screen: the tiles' own pictures, turned and placed as they are on the scene, with the walls, lights, sounds, regions
// and drawings as simple marks. That shows the group alone, with no map, tokens or darkness under it, and it needs no
// particular view of the canvas.
//
// The plan (what goes where) is pure and is tested under Node; only `renderThumbnail` touches a canvas.
import { memberExtent, memberOutlines } from './geometry.js';

export const THUMBNAIL_SIZE = 128;
const PADDING = 6;

/**
 * Work out what a thumbnail of a group shows, in scene coordinates, and how to fit it into a square.
 * @param {Scene} scene
 * @param {object} group   A group record.
 * @param {number} [size]  The side of the square thumbnail, in pixels.
 * @returns {null|{size: number, scale: number, offset: {x: number, y: number}, items: object[]}}  null when the group has nothing to draw.
 */
export function thumbnailPlan(scene, group, size = THUMBNAIL_SIZE) {
    const items = [];
    const points = [];
    for (const member of group.members) {
        const doc = scene.getEmbeddedCollection(member.type).get(member.id);
        if (!doc) continue;
        const data = doc._source;
        const extent = memberExtent(member.type, data);
        points.push(...extent);

        if (member.type === 'Tile') {
            items.push({
                kind: 'tile',
                src: data.texture?.src ?? '',
                x: data.x,
                y: data.y,
                width: data.width,
                height: data.height,
                rotation: data.rotation ?? 0,
                anchorX: data.texture?.anchorX ?? 0.5,
                anchorY: data.texture?.anchorY ?? 0.5,
                scaleX: data.texture?.scaleX ?? 1,
                scaleY: data.texture?.scaleY ?? 1,
                alpha: data.alpha ?? 1,
                outline: extent
            });
        } else if (member.type === 'Wall') {
            items.push({ kind: 'wall', points: extent });
        } else if (member.type === 'Drawing' || member.type === 'Region') {
            for (const outline of memberOutlines(member.type, data)) items.push({ kind: 'outline', points: outline });
        } else {
            items.push({ kind: member.type === 'AmbientSound' ? 'sound' : 'point', x: data.x, y: data.y });
        }
    }
    if (!points.length) return null;

    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const width = Math.max(...xs) - minX;
    const height = Math.max(...ys) - minY;
    const scale = (size - (2 * PADDING)) / Math.max(width, height, 1);
    // Centred in the square, so a long group is not cropped by a picture that fills its box.
    const offset = {
        x: ((size - (width * scale)) / 2) - (minX * scale),
        y: ((size - (height * scale)) / 2) - (minY * scale)
    };
    return { size, scale, offset, items };
}

function loadImage(src) {
    return new Promise((resolve) => {
        if (!src || /\.(webm|mp4|m4v|ogv)$/i.test(src)) { resolve(null); return; }
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = foundry.utils.getRoute(src);
    });
}

function trace(ctx, points, close) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    if (close) ctx.closePath();
}

/**
 * Draw a plan to a canvas and return it as a small image. Browser only.
 * @returns {Promise<string>} A data URI, webp.
 */
export async function renderThumbnail(plan) {
    const canvas = document.createElement('canvas');
    canvas.width = plan.size;
    canvas.height = plan.size;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(plan.scale, 0, 0, plan.scale, plan.offset.x, plan.offset.y);
    const line = 1.5 / plan.scale;
    const dot = 4 / plan.scale;

    // Pictures first, so marks sit on top of them.
    const tiles = plan.items.filter((item) => item.kind === 'tile');
    const images = await Promise.all(tiles.map((tile) => loadImage(tile.src)));
    tiles.forEach((tile, index) => {
        const image = images[index];
        ctx.save();
        ctx.translate(tile.x, tile.y);
        ctx.rotate((tile.rotation * Math.PI) / 180);
        ctx.scale(tile.scaleX, tile.scaleY);
        ctx.globalAlpha = tile.alpha;
        if (image) {
            ctx.drawImage(image, -tile.anchorX * tile.width, -tile.anchorY * tile.height, tile.width, tile.height);
        } else {
            // A picture that cannot be drawn (a video, a missing file) is a plain box.
            ctx.fillStyle = 'rgba(140, 125, 95, 0.55)';
            ctx.fillRect(-tile.anchorX * tile.width, -tile.anchorY * tile.height, tile.width, tile.height);
        }
        ctx.restore();
    });

    ctx.lineWidth = line;
    ctx.lineJoin = 'round';
    for (const item of plan.items) {
        if (item.kind === 'outline') {
            ctx.strokeStyle = 'rgba(70, 110, 160, 0.9)';
            trace(ctx, item.points, true);
            ctx.stroke();
        } else if (item.kind === 'wall') {
            ctx.strokeStyle = 'rgba(95, 40, 30, 0.95)';
            ctx.lineWidth = line * 1.6;
            trace(ctx, item.points, false);
            ctx.stroke();
            ctx.lineWidth = line;
        } else if (item.kind === 'point' || item.kind === 'sound') {
            ctx.fillStyle = item.kind === 'sound' ? 'rgba(60, 130, 90, 0.95)' : 'rgba(225, 175, 40, 0.95)';
            ctx.beginPath();
            ctx.arc(item.x, item.y, dot, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    return canvas.toDataURL('image/webp', 0.8);
}

/**
 * A thumbnail for a group on a scene, or null when there is nothing to draw or no canvas to draw on. It never throws: a
 * library entry is saved without a picture rather than not at all.
 * @returns {Promise<string|null>}
 */
export async function makeThumbnail(scene, group) {
    try {
        if (typeof document === 'undefined') return null;
        const plan = thumbnailPlan(scene, group);
        return plan ? await renderThumbnail(plan) : null;
    } catch (error) {
        console.warn('coffee-pub-puppeteer: could not draw a thumbnail', error);
        return null;
    }
}
