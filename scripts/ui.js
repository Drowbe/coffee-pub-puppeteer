// Where the GM reaches Puppeteer: toolbar tools, the pin right-click menu, and the registered Group Editor
// window. Everything registers through Blacksmith.
import { MODULE_ID, MODULE_NAME, TOAST_CHANNEL } from './constants.js';
import { getBlacksmith } from './blacksmith.js';
import { toggleBounds, boundsShown, BOUNDS_BAR_ITEM } from './overlay.js';
import { syncAllGroups } from './follower.js';
import { captureArea, recenterPivot, addSelected, removeSelected, selectMembers, rotateBy, createGroup, setGroupHidden, setEmittersOn, setPlaying, canPlayPause } from './groups.js';
import { getGroup } from './store.js';
import { duplicateGroup } from './library.js';
import { placeNewGroup } from './placement.js';

export const EDITOR_WINDOW = `${MODULE_ID}-group-editor`;
export const MENUBAR_TOOL = `${MODULE_ID}-menubar`;
export const MENUBAR_BAR = MODULE_ID;

const groupIdOf = (pin) => pin?.config?.puppeteer?.groupId ?? null;

export async function registerUi() {
    const blacksmith = getBlacksmith();

    // The window class is loaded when it is first opened, not at startup.
    blacksmith.registerWindow(EDITOR_WINDOW, {
        open: async () => {
            const { GroupEditorWindow } = await import('./group-editor.js');
            return GroupEditorWindow.open();
        },
        title: 'Puppeteer Groups',
        moduleId: MODULE_ID
    });

    registerToolbar(blacksmith);
    await registerMenubar(blacksmith);
    registerPinMenu(blacksmith);

    // Double-clicking a group's pin opens the Group Editor at that group. A single click belongs to Blacksmith's pins
    // tool (it selects the pin), so double-click is the only click a module is given.
    blacksmith.pins.on('doubleClick', async (event) => {
        if (!game.user.isGM) return;
        const groupId = groupIdOf(event.pin);
        if (!groupId) return;
        const { GroupEditorWindow } = await import('./group-editor.js');
        await GroupEditorWindow.focusGroup(groupId);
    }, { moduleId: MODULE_ID });
}

/**
 * One Puppeteer button in the middle of the menubar, with the other Coffee Pub tools. It opens a bar below the menubar
 * holding what is useful with no group chosen: the editor, a new group, the bounds overlay, and bringing groups up to
 * date. The bar is where those live, so the menubar itself carries a single button.
 */
async function registerMenubar(blacksmith) {
    await blacksmith.registerSecondaryBarType(MENUBAR_BAR, {
        size: 'default',
        persistence: 'manual',
        groups: {
            groups: { mode: 'default', order: 10 },
            view: { mode: 'default', order: 20 }
        }
    });

    const item = (id, data) => blacksmith.registerSecondaryBarItem(MENUBAR_BAR, id, { zone: 'middle', toggleable: false, ...data });
    item('editor', {
        icon: 'fa-solid fa-sliders',
        label: 'Group Editor',
        tooltip: 'Open the Group Editor',
        group: 'groups',
        order: 10,
        onClick: () => blacksmith.openWindow(EDITOR_WINDOW)
    });
    item('new-group', {
        icon: 'fa-solid fa-plus',
        label: 'New Group',
        tooltip: 'Make a new group: click the map where its pin goes',
        group: 'groups',
        order: 20,
        onClick: () => newGroupByClick(blacksmith)
    });
    item('update-all', {
        icon: 'fa-solid fa-rotate',
        label: 'Update All Groups',
        tooltip: 'Move every group\'s parts to where its pin is now',
        group: 'groups',
        order: 30,
        onClick: async () => {
            await syncAllGroups();
            blacksmith.toast.show({ title: 'Groups brought up to date', subtitle: 'Every group\'s parts now match its pin.', icon: 'fa-solid fa-rotate', channel: TOAST_CHANNEL, duration: 4 });
        }
    });
    item(BOUNDS_BAR_ITEM, {
        icon: 'fa-solid fa-border-none',
        label: 'Group Bounds',
        tooltip: 'Show or hide the box that holds each group, its pivot and its heading',
        group: 'view',
        order: 10,
        toggleable: true,
        active: boundsShown(),
        onClick: () => toggleBounds()
    });

    blacksmith.registerMenubarTool(MENUBAR_TOOL, {
        icon: 'fa-solid fa-up-down-left-right',
        name: MENUBAR_TOOL,
        title: 'Puppeteer',
        tooltip: 'Puppeteer: groups that move and turn as one',
        zone: 'middle',
        group: 'utility',
        order: 5,
        moduleId: MODULE_ID,
        gmOnly: true,
        toggleable: true,
        active: false,
        onClick: () => blacksmith.toggleSecondaryBar(MENUBAR_BAR)
    });
    // The button lights while the bar is open, and goes out when another bar replaces it.
    blacksmith.registerSecondaryBarTool(MENUBAR_BAR, MENUBAR_TOOL);
}

