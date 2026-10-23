// The Group Editor: every group on the scene in view, its members, its heading, and the actions on them.
// Loaded on demand by the window registry (see ui.js), so a Blacksmith failure cannot stop the module's
// scripts from loading.
import { BlacksmithWindowBaseV2 } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';
import { MODULE_ID, MODULE_NAME } from './constants.js';
import { getBlacksmith } from './blacksmith.js';
import {
    createGroup, createTokenGroup, attachToToken, detachToPin, captureArea, recenterPivot, exportGroup, addSelected, removeSelected, renameMember, removeMember, selectMembers, renameGroup,
    setHeading, rotateBy, deleteGroup, listGroups
} from './groups.js';
import { boundsShown, setBoundsShown } from './overlay.js';
import { anchorState, anchorExists } from './anchor.js';
import { groupsTouched } from './store.js';
import { listTemplates, saveGroupToLibrary, stampTemplate, deleteTemplate, getTemplate, importTemplate } from './library.js';

const esc = (value) => foundry.utils.escapeHTML(String(value ?? ''));

const TYPE_ICON = {
    Tile: 'fa-solid fa-image',
    Drawing: 'fa-solid fa-pen',
    AmbientLight: 'fa-solid fa-lightbulb',
    AmbientSound: 'fa-solid fa-volume-high',
    Wall: 'fa-solid fa-grip-lines',
    Note: 'fa-solid fa-note-sticky',
    Region: 'fa-solid fa-draw-polygon'
};

// Which groups have their member list open. Module level so it survives a redraw and a close and reopen.
const expanded = new Set();

const TYPE_PLURAL = {
    Tile: 'Tiles',
    Drawing: 'Drawings',
    AmbientLight: 'Lights',
    AmbientSound: 'Sounds',
    Wall: 'Walls',
    Note: 'Notes',
    Region: 'Regions'
};

const TYPE_LABEL = {
    Tile: 'Tile',
    Drawing: 'Drawing',
    AmbientLight: 'Light',
    AmbientSound: 'Sound',
    Wall: 'Wall',
    Note: 'Note',
    Region: 'Region'
};

/** Run an editor action, and say so (console and notification) if it fails, instead of failing silently. */
async function run(label, action) {
    try {
        return await action();
    } catch (error) {
        console.error(`${MODULE_ID}: ${label} failed`, error);
        getBlacksmith().utils.postConsoleAndNotification(MODULE_NAME, `${label} failed: ${error.message}`, null, false, true);
        return null;
    }
}

function say(title, subtitle) {
    getBlacksmith().toast.show({ title, subtitle, icon: 'fa-solid fa-up-down-left-right', duration: 4 });
}

export class GroupEditorWindow extends BlacksmithWindowBaseV2 {
    static DEFAULT_OPTIONS = {
        id: `${MODULE_ID}-group-editor`,
        classes: ['puppeteer-group-editor'],
        position: { width: 560, height: 640 },
        window: { title: 'Puppeteer Groups', resizable: true, minimizable: true },
        windowSizeConstraints: { minWidth: 440, minHeight: 320 }
    };

    static PARTS = {
        body: { template: 'modules/coffee-pub-blacksmith/templates/window-template.hbs' }
    };

