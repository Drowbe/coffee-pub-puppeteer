// Group events: a group can do something when something happens to it. Each rule on a group says "when this happens, do
// that": a trigger (a token boards or leaves, the group moves, is hidden or is shown, or its token reaches a health level)
// and an action (play a sound for everyone, run a macro, show a different picture on one of its tiles, or start or stop
// its animations). Rules are stored on the group record as `events`. A group's Play and Pause buttons run the rules for
// "Play is clicked" and "Pause is clicked", and are shown only when it has some.
//
// Rules run on the GM client that did the work, because that is the one that knows it happened. A rule that fails is
// reported and skipped; it never stops a group moving.
import { MODULE_ID, MODULE_NAME } from './constants.js';
import { getBlacksmith } from './blacksmith.js';
import { setAnimations } from './animations.js';

/** What can happen to a group, with the words the editor uses. */
export const TRIGGERS = Object.freeze({
    board: 'A token boards',
    leave: 'A token leaves',
    move: 'The group moves',
    hide: 'The group is hidden',
    show: 'The group is shown',
    health: 'Its token\'s health becomes',
    play: 'Play is clicked',
    pause: 'Pause is clicked'
});

/** The health levels a rule can wait for. They are Blacksmith's, less its "hurt", which counts as healthy (see health.js). */
export const HEALTH_LEVELS = Object.freeze({
    healthy: 'Healthy',
    injured: 'Injured',
    bloodied: 'Bloodied',
    critical: 'Critical',
    dead: 'Dead'
});

/** What a rule can do. */
export const ACTIONS = Object.freeze({
    sound: 'Play a sound',
    macro: 'Run a macro',
    image: 'Show a picture on a tile',
    start: 'Start the animations',
    stop: 'Stop the animations'
});

// The actions that need nothing more than the group.
const PLAIN = ['start', 'stop'];

export const MAX_EVENTS = 20;

/**
 * Check a rule and return it as it is stored. Throws with a reason a GM can act on.
 * @param {{on: string, do: string, value: string, at?: string, target?: string}} rule
 *   `at` is the health level a `health` rule waits for; `target` is the id of the tile an `image` rule changes.
 * @param {object} [group]  The group the rule is for, to check that its tile is one of its parts.
 */
export function normaliseEvent(rule, group = null) {
    if (!rule || !(rule.on in TRIGGERS)) throw new Error(`${MODULE_ID}: an event happens when ${Object.keys(TRIGGERS).join(', ')}, not "${rule?.on}"`);
    if (!(rule.do in ACTIONS)) throw new Error(`${MODULE_ID}: an event can ${Object.keys(ACTIONS).join(', ')}, not "${rule.do}"`);
    const value = PLAIN.includes(rule.do) ? '' : String(rule.value ?? '').trim();
    if (!value && !PLAIN.includes(rule.do)) throw new Error(`${MODULE_ID}: choose ${{ sound: 'a sound', macro: 'a macro', image: 'a picture' }[rule.do]} for the event`);
    const stored = { id: rule.id ?? foundry.utils.randomID(), on: rule.on, do: rule.do, value };
    if (rule.on === 'health') {
        if (!(rule.at in HEALTH_LEVELS)) throw new Error(`${MODULE_ID}: choose a health level: ${Object.keys(HEALTH_LEVELS).join(', ')}`);
        stored.at = rule.at;
    }
    if (rule.do === 'image') {
        if (group && !group.members.some((member) => member.type === 'Tile' && member.id === rule.target)) {
            throw new Error(`${MODULE_ID}: choose one of the group's tiles to change`);
        }
        if (!rule.target) throw new Error(`${MODULE_ID}: choose one of the group's tiles to change`);
        stored.target = String(rule.target);
    }
    return stored;
}

/** What a rule says in a few words, for the editor. */
export function describeEvent(rule, group = null) {
    const file = String(rule.value).split('/').pop();
    let what;
    if (PLAIN.includes(rule.do)) what = ACTIONS[rule.do];
    else if (rule.do === 'macro') what = `Run ${game.macros?.get?.(rule.value)?.name ?? 'a macro that is missing'}`;
    else if (rule.do === 'image') {
        const member = group?.members.find((m) => m.type === 'Tile' && m.id === rule.target);
        what = `Show ${file} on ${member?.label || `tile ${String(rule.target).slice(0, 6)}`}`;
    } else what = `Play ${file}`;
    const when = rule.on === 'health' ? `${TRIGGERS.health} ${(HEALTH_LEVELS[rule.at] ?? rule.at).toLowerCase()}` : (TRIGGERS[rule.on] ?? rule.on);
    return { when, what };
}

/**
 * Run the rules of a group for something that happened to it. Never throws.
 * @param {object} group   The group record.
 * @param {'board'|'leave'|'move'|'hide'|'show'|'health'|'play'|'pause'} trigger
 * @param {object} [context]  Handed to a macro as `scope.event`, with the group and scene.
 */
export async function fireEvent(scene, group, trigger, context = {}) {
    const rules = (group?.events ?? []).filter((rule) => rule.on === trigger && (trigger !== 'health' || rule.at === context.level));
    if (!rules.length) return;
    const { utils } = getBlacksmith();
    for (const rule of rules) {
        try {
            if (rule.do === 'start' || rule.do === 'stop') {
                await setAnimations(scene, group, rule.do === 'start');
            } else if (rule.do === 'sound') {
                // To everyone, as the thing it goes with is seen by everyone.
                utils.playSound(rule.value, globalThis.BlacksmithConstants?.SOUNDVOLUMENORMAL ?? '0.7', false, true);
            } else if (rule.do === 'image') {
                const tile = scene.getEmbeddedCollection('Tile').get(rule.target);
                if (!tile) throw new Error('the tile is not on the scene');
                await scene.updateEmbeddedDocuments('Tile', [{ _id: tile.id, texture: { src: rule.value } }], { puppeteer: { follower: true } });
            } else if (rule.do === 'macro') {
                const macro = game.macros.get(rule.value) ?? await fromUuid(rule.value);
                if (!macro) throw new Error('the macro is not in this world');
                await macro.execute({ scene, group: { id: group.id, name: group.name }, event: { name: trigger, ...context } });
            }
        } catch (error) {
            console.error(`${MODULE_ID}: event "${trigger}" of group "${group.name}" failed`, error);
            utils.postConsoleAndNotification(MODULE_NAME, `An event of "${group.name}" failed: ${error.message}`, null, false, true);
        }
    }
}
