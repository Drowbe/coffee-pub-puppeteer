// Where the GM reaches Puppeteer: toolbar tools, the pin right-click menu, and the registered Group Editor
// window. Everything registers through Blacksmith.
import { MODULE_ID, MODULE_NAME } from './constants.js';
import { getBlacksmith } from './bootstrap.js';
import { captureArea, recenterPivot, addSelected, removeSelected, selectMembers, rotateBy, createGroup } from './groups.js';

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
        toast.show({ title: result.added ? 'Members added' : 'Nothing new in that box', subtitle: `${result.added} added${result.skipped ? `, ${result.skipped} skipped` : ''}.`, icon: 'fa-solid fa-up-down-left-right', duration: 4 });
    });
    item('add-selected', 'Add Selected to Group', 'fa-solid fa-plus', 10, async (groupId) => {
        const { added, skipped } = await addSelected(canvas.scene, groupId);
        toast.show(!added && !skipped
            ? { title: 'Nothing selected', subtitle: 'Select tiles, lights, sounds, walls, drawings or notes first.', icon: 'fa-solid fa-up-down-left-right', duration: 4 }
            : { title: 'Members added', subtitle: `${added} added${skipped ? `, ${skipped} skipped` : ''}.`, icon: 'fa-solid fa-up-down-left-right', duration: 4 });
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
        toast.show({ title: anchor ? 'Pivot centred' : 'Nothing to centre on', subtitle: anchor ? 'Nothing moved.' : 'The group has no members yet.', icon: 'fa-solid fa-up-down-left-right', duration: 4 });
    });
    item('rotate-cw', 'Rotate Group 90° Clockwise', 'fa-solid fa-rotate-right', 13, (groupId) => rotateBy(canvas.scene, groupId, 90));
    item('rotate-ccw', 'Rotate Group 90° Counter-clockwise', 'fa-solid fa-rotate-left', 14, (groupId) => rotateBy(canvas.scene, groupId, -90));
    item('open-editor', 'Open Group Editor', 'fa-solid fa-sliders', 15, async () => blacksmith.openWindow(EDITOR_WINDOW));
}
