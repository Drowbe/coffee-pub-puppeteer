// The tween: the tiles, drawings and notes of a moving group are drawn moving, not jumping.
//
// A group's documents are written once, when its pin has moved, so without this they jump. Two things
// move a group, and each gets the same treatment: draw the members where the group's records put them for
// a given pose of the pin, frame by frame. Only what is drawn changes; the documents are never touched.
//
//   a pin being dragged  Blacksmith reports the pin's live position on every move (`dragMove`, on the client
//                     that is dragging). The members follow the pointer.
//   a pin that moved or turned   (a drop, a Shift + wheel turn, the editor's rotate buttons.) The follower says,
//                     in the options of its writes, where the group was. Each client eases from there to
//                     where the pin is now, over a third of a second. The anchor is eased and the members are
//                     recomputed from it each frame, so a turn swings them along arcs, not chords.
//
// Only plain display objects can be drawn this way. Lights, walls, sounds and regions take part in Foundry's
// perception and cannot be animated by moving a sprite, so they still update when the documents are written.
import { MODULE_ID } from './constants.js';
import { getBlacksmith } from './blacksmith.js';
import { memberUpdate } from './geometry.js';
import { getGroup } from './store.js';
import { anchorState, headingOf } from './anchor.js';
import { riderUpdate } from './riders.js';

const TWEENED = ['Tile', 'Drawing', 'Note'];

// How long a pose is held against a redraw of the member by Foundry. The follower's write for a member lands a
// moment after the move starts, and Foundry redraws the member at its final spot when it does; the next frame
// would put it back, so for one frame it would flash at the destination. Holding the pose in the member's own
// refresh closes that gap.
const HOLD_MS = 250;

// How a group moves on screen between where it was and where its pin is now. Three ways:
//   ease    a short glide of a set time, to take the edge off a jump (350 ms unless the group says otherwise)
//   travel  at a steady speed, as a token moves: the time follows the distance, and a long move is a long glide
//   jump    no movement between the two places; it also stops the members following a drag
export const DEFAULT_EASE_MS = 350;
export const EASE_LIMITS = Object.freeze({ min: 100, max: 3000 });
// A token's own animation moves 6 squares a second by default, so a group travels at the same pace.
export const DEFAULT_TRAVEL_SPEED = 6;
export const TRAVEL_SPEED_LIMITS = Object.freeze({ min: 0.5, max: 60 });
// A travel is never shorter than this, so a nudge still reads as movement, nor longer than this, so a move across the
// map does not hold the screen for half a minute.
const TRAVEL_MS_LIMITS = Object.freeze({ min: 150, max: 20000 });
// A turn is as quick as a token's: a half turn takes about a second.
const TURN_DEGREES_PER_SECOND = 180;

const MODES = ['ease', 'travel', 'jump'];

/** How a group moves: `{ mode: 'ease' | 'travel' | 'jump', ms, speed }`. */
export function easeOf(group) {
    const ms = Number(group?.ease?.ms);
    const speed = Number(group?.ease?.speed);
    return {
        mode: MODES.includes(group?.ease?.mode) ? group.ease.mode : 'ease',
        ms: Number.isFinite(ms) ? Math.min(EASE_LIMITS.max, Math.max(EASE_LIMITS.min, ms)) : DEFAULT_EASE_MS,
        speed: Number.isFinite(speed) ? Math.min(TRAVEL_SPEED_LIMITS.max, Math.max(TRAVEL_SPEED_LIMITS.min, speed)) : DEFAULT_TRAVEL_SPEED
    };
}

/**
 * How long a travel takes, in milliseconds: the distance at `speed` squares a second, or the turn at a token's pace,
 * whichever is longer, kept within sensible limits.
 * @param {{x: number, y: number, heading: number}} from
 * @param {{x: number, y: number, heading: number}} to
 * @param {number} speed  Squares a second.
 * @param {number} grid   The size of a square, in scene pixels.
 */
export function travelMs(from, to, speed, grid) {
    const squares = Math.hypot(to.x - from.x, to.y - from.y) / grid;
    const turn = Math.abs((((to.heading - from.heading) % 360) + 540) % 360 - 180);
    const seconds = Math.max(squares / speed, turn / TURN_DEGREES_PER_SECOND);
    return Math.min(TRAVEL_MS_LIMITS.max, Math.max(TRAVEL_MS_LIMITS.min, seconds * 1000));
}

// A drop is saved and followed a moment after the last drag move; a glide that began within this long of a live
// drag would only drag the members back to where they started.
const LIVE_MS = 1500;