    static ACTION_HANDLERS = {
        newGroup: (event, target, win) => win._newGroup(),
        newTokenGroup: (event, target, win) => win._newTokenGroup(),
        attachToToken: (event, target, win) => win._attachToToken(target.dataset.groupId),
        detachToPin: (event, target, win) => win._detachToPin(target.dataset.groupId),
        rotate: (event, target, win) => win._rotate(target.dataset.groupId, Number(target.dataset.degrees)),
        captureArea: (event, target, win) => win._captureArea(target.dataset.groupId),
        recenterPivot: (event, target, win) => win._recenterPivot(target.dataset.groupId),
        exportGroup: (event, target, win) => win._exportGroup(target.dataset.groupId),
        saveToLibrary: (event, target, win) => win._saveToLibrary(target.dataset.groupId),
        stampTemplate: (event, target, win) => win._stamp(target.dataset.templateId),
        exportTemplate: (event, target, win) => win._exportTemplate(target.dataset.templateId),
        deleteTemplate: (event, target, win) => win._deleteTemplate(target.dataset.templateId),
        importTemplate: (event, target, win) => win.element.querySelector('input[data-field="importFile"]')?.click(),
        addSelected: (event, target, win) => win._addSelected(target.dataset.groupId),
        removeSelected: (event, target, win) => win._removeSelected(target.dataset.groupId),
        selectMembers: (event, target, win) => win._selectMembers(target.dataset.groupId, target.dataset.type || null),
        panTo: (event, target, win) => win._panTo(target.dataset.groupId),
        deleteGroup: (event, target, win) => win._deleteGroup(target.dataset.groupId),
        removeMember: (event, target, win) => win._removeMember(target.dataset.groupId, target.dataset.type, target.dataset.id)
    };

    /** Open the editor, or bring the open one forward. */
    static async open() {
        const existing = foundry.applications.instances.get(GroupEditorWindow.DEFAULT_OPTIONS.id);
        if (existing) {
            await existing.render({ force: true });
            existing.bringToFront?.();
            return existing;
        }
        return new GroupEditorWindow().render({ force: true });
    }

    get _hookContext() {
        return `${MODULE_ID}-editor`;
    }

    async _onFirstRender(context, options) {
        await super._onFirstRender?.(context, options);
        // Redraw when this scene's groups change (a pin dragged, a member pruned, a heading set elsewhere).
        getBlacksmith().HookManager.registerHook({
            name: 'updateScene',
            description: 'Puppeteer: refresh the Group Editor when a group changes',
            context: this._hookContext,
            priority: 4,
            key: `${this._hookContext}-refresh`,
            options: { debounceMs: 100 },
            callback: (scene, changes) => {
                if (scene.id !== canvas.scene?.id) return;
                if (groupsTouched(changes)) this.render();
            }
        });
        getBlacksmith().HookManager.registerHook({
            name: 'canvasReady',
            description: 'Puppeteer: refresh the Group Editor when the scene in view changes',
            context: this._hookContext,
            priority: 4,
            key: `${this._hookContext}-scene`,
            callback: () => this.render()
        });
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        // Text and number fields commit on change, not on click, so they are wired here.
        for (const input of this.element.querySelectorAll('input[data-field]')) {
            input.addEventListener('change', () => this._commitField(input));
        }
        // Remember which member lists are open, so a redraw does not collapse them.
        for (const details of this.element.querySelectorAll('details[data-group-id]')) {
            details.addEventListener('toggle', () => {
                if (details.open) expanded.add(details.dataset.groupId);
                else expanded.delete(details.dataset.groupId);
            });
        }
    }

    _onClose(options) {
        getBlacksmith().HookManager.disposeByContext(this._hookContext);
        return super._onClose?.(options);
    }

    async getData() {
        const scene = canvas.scene;
        const groups = scene ? listGroups(scene) : [];
        return {
            appId: this.id,
            headerIcon: 'fa-solid fa-up-down-left-right',
            windowTitle: 'Puppeteer Groups',
            subtitle: scene ? scene.name : 'No scene in view',
            showOptionBar: false,
            showTools: false,
            bodyContent: (groups.length
                ? groups.map((group) => this._groupHtml(scene, group)).join('')
                : `<p class="puppeteer-empty">No groups on this scene. Choose <strong>New Group</strong>, select some tiles, lights, sounds, walls, drawings or notes on the canvas, then choose <strong>Add Selected</strong> on the group.</p>`)
                + this._libraryHtml(),
            actionBarLeft: `<button type="button" class="blacksmith-window-btn-primary" data-action="newGroup"><i class="fa-solid fa-plus"></i> New Group</button>
                <button type="button" class="blacksmith-window-btn-secondary" data-action="newTokenGroup" data-tooltip="Make a group that follows the selected token, such as a cart or a ship"><i class="fa-solid fa-horse"></i> On Selected Token</button>
                <label class="puppeteer-toggle" data-tooltip="Draw the box that holds each group, its pivot and its heading on the canvas"><input type="checkbox" data-field="showBounds"${boundsShown() ? ' checked' : ''}> Show group bounds</label>`
        };
    }

