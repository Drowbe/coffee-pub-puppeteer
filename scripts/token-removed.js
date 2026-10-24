// What to do with a group when the token it follows is deleted. The GM who deleted the token is asked, because
// the parts (tiles, lights, walls, regions) are real objects on the map and deleting them is not something to
// guess at. Only that GM's client asks, so one deletion never opens the same question on every screen.
import { MODULE_ID, MODULE_NAME } from './constants.js';
import { getBlacksmith } from './blacksmith.js';
import { getGroup } from './store.js';
import { deleteGroup, detachToPin } from './groups.js';

const esc = (value) => foundry.utils.escapeHTML(String(value ?? ''));

export function registerTokenRemoval() {
    const { HookManager } = getBlacksmith();
    HookManager.registerHook({
        name: 'deleteToken',
        description: 'Puppeteer: ask what to do with the group of a token that was deleted',
        context: MODULE_ID,
        priority: 3,
        key: `${MODULE_ID}-token-removed`,
        callback: (token, options, userId) => {
            if (userId !== game.user?.id || !game.user.isGM) return;
            const groupId = token.getFlag(MODULE_ID, 'groupId');
            const scene = token.parent;
            const group = groupId && scene ? getGroup(scene, groupId) : null;
            if (!group || group.anchor.type !== 'token' || group.anchor.id !== token.id) return;
            askWhatToDo(scene, group, token).catch((error) => {
                console.error(`${MODULE_ID}: handling the deleted token of group ${groupId} failed`, error);
                getBlacksmith().utils.postConsoleAndNotification(MODULE_NAME, `Could not update the group of a deleted token: ${error.message}`, null, false, true);
            });
        }
    });
}

async function askWhatToDo(scene, group, token) {
    const { dialog, toast } = getBlacksmith();
    const parts = group.members.length;
    const { action, value } = await dialog.wait({
        title: 'Token Deleted',
        content: `<p>You deleted <strong>${esc(token.name ?? 'a token')}</strong>, which the group <strong>${esc(group.name)}</strong> followed. It holds ${parts} part${parts === 1 ? '' : 's'} (tiles, lights, walls, sounds, regions).</p><p>What should happen to the group?</p>`,
        buttons: [
            { action: 'pin', label: 'Keep the parts, on a pin', icon: 'fa-solid fa-thumbtack', default: true },
            { action: 'record', label: 'Delete only the group', icon: 'fa-solid fa-link-slash' },
            { action: 'parts', label: `Delete the group and its ${parts} part${parts === 1 ? '' : 's'}`, icon: 'fa-solid fa-trash', destructive: true }
        ],
        closeValue: null
    });
    // Closing the dialog leaves the group as it is: the editor flags it as having lost its token.
    if (action !== dialog.ACTIONS.SUBMIT) return;

    if (value === 'pin') {
        await detachToPin(scene, group.id);
        toast.show({ title: 'Group kept', subtitle: `${group.name} now hangs from a pin where the token last was.`, icon: 'fa-solid fa-up-down-left-right', duration: 5 });
    } else if (value === 'record') {
        await deleteGroup(scene, group.id);
        toast.show({ title: 'Group deleted', subtitle: 'Its parts are still on the map.', icon: 'fa-solid fa-up-down-left-right', duration: 5 });
    } else if (value === 'parts') {
        const { removed } = await deleteGroup(scene, group.id, { removeMembers: true });
        toast.show({ title: 'Group and parts deleted', subtitle: `${removed} part${removed === 1 ? '' : 's'} removed from the map.`, icon: 'fa-solid fa-up-down-left-right', duration: 5 });
    }
}