// The pose each tweened member was last drawn at, by `scene:type:id`.
const poses = new Map();
const keyOf = (sceneId, type, id) => `${sceneId}:${type}:${id}`;

// When a group was last drawn by hand during a pin drag, by `scene:group`.
const live = new Map();

// Pin glides in progress, by `scene:group`.
const glides = new Map();
let ticking = false;

// How each type puts a pose on screen. These set the display objects Foundry's own refresh sets from the
// document, and they are overwritten by it on the next real refresh.
const DISPLAY = {
    Tile: (placeable, pose) => {
        const mesh = placeable.mesh ?? placeable.bg;
        if (!mesh) return;
        mesh.position.set(pose.x, pose.y);
        mesh.angle = pose.rotation;
    },
    Drawing: (placeable, pose, source) => {
        const { width = 0, height = 0 } = source.shape ?? {};
        placeable.shape.position.set(pose.x + (width / 2), pose.y + (height / 2));
        placeable.shape.angle = pose.rotation;
    },
    Note: (placeable, pose) => {
        placeable.position.set(pose.x, pose.y);
    },
    // A rider's token. Foundry sets the token's own position from its document, and its mesh to the middle of its
    // footprint; both are set here, and the mesh is turned as Foundry turns it.
    Token: (placeable, pose, source) => {
        const grid = placeable.document.parent.grid;
        placeable.position.set(pose.x, pose.y);
        placeable.mesh?.position.set(
            pose.x + (((source.width ?? 1) * (grid.sizeX ?? grid.size)) / 2),
            pose.y + (((source.height ?? 1) * (grid.sizeY ?? grid.size)) / 2)
        );
        if (placeable.mesh) placeable.mesh.angle = placeable.document.lockRotation ? 0 : pose.rotation;
    }
};

export function registerTween() {
    const { HookManager, pins } = getBlacksmith();
    for (const type of [...TWEENED, 'Token']) {
        HookManager.registerHook({
            name: `refresh${type}`,
            description: `Puppeteer: keep a moving ${type} where the tween drew it when Foundry redraws it`,
            context: MODULE_ID,
            priority: 3,
            key: `${MODULE_ID}-tween-hold-${type}`,
            callback: (placeable) => holdPose(type, placeable)
        });
        HookManager.registerHook({
            name: `update${type}`,
            description: `Puppeteer: ease a ${type} from where its group was when the follower moves it`,
            context: MODULE_ID,
            priority: 3,
            key: `${MODULE_ID}-tween-glide-${type}`,
            callback: (doc, changes, options) => beginGlide(doc, options)
        });
    }
    // The GM dragging a pin sees the group follow the pointer. Blacksmith reports a drag on the client that is
    // dragging it, with the pin as it is drawn at that moment.
    pins.on('dragMove', (event) => dragGroup(event), { dragEvents: true, moduleId: MODULE_ID });
}

// ---- drawing a group for a pose -----------------------------------------------------------------------

/** Draw a group's tweenable members for `anchor`, and hold those poses against Foundry redrawing them. */
function showGroup(scene, group, anchor) {
    const now = performance.now();
    for (const member of group.members) {
        if (!TWEENED.includes(member.type)) continue;
        const memberDoc = scene.getEmbeddedCollection(member.type).get(member.id);
        const placeable = memberDoc?.object;
        if (!placeable) continue;
        const pose = memberUpdate(member, memberDoc._source, anchor);
        poses.set(keyOf(scene.id, member.type, member.id), { pose, at: now });
        DISPLAY[member.type](placeable, pose, memberDoc._source);
    }
    // The tokens the group carries are drawn along with it.
    for (const rider of group.riders ?? []) {
        const token = scene.tokens.get(rider.tokenId);
        const placeable = token?.object;
        if (!placeable) continue;
        const { _id, ...pose } = riderUpdate(scene, rider, token._source, anchor);
        poses.set(keyOf(scene.id, 'Token', token.id), { pose, at: now });
        DISPLAY.Token(placeable, pose, token._source);
    }
}

/** Foundry redrew a member from its document; if it is mid-move, put its tweened pose back at once. */
function holdPose(type, placeable) {
    const doc = placeable.document;
    const key = keyOf(doc.parent?.id, type, doc.id);
    const held = poses.get(key);
    if (!held) return;
    if (performance.now() - held.at > HOLD_MS) {
        poses.delete(key);
        return;
    }
    DISPLAY[type](placeable, held.pose, doc._source);
}

// ---- a pin being dragged ------------------------------------------------------------------------------