    _libraryHtml() {
        const rows = listTemplates().map((template) => `
            <li class="puppeteer-template">
                <i class="fa-solid fa-cubes"></i>
                <span class="puppeteer-template-name">${esc(template.name)} <span class="puppeteer-template-count">${template.members} member${template.members === 1 ? '' : 's'}</span></span>
                <button type="button" class="blacksmith-window-btn-primary" data-action="stampTemplate" data-template-id="${esc(template.id)}" data-tooltip="Place a copy at the centre of your view"><i class="fa-solid fa-stamp"></i> Stamp</button>
                <button type="button" class="blacksmith-window-btn-secondary" data-action="exportTemplate" data-template-id="${esc(template.id)}" data-tooltip="Save as a JSON file"><i class="fa-solid fa-file-export"></i></button>
                <button type="button" class="blacksmith-window-btn-critical" data-action="deleteTemplate" data-template-id="${esc(template.id)}" data-tooltip="Remove from the library"><i class="fa-solid fa-trash"></i></button>
            </li>`).join('');
        return `
        <section class="puppeteer-library">
            <div class="puppeteer-library-head">
                <h3><i class="fa-solid fa-boxes-stacked"></i> Library</h3>
                <button type="button" class="blacksmith-window-btn-secondary" data-action="importTemplate"><i class="fa-solid fa-file-import"></i> Import</button>
                <input type="file" accept="application/json,.json" data-field="importFile" hidden>
            </div>
            <ul>${rows || '<li class="puppeteer-member-none">Nothing saved yet. Use Save to Library on a group.</li>'}</ul>
        </section>`;
    }

