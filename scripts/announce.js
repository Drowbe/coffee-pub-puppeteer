// What Puppeteer says and plays: a short sound for the GM's own actions, and, for groups that ask for it, a chat card
// when a token boards or leaves. Everything goes through Blacksmith.
import { MODULE_ID } from './constants.js';
import { getBlacksmith } from './blacksmith.js';

const esc = (value) => foundry.utils.escapeHTML(String(value ?? ''));

/**
 * Play one of Blacksmith's sounds, softly. Local by default: it is the acting GM's own confirmation. `broadcast`
 * plays it on every client.
 */
export function playCue(name = 'SOUNDBUTTON01', { broadcast = false } = {}) {
    const constants = globalThis.BlacksmithConstants;
    getBlacksmith().utils.playSound(constants[name], constants.SOUNDVOLUMESOFT, false, broadcast);
}

/**
 * A public chat card: a token boarded a group, or left it. Only groups with `announce` set say anything.
 * @param {object} group
 * @param {TokenDocument} token
 * @param {'boarded'|'left'} kind
 */
export async function announceBoarding(group, token, kind) {
    if (!group.announce) return;
    const name = esc(token.name ?? 'A token');
    const ship = esc(group.name);
    const boarded = kind === 'boarded';
    await getBlacksmith().chatCards.post({
        moduleId: MODULE_ID,
        type: boarded ? 'boarded' : 'disembarked',
        parts: [
            { part: 'header', icon: boarded ? 'fa-solid fa-person-walking-luggage' : 'fa-solid fa-person-walking', title: boarded ? 'Boarded' : 'Disembarked' },
            { part: 'prose', blocks: [{ type: 'paragraph', text: boarded ? `**${name}** boards **${ship}**.` : `**${name}** leaves **${ship}**.` }] }
        ]
    });
    playCue('SOUNDBUTTON02', { broadcast: true });
}