/** A new group, with its pin where the GM clicks. */
async function newGroupByClick(blacksmith) {
    try {
        const group = await placeNewGroup();
        if (!group) return;
        blacksmith.toast.show({
            title: 'Group created',
            subtitle: `${group.name} is where you clicked. Open the Group Editor to add parts.`,
            icon: 'fa-solid fa-up-down-left-right',
            channel: TOAST_CHANNEL,
            duration: 6
        });
    } catch (error) {
        console.error(`${MODULE_ID}: creating a group failed`, error);
        blacksmith.utils.postConsoleAndNotification(MODULE_NAME, `Creating a group failed: ${error.message}`, null, false, true);
    }
}

function registerToolbar(blacksmith) {
    blacksmith.registerToolbarTool(`${MODULE_ID}-editor`, {
        icon: 'fa-solid fa-up-down-left-right',
        name: `${MODULE_ID}-editor`,
        title: 'Puppeteer Groups',
        zone: 'general',
        order: 50,
        moduleId: MODULE_ID,
        gmOnly: true,
        onCoffeePub: true,
        onFoundry: true,
        onClick: () => blacksmith.openWindow(EDITOR_WINDOW)
    });

    blacksmith.registerToolbarTool(`${MODULE_ID}-bounds`, {
        icon: 'fa-solid fa-border-none',
        name: `${MODULE_ID}-bounds`,
        title: 'Show or hide group bounds',
        zone: 'general',
        order: 52,
        moduleId: MODULE_ID,
        gmOnly: true,
        onCoffeePub: true,
        onFoundry: false,
        onClick: () => toggleBounds()
    });

    blacksmith.registerToolbarTool(`${MODULE_ID}-new-group`, {
        icon: 'fa-solid fa-plus',
        name: `${MODULE_ID}-new-group`,
        title: 'New Puppeteer Group',
        zone: 'general',
        order: 51,
        moduleId: MODULE_ID,
        gmOnly: true,
        onCoffeePub: true,
        onFoundry: false,
        onClick: () => newGroupByClick(blacksmith)
    });
}