    _groupHtml(scene, group) {
        const id = esc(group.id);
        const step = (degrees, icon) => `
            <button type="button" class="blacksmith-window-btn-secondary puppeteer-step" data-action="rotate"
                data-group-id="${id}" data-degrees="${degrees}"
                data-tooltip="Rotate ${Math.abs(degrees)}° ${degrees < 0 ? 'counter-clockwise' : 'clockwise'}">
                <i class="${icon}"></i> ${Math.abs(degrees)}
            </button>`;
        const button = (action, icon, label, tooltip = '') => `
            <button type="button" class="blacksmith-window-btn-secondary" data-action="${action}" data-group-id="${id}"${tooltip ? ` data-tooltip="${esc(tooltip)}"` : ''}>
                <i class="${icon}"></i> ${label}
            </button>`;

        const members = group.members.map((member) => {
            const present = !!scene.getEmbeddedCollection(member.type).get(member.id);
            const kind = `${TYPE_LABEL[member.type] ?? member.type} ${member.id.slice(0, 6)}`;
            return `
                <li class="puppeteer-member${present ? '' : ' puppeteer-member-missing'}">
                    <i class="${TYPE_ICON[member.type] ?? 'fa-solid fa-circle'}" data-tooltip="${esc(TYPE_LABEL[member.type] ?? member.type)}"></i>
                    <input type="text" class="puppeteer-member-name" data-field="memberLabel" data-group-id="${id}"
                        data-type="${esc(member.type)}" data-id="${esc(member.id)}"
                        value="${esc(member.label ?? '')}" placeholder="${esc(kind)}"${present ? '' : ' disabled'}>
                    ${present ? '' : '<span class="puppeteer-member-gone">missing</span>'}
                    <button type="button" class="puppeteer-member-remove" data-action="removeMember"
                        data-group-id="${id}" data-type="${esc(member.type)}" data-id="${esc(member.id)}"
                        data-tooltip="Remove from group"><i class="fa-solid fa-xmark"></i></button>
                </li>`;
        }).join('');

        const counts = {};
        for (const member of group.members) counts[member.type] = (counts[member.type] ?? 0) + 1;
        const chips = Object.entries(counts).map(([type, count]) => `
            <button type="button" class="blacksmith-window-btn-secondary puppeteer-chip" data-action="selectMembers"
                data-group-id="${id}" data-type="${esc(type)}" data-tooltip="Select these ${esc(TYPE_PLURAL[type] ?? type)} on the canvas">
                <i class="${TYPE_ICON[type] ?? 'fa-solid fa-circle'}"></i> ${esc(TYPE_PLURAL[type] ?? type)} ${count}
            </button>`).join('');
        const onToken = group.anchor.type === 'token';
        const lost = !anchorExists(scene, group);
        const warning = lost
            ? `<div class="puppeteer-warning"><i class="fa-solid fa-triangle-exclamation"></i> This group has lost its ${onToken ? 'token' : 'pin'}, so it cannot be moved. Delete the group and make a new one.</div>`
            : '';
        const heading = anchorState(scene, group)?.heading ?? group.heading;

        return `
        <section class="puppeteer-group" data-group-id="${id}">
            <div class="puppeteer-group-head">
                <input type="text" class="puppeteer-group-name" data-field="name" data-group-id="${id}" value="${esc(group.name)}">
                <span class="puppeteer-group-count">${group.members.length} member${group.members.length === 1 ? '' : 's'}</span>
            </div>
            ${warning}
            ${chips ? `<div class="puppeteer-group-row puppeteer-group-types">${chips}</div>` : ''}
            <div class="puppeteer-group-row">
                <label class="puppeteer-heading">Heading
                    <input type="number" data-field="heading" data-group-id="${id}" value="${Math.round(heading * 100) / 100}" min="0" max="360" step="1">°
                </label>
                ${step(-90, 'fa-solid fa-rotate-left')}${step(-15, 'fa-solid fa-rotate-left')}${step(15, 'fa-solid fa-rotate-right')}${step(90, 'fa-solid fa-rotate-right')}
            </div>
            <div class="puppeteer-group-row">
                ${button('captureArea', 'fa-solid fa-vector-square', 'Capture Area')}
                ${button('addSelected', 'fa-solid fa-plus', 'Add Selected')}
                ${button('removeSelected', 'fa-solid fa-minus', 'Remove Selected')}
                ${button('panTo', 'fa-solid fa-location-crosshairs', onToken ? 'Go To Token' : 'Go To Pin')}
                ${onToken ? '' : button('recenterPivot', 'fa-solid fa-bullseye', 'Centre Pivot')}
                ${onToken ? button('detachToPin', 'fa-solid fa-link-slash', 'Detach from Token', "Stop following the token. A pin is left at the token's centre; nothing moves.") : button('attachToToken', 'fa-solid fa-link', 'Attach to Token', 'Follow the selected token. The pin is removed; nothing moves.')}
                ${button('saveToLibrary', 'fa-solid fa-box-archive', 'Save to Library')}
                ${button('exportGroup', 'fa-solid fa-file-export', 'Export')}
                <button type="button" class="blacksmith-window-btn-critical" data-action="deleteGroup" data-group-id="${id}">
                    <i class="fa-solid fa-trash"></i> Delete
                </button>
            </div>
            <details class="puppeteer-group-members" data-group-id="${id}"${expanded.has(group.id) ? ' open' : ''}>
                <summary>Members</summary>
                <ul>${members || '<li class="puppeteer-member-none">No members yet.</li>'}</ul>
            </details>
        </section>`;
    }

