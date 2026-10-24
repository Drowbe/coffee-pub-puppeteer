// The tween: the tiles, drawings and notes of a moving group are drawn moving, not jumping.
//
// A group's documents are written once, when its anchor has moved, so without this they jump. Three things
// can move a group, and each gets the same treatment: draw the members where the group's records put them for
// a given pose of the anchor, frame by frame. Only what is drawn changes; the documents are never touched.
//
//   a token's glide   Foundry steps the token document's own x, y and rotation every frame (the committed
//                     values stay in `_source`) and announces each frame through `refreshToken`. The members
//                     are drawn for the token's DISPLAYED pose. Every client does it from its own copy of the
//                     animation, so nothing is sent between clients and no duration is guessed.
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
import { tokenAnchorState, anchorState } from './anchor.js';

const TWEENED = ['Tile', 'Drawing', 'Note'];

// How long a pose is held against a redraw of the member by Foundry. The follower's write for a member lands a
// moment after the move starts, and Foundry redraws the member at its final spot when it does; the next frame
// would put it back, so for one frame it would flash at the destination. Holding the pose in the member's own
// refresh closes that gap.
const HOLD_MS = 250;

// A pin glide is quick: it is there to take the edge off a jump, not to be watched.
const GLIDE_MS = 350;

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
    }
};

export function registerTween() {
    const { HookManager, pins } = getBlacksmith();
    HookManager.registerHook({
        name: 'refreshToken',
        description: 'Puppeteer: draw a token group\'s tiles, drawings and notes along with the token as it glides',
        context: MODULE_ID,
        priority: 3,
        key: `${MODULE_ID}-tween-token`,
        callback: (token) => followToken(token)
    });
    for (const type of TWEENED) {
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

// ---- a token's glide ----------------------------------------------------------------------------------

/** One frame of a token's glide: draw its group for the token's displayed pose. */
function followToken(token) {
    // Only while it is actually animating; at rest the documents are already right.
    if (!token.animationContexts?.size) return;
    const doc = token.document;
    const groupId = doc.getFlag(MODULE_ID, 'groupId');
    if (!groupId) return;
    const scene = doc.parent;
    const group = scene && getGroup(scene, groupId);
    // The record must name this token, so a copied token does not move the original's parts.
    if (!group || group.anchor.type !== 'token' || group.anchor.id !== doc.id) return;

    // doc.x, doc.y and doc.rotation are the animated values here; _source holds where the token is going.
    showGroup(scene, group, tokenAnchorState(scene, { x: doc.x, y: doc.y, width: doc.width, height: doc.height, rotation: doc.rotation }));
}

// ---- a pin being dragged ------------------------------------------------------------------------------

function dragGroup(event) {
    const scene = canvas.scene;
    const groupId = event?.pin?.config?.puppeteer?.groupId;
    const group = scene && groupId ? getGroup(scene, groupId) : null;
    if (!group || group.anchor.type !== 'pin' || group.anchor.id !== event.pinId) return;
    live.set(`${scene.id}:${group.id}`, performance.now());
    showGroup(scene, group, { x: event.pin.x, y: event.pin.y, heading: event.pin.rotation ?? 0 });
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
    // From where it is drawn if it is already moving, so a second move does not snap back first.
    glides.set(key, { scene, groupId: group.id, from: running?.shown ?? glide.from, shown: null, start: performance.now() });
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
        const t = Math.min(1, (now - glide.start) / GLIDE_MS);
        glide.shown = lerpAnchor(glide.from, to, easeOut(t));
        showGroup(glide.scene, group, glide.shown);
        if (t >= 1) glides.delete(key);
    }
    if (!glides.size) stopTicking();
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
    return group.anchor.type === 'pin' ? { groupId: group.id, from: { ...group.applied } } : undefined;
}