// The pin you right-click is the group, so these need no group picker.
function registerPinMenu(blacksmith) {
    const { pins, utils, toast } = blacksmith;

    const item = (id, name, icon, order, action, visible = true) => pins.registerContextMenuItem(`${MODULE_ID}-${id}`, {
        name,
        icon: `<i class="${icon}"></i>`,
        moduleId: MODULE_ID,
        gmOnly: true,
        order,
        visible,
        onClick: async (pin) => {
            const groupId = groupIdOf(pin);
            if (!groupId) return;
            try {
                await action(groupId);
            } catch (error) {
                console.error(`${MODULE_ID}: ${name} failed`, error);
                utils.postConsoleAndNotification(MODULE_NAME, `${name} failed: ${error.message}`, null, false, true);
            }
        }
    });

    item('capture-area', 'Capture Area into Group', 'fa-solid fa-vector-square', 9, async (groupId) => {
        const result = await captureArea(canvas.scene, groupId);
        if (!result) return;
        toast.show({ title: result.added ? 'Members added' : 'Nothing new in that box', subtitle: `${result.added} added${result.skipped ? `, ${result.skipped} skipped` : ''}.${result.unsupported.length ? ` Not added: ${result.unsupported.join('; ')}.` : ''}`, icon: 'fa-solid fa-up-down-left-right', channel: TOAST_CHANNEL, duration: 6 });
    });
    item('add-selected', 'Add Selected to Group', 'fa-solid fa-plus', 10, async (groupId) => {
        const { added, skipped, unsupported } = await addSelected(canvas.scene, groupId);
        toast.show(!added && !skipped
            ? { title: 'Nothing selected', subtitle: 'Select tiles, lights, sounds, walls, drawings, notes or regions first.', icon: 'fa-solid fa-up-down-left-right', channel: TOAST_CHANNEL, duration: 4 }
            : { title: 'Members added', subtitle: `${added} added${skipped ? `, ${skipped} skipped` : ''}.${unsupported.length ? ` Not added: ${unsupported.join('; ')}.` : ''}`, icon: 'fa-solid fa-up-down-left-right', channel: TOAST_CHANNEL, duration: 6 });
    });
    item('remove-selected', 'Remove Selected from Group', 'fa-solid fa-minus', 11, async (groupId) => {
        const removed = await removeSelected(canvas.scene, groupId);
        toast.show({ title: removed ? 'Members removed' : 'Nothing to remove', subtitle: removed ? `${removed} removed.` : 'None of the selected items are in this group.', icon: 'fa-solid fa-up-down-left-right', channel: TOAST_CHANNEL, duration: 4 });
    });
    item('select-members', 'Select Group Members', 'fa-solid fa-object-group', 12, async (groupId) => {
        const { type, selected, counts } = selectMembers(canvas.scene, groupId);
        const others = Object.entries(counts).filter(([t]) => t !== type).map(([t, n]) => `${n} ${t}`).join(', ');
        toast.show({
            title: type ? `Selected ${selected} ${type}${selected === 1 ? '' : 's'}` : 'No members to select',
            subtitle: others ? `Foundry selects one layer at a time. Also in this group: ${others}. Use the Group Editor to select those.` : undefined,
            icon: 'fa-solid fa-up-down-left-right',
            channel: TOAST_CHANNEL,
            duration: 6
        });
    });
    item('centre-pivot', 'Move Pivot to Group Centre', 'fa-solid fa-bullseye', 12.5, async (groupId) => {
        const anchor = await recenterPivot(canvas.scene, groupId);
        toast.show({
            title: anchor ? 'Pivot centred' : 'Nothing to centre on',
            subtitle: anchor
                ? `Pin ${anchor.from ? `moved from ${anchor.from.x}, ${anchor.from.y} ` : ''}to ${anchor.x}, ${anchor.y}, the middle of a ${anchor.width} by ${anchor.height} group. Nothing else moved.`
                : 'The group has no members yet.',
            icon: 'fa-solid fa-up-down-left-right',
            channel: TOAST_CHANNEL,
            duration: 8
        });
    });
    item('toggle-bounds', 'Show or Hide Group Bounds', 'fa-solid fa-border-none', 12.7, async () => toggleBounds());
    item('rotate-cw', 'Rotate Group 90° Clockwise', 'fa-solid fa-rotate-right', 13, (groupId) => rotateBy(canvas.scene, groupId, 90));
    item('rotate-ccw', 'Rotate Group 90° Counter-clockwise', 'fa-solid fa-rotate-left', 14, (groupId) => rotateBy(canvas.scene, groupId, -90));
    // Only offered when the group has any, so a plain platform's menu stays short.
    const has = (type) => (pin) => !!getGroup(canvas.scene, groupIdOf(pin))?.members.some((member) => member.type === type);
    item('toggle-hidden', 'Hide or Show Group', 'fa-solid fa-eye-slash', 12.8, async (groupId) => {
        const hidden = await setGroupHidden(canvas.scene, groupId, !getGroup(canvas.scene, groupId).hidden);
        toast.show({ title: hidden ? 'Group hidden' : 'Group shown', icon: 'fa-solid fa-up-down-left-right', channel: TOAST_CHANNEL, duration: 3 });
    });
    item('toggle-lights', 'Switch Group Lights On or Off', 'fa-solid fa-lightbulb', 12.9, async (groupId) => {
        const { on } = await setEmittersOn(canvas.scene, groupId, 'AmbientLight');
        toast.show({ title: on ? 'Lights on' : 'Lights off', icon: 'fa-solid fa-lightbulb', channel: TOAST_CHANNEL, duration: 3 });
    }, has('AmbientLight'));
    item('toggle-sounds', 'Switch Group Sounds On or Off', 'fa-solid fa-volume-high', 12.95, async (groupId) => {
        const { on } = await setEmittersOn(canvas.scene, groupId, 'AmbientSound');
        toast.show({ title: on ? 'Sounds on' : 'Sounds off', icon: 'fa-solid fa-volume-high', channel: TOAST_CHANNEL, duration: 3 });
    }, has('AmbientSound'));
    item('toggle-playing', 'Play or Pause Group', 'fa-solid fa-play-pause', 12.97, async (groupId) => {
        const { playing } = await setPlaying(canvas.scene, groupId);
        toast.show({ title: playing ? 'Group playing' : 'Group paused', icon: 'fa-solid fa-play-pause', channel: TOAST_CHANNEL, duration: 3 });
    }, (pin) => {
        const group = getGroup(canvas.scene, groupIdOf(pin));
        return !!group && canPlayPause(group);
    });
    item('duplicate', 'Duplicate Group', 'fa-solid fa-clone', 14.5, async (groupId) => {
        const copy = await duplicateGroup(canvas.scene, groupId);
        toast.show({ title: 'Group duplicated', subtitle: `${copy.name} is two squares to the right.`, icon: 'fa-solid fa-clone', channel: TOAST_CHANNEL, duration: 4 });
    });
    item('open-editor', 'Open Group Editor', 'fa-solid fa-sliders', 15, async () => blacksmith.openWindow(EDITOR_WINDOW));
}