    // ---- actions ---------------------------------------------------------------------------------

    _commitField(input) {
        const scene = canvas.scene;
        const groupId = input.dataset.groupId;
        return run('Update group', async () => {
            if (input.dataset.field === 'showBounds') return setBoundsShown(input.checked);
            if (input.dataset.field === 'importFile') {
                const file = input.files?.[0];
                input.value = '';
                if (!file) return;
                const id = await importTemplate(await file.text());
                say('Template imported', `${getTemplate(id).name} is in the library.`);
                return this.render();
            }
            if (input.dataset.field === 'memberLabel') return renameMember(scene, groupId, input.dataset.type, input.dataset.id, input.value);
            if (input.dataset.field === 'name') await renameGroup(scene, groupId, input.value);
            if (input.dataset.field === 'heading') await setHeading(scene, groupId, Number(input.value) || 0);
        });
    }

    _newTokenGroup() {
        return run('Create group on token', async () => {
            const controlled = canvas.tokens.controlled;
            if (controlled.length !== 1) {
                say('Select one token', 'Select the token the group should follow, then try again.');
                return;
            }
            const group = await createTokenGroup(canvas.scene, controlled[0].document);
            say('Group created', `${group.name} follows ${controlled[0].document.name ?? 'the token'}. Select its tiles, lights and walls and choose Add Selected, or use Capture Area.`);
        });
    }

    _attachToToken(groupId) {
        return run('Attach to token', async () => {
            const controlled = canvas.tokens.controlled;
            if (controlled.length !== 1) {
                say('Select one token', 'Select the token this group should follow, then choose Attach to Token.');
                return;
            }
            const token = controlled[0].document;
            await attachToToken(canvas.scene, groupId, token);
            say('Group attached', `It now follows ${token.name ?? 'the token'}. Nothing moved, and the group's pin was removed.`);
        });
    }

    _detachToPin(groupId) {
        return run('Detach from token', async () => {
            await detachToPin(canvas.scene, groupId);
            say('Group detached', "It no longer follows the token. A pin now sits where the token's centre was, so you can still move the group. Nothing else moved.");
        });
    }

    _newGroup() {
        return run('Create group', async () => {
            const group = await createGroup(canvas.scene, { x: canvas.stage.pivot.x, y: canvas.stage.pivot.y }, { name: 'Group' });
            say('Group created', `${group.name} is at the centre of your view.`);
        });
    }

    _rotate(groupId, degrees) {
        return run('Rotate group', () => rotateBy(canvas.scene, groupId, degrees));
    }

    _captureArea(groupId) {
        return run('Capture area', async () => {
            const result = await captureArea(canvas.scene, groupId);
            if (!result) return;
            say(result.added ? 'Members added' : 'Nothing new in that box', `${result.added} added${result.skipped ? `, ${result.skipped} skipped (already members)` : ''}.${result.unsupported.length ? ` Not added: ${result.unsupported.join('; ')}.` : ''}`);
        });
    }

    _exportGroup(groupId) {
        return run('Export group', async () => {
            const template = exportGroup(canvas.scene, groupId);
            const slug = template.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group';
            // Core's file save: Blacksmith has no download helper.
            foundry.utils.saveDataToFile(JSON.stringify(template, null, 2), 'application/json', `puppeteer-${slug}.json`);
            say('Template exported', `${template.members.length} member(s) saved to puppeteer-${slug}.json.`);
        });
    }

    _saveToLibrary(groupId) {
        return run('Save to library', async () => {
            const id = await saveGroupToLibrary(canvas.scene, groupId);
            say('Saved to the library', `${getTemplate(id).name} can now be stamped onto any scene.`);
            this.render();
        });
    }

    _stamp(templateId) {
        return run('Stamp template', async () => {
            const group = await stampTemplate(canvas.scene, templateId, { x: canvas.stage.pivot.x, y: canvas.stage.pivot.y });
            say('Template stamped', `${group.name} was placed at the centre of your view.`);
        });
    }