function dragGroup(event) {
    const scene = canvas.scene;
    const groupId = event?.pin?.config?.puppeteer?.groupId;
    const group = scene && groupId ? getGroup(scene, groupId) : null;
    if (!group || group.anchor.type !== 'pin' || group.anchor.id !== event.pinId) return;
    // Move Pivot is on: the pin is being put somewhere else, and the group does not follow it.
    if (group.movePivot) return;
    if (easeOf(group).mode === 'jump') return;
    live.set(`${scene.id}:${group.id}`, performance.now());
    showGroup(scene, group, { x: event.pin.x, y: event.pin.y, heading: headingOf(group, event.pin.rotation) });
}

// ---- a pin that moved or turned -----------------------------------------------------------------------

const lerp = (a, b, t) => a + ((b - a) * t);
const easeOut = (t) => 1 - ((1 - t) ** 3);

// The way round to a heading is the short way.
const lerpHeading = (a, b, t) => a + ((((b - a) % 360) + 540) % 360 - 180) * t;

const lerpAnchor = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), heading: lerpHeading(a.heading, b.heading, t) });

/** The follower wrote a member and said where its group was: ease the group from there to where it is now. */
function beginGlide(doc, options) {
    const glide = options?.puppeteer?.glide;
    if (!glide?.from) return;
    const scene = doc.parent;
    if (!scene) return;
    const key = `${scene.id}:${glide.groupId}`;

    // The GM who just dragged the pin is already looking at the destination.
    if (performance.now() - (live.get(key) ?? -Infinity) < LIVE_MS) return;

    // Already gliding, as when several types of member arrive in turn: that glide is the one.
    const running = glides.get(key);
    if (running && performance.now() - running.start < 50) return;

    const group = getGroup(scene, glide.groupId);
    if (!group) return;
    const ease = easeOf(group);
    if (ease.mode === 'jump') return;
    // From where it is drawn if it is already moving, so a second move does not snap back first.
    const from = running?.shown ?? glide.from;
    let ms = ease.ms;
    if (ease.mode === 'travel') {
        const to = anchorState(scene, group);
        if (to) ms = travelMs(from, to, ease.speed, scene.grid.sizeX ?? scene.grid.size);
    }
    glides.set(key, { scene, groupId: group.id, from, shown: null, start: performance.now(), ms, linear: ease.mode === 'travel' });
    if (!ticking) startTicking();
}

function ticker() {
    return canvas.app?.ticker;
}

function startTicking() {
    ticking = true;
    // After Foundry has drawn this frame, so what is drawn here is what stays on screen.
    ticker()?.add(tick, null, PIXI.UPDATE_PRIORITY.LOW);
}

function stopTicking() {
    ticking = false;
    ticker()?.remove(tick);
}

function tick() {
    const now = performance.now();
    for (const [key, glide] of glides) {
        const group = getGroup(glide.scene, glide.groupId);
        const to = group ? anchorState(glide.scene, group) : null;
        if (!group || !to) {
            glides.delete(key);
            continue;
        }
        const t = Math.min(1, (now - glide.start) / glide.ms);
        // A token moves at a steady pace, so a travel is linear; a glide eases out.
        glide.shown = lerpAnchor(glide.from, to, glide.linear ? t : easeOut(t));
        showGroup(glide.scene, group, glide.shown);
        if (t >= 1) glides.delete(key);
    }
    if (!glides.size) stopTicking();
}

/**
 * Whether a group is on the move on this client, and how fast. A group moves while it is easing or travelling from one
 * place to another; its speed is the distance it covers over the time the move takes, in squares a second. A group that
 * jumps, or is not between two places, is not moving.
 * @returns {{moving: boolean, speed: number, progress: number}}
 */
export function motionOf(scene, group) {
    const glide = glides.get(`${scene.id}:${group.id}`);
    const to = glide ? anchorState(scene, group) : null;
    if (!glide || !to) return { moving: false, speed: 0, progress: 1 };
    const squares = Math.hypot(to.x - glide.from.x, to.y - glide.from.y) / (scene.grid.sizeX ?? scene.grid.size);
    const progress = Math.min(1, (performance.now() - glide.start) / glide.ms);
    return { moving: progress < 1, speed: progress < 1 ? squares / (glide.ms / 1000) : 0, progress };
}

/** Forget everything in flight. For tests, which share one module between many scenes. */
export function resetTween() {
    poses.clear();
    live.clear();
    glides.clear();
    ticking = false;
}

/** Used when the follower writes a pin group: where the group was, for the clients to ease from. */
export function glideOptions(group) {
    return group.anchor.type === 'pin' && easeOf(group).mode !== 'jump' ? { groupId: group.id, from: { ...group.applied } } : undefined;
}
