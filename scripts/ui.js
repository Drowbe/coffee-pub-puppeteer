// Where the GM reaches Puppeteer: toolbar tools, the pin right-click menu, and the registered Group Editor
// window. Everything registers through Blacksmith.
import { MODULE_ID, MODULE_NAME } from './constants.js';
import { getBlacksmith } from './blacksmith.js';
import { toggleBounds } from './overlay.js';
import { captureArea, recenterPivot, attachToToken, addSelected, removeSelected, selectMembers, rotateBy, createGroup } from './groups.js';

export const EDITOR_WINDOW = `${MODULE_ID}-group-editor`;

const groupIdOf = (pin) => pin?.config?.puppeteer?.groupId ?? null;

export function registerUi() {
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
    registerPinMenu(blacksmith);
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
        onClick: async () => {
            try {
                const group = await createGroup(canvas.scene, { x: canvas.stage.pivot.x, y: canvas.stage.pivot.y }, { name: 'Group' });
                blacksmith.toast.show({
                    title: 'Group created',
                    subtitle: `${group.name} is at the centre of your view. Select items, then right-click its pin and choose Add Selected.`,
                    icon: 'fa-solid fa-up-down-left-right',
                    duration: 6
                });
            } catch (error) {
                console.error(`${MODULE_ID}: creating a group failed`, error);
                blacksmith.utils.postConsoleAndNotification(MODULE_NAME, `Creating a group failed: ${error.message}`, null, false, true);
            }
        }
    });
}

// The pin you right-click is the group, so these need no group picker.
function registerPinMenu(blacksmith) {
    const { pins, utils, toast } = blacksmith;

    const item = (id, name, icon, order, action) => pins.registerContextMenuItem(`${MODULE_ID}-${id}`, {
        name,
        icon: `<i class="${icon}"></i>`,
        moduleId: MODULE_ID,
        gmOnly: true,
        order,
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
        toast.show({ title: result.added ? 'Members added' : 'Nothing new in that box', subtitle: `${result.added} added${result.skipped ? `, ${result.skipped} skipped` : ''}.${result.unsupported.length ? ` Not added: ${result.unsupported.join('; ')}.` : ''}`, icon: 'fa-solid fa-up-down-left-right', duration: 6 });
    });
    item('add-selected', 'Add Selected to Group', 'fa-solid fa-plus', 10, async (groupId) => {
        const { added, skipped, unsupported } = await addSelected(canvas.scene, groupId);
        toast.show(!added && !skipped
            ? { title: 'Nothing selected', subtitle: 'Select tiles, lights, sounds, walls, drawings, notes or regions first.', icon: 'fa-solid fa-up-down-left-right', duration: 4 }
            : { title: 'Members added', subtitle: `${added} added${skipped ? `, ${skipped} skipped` : ''}.${unsupported.length ? ` Not added: ${unsupported.join('; ')}.` : ''}`, icon: 'fa-solid fa-up-down-left-right', duration: 6 });
    });
    item('remove-selected', 'Remove Selected from Group', 'fa-solid fa-minus', 11, async (groupId) => {
        const removed = await removeSelected(canvas.scene, groupId);
        toast.show({ title: removed ? 'Members removed' : 'Nothing to remove', subtitle: removed ? `${removed} removed.` : 'None of the selected items are in this group.', icon: 'fa-solid fa-up-down-left-right', duration: 4 });
    });
    item('select-members', 'Select Group Members', 'fa-solid fa-object-group', 12, async (groupId) => {
        const { type, selected, counts } = selectMembers(canvas.scene, groupId);
        const others = Object.entries(counts).filter(([t]) => t !== type).map(([t, n]) => `${n} ${t}`).join(', ');
        toast.show({
            title: type ? `Selected ${selected} ${type}${selected === 1 ? '' : 's'}` : 'No members to select',
            subtitle: others ? `Foundry selects one layer at a time. Also in this group: ${others}. Use the Group Editor to select those.` : undefined,
            icon: 'fa-solid fa-up-down-left-right',
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
            duration: 8
        });
    });
    item('toggle-bounds', 'Show or Hide Group Bounds', 'fa-solid fa-border-none', 12.7, async () => toggleBounds());
    item('attach-token', 'Attach Group to Selected Token', 'fa-solid fa-link', 12.8, async (groupId) => {
        const controlled = canvas.tokens.controlled;
        if (controlled.length !== 1) {
            toast.show({ title: 'Select one token', subtitle: 'Select the token this group should follow, then try again.', icon: 'fa-solid fa-up-down-left-right', duration: 5 });
            return;
        }
        await attachToToken(canvas.scene, groupId, controlled[0].document);
        toast.show({ title: 'Group attached', subtitle: `It now follows ${controlled[0].document.name ?? 'the token'}. Nothing moved.`, icon: 'fa-solid fa-up-down-left-right', duration: 5 });
    });
    item('rotate-cw', 'Rotate Group 90° Clockwise', 'fa-solid fa-rotate-right', 13, (groupId) => rotateBy(canvas.scene, groupId, 90));
    item('rotate-ccw', 'Rotate Group 90° Counter-clockwise', 'fa-solid fa-rotate-left', 14, (groupId) => rotateBy(canvas.scene, groupId, -90));
    item('open-editor', 'Open Group Editor', 'fa-solid fa-sliders', 15, async () => blacksmith.openWindow(EDITOR_WINDOW));
}