    _exportTemplate(templateId) {
        return run('Export template', async () => {
            const template = getTemplate(templateId);
            const slug = template.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group';
            // Core's file save: Blacksmith has no download helper.
            foundry.utils.saveDataToFile(JSON.stringify(template, null, 2), 'application/json', `puppeteer-${slug}.json`);
        });
    }

    _deleteTemplate(templateId) {
        return run('Delete template', async () => {
            const template = getTemplate(templateId);
            if (!template) return;
            const confirmed = await getBlacksmith().dialog.confirm({
                title: 'Remove from Library',
                content: `<p>Remove <strong>${esc(template.name)}</strong> from the library? Groups already placed on scenes are not affected.</p>`,
                confirmLabel: 'Remove',
                confirmIcon: 'fa-solid fa-trash',
                destructive: true
            });
            if (confirmed) { await deleteTemplate(templateId); this.render(); }
        });
    }

    _recenterPivot(groupId) {
        return run('Centre pivot', async () => {
            const anchor = await recenterPivot(canvas.scene, groupId);
            say(anchor ? 'Pivot centred' : 'Nothing to centre on', anchor
                ? `Pin ${anchor.from ? `moved from ${anchor.from.x}, ${anchor.from.y} ` : ''}to ${anchor.x}, ${anchor.y}, the middle of a ${anchor.width} by ${anchor.height} group. Nothing else moved.`
                : 'The group has no members yet.');
        });
    }

    _addSelected(groupId) {
        return run('Add selected', async () => {
            const { added, skipped, unsupported } = await addSelected(canvas.scene, groupId);
            if (!added && !skipped) say('Nothing selected', 'Select tiles, lights, sounds, walls, drawings, notes or regions first.');
            else say('Members added', `${added} added${skipped ? `, ${skipped} skipped (already members or not supported)` : ''}.${unsupported.length ? ` Not added: ${unsupported.join('; ')}.` : ''}`);
        });
    }

    _removeSelected(groupId) {
        return run('Remove selected', async () => {
            const removed = await removeSelected(canvas.scene, groupId);
            say(removed ? 'Members removed' : 'Nothing to remove', removed ? `${removed} removed from the group.` : 'None of the selected items are in this group.');
        });
    }

    _selectMembers(groupId, type) {
        return run('Select members', async () => selectMembers(canvas.scene, groupId, type));
    }

    _panTo(groupId) {
        return run('Go to pin', async () => {
            const scene = canvas.scene;
            const group = listGroups(scene).find((g) => g.id === groupId);
            if (group?.anchor.type === 'pin') await getBlacksmith().pins.panTo(group.anchor.id, { ping: true });
            if (group?.anchor.type === 'token') {
                const state = anchorState(scene, group);
                if (state) await canvas.animatePan({ x: state.x, y: state.y });
            }
        });
    }

    _removeMember(groupId, type, id) {
        return run('Remove member', () => removeMember(canvas.scene, groupId, type, id));
    }

    _deleteGroup(groupId) {
        return run('Delete group', async () => {
            const scene = canvas.scene;
            const group = listGroups(scene).find((g) => g.id === groupId);
            if (!group) return;
            const confirmed = await getBlacksmith().dialog.confirm({
                title: 'Delete Group',
                content: `<p>Delete <strong>${esc(group.name)}</strong>? Its ${group.members.length} member(s) stay in the scene where they are; only the group and its pin are removed.</p>`,
                confirmLabel: 'Delete Group',
                confirmIcon: 'fa-solid fa-trash',
                destructive: true
            });
            if (confirmed) {
                await deleteGroup(scene, groupId);
                // Do not wait for a hook to notice: the list on screen is stale the moment the record is gone.
                this.render();
            }
        });
    }
}
