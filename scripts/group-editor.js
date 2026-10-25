// The Group Editor: every group on the scene in view, its members, its heading, and the actions on them.
// Loaded on demand by the window registry (see ui.js), so a Blacksmith failure cannot stop the module's
// scripts from loading.
import { BlacksmithToolWindowBaseV2 } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';
import { MODULE_ID, MODULE_NAME, TOAST_CHANNEL } from './constants.js';
import { getBlacksmith } from './blacksmith.js';
import {
    createGroup, captureArea, recenterPivot, exportGroup, addSelected, removeSelected, renameMember, removeMember, selectMembers, renameGroup,
    setHeading, rotateBy, deleteGroup, listGroups, diagnoseGroup, selectMember, setBody, adoptBody, clearBody, setBodyLinked, mountTokens, dismountToken, setMountable, setMovePivot, setBehaviour,
    setGroupHidden, setMemberHidden, HIDEABLE
} from './groups.js';
import { easeOf } from './tween.js';
import { bodyToken } from './body.js';
import { boundsShown, toggleBounds } from './overlay.js';
import { syncAllGroups } from './follower.js';
import { anchorState, anchorExists } from './anchor.js';
import { groupsTouched } from './store.js';
import { listTemplates, saveGroupToLibrary, stampTemplate, deleteTemplate, getTemplate, importTemplate, renameTemplate, setTemplateDescription, updateTemplateFromGroup } from './library.js';

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

// Which group cards are open. Module level so it survives a redraw and a close and reopen.
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
    getBlacksmith().toast.show({ title, subtitle, icon: 'fa-solid fa-up-down-left-right', channel: TOAST_CHANNEL, duration: 4 });
}

// Which tab is showing. Remembered for the session and across reloads, per user.
const TAB_KEY = `${MODULE_ID}.editorTab`;
const TABS = ['library', 'groups', 'tools'];
let tab = (() => {
    try { return localStorage.getItem(TAB_KEY); } catch { return null; }
})();
if (!TABS.includes(tab)) tab = 'groups';

// A tool window: it is kept open over the canvas while the GM selects objects and drags pins, which is what
// Blacksmith's tool base is for. It brings the Light, Dark and Glass themes and the compact title bar.
export class GroupEditorWindow extends BlacksmithToolWindowBaseV2 {
    static DEFAULT_OPTIONS = {
        id: `${MODULE_ID}-group-editor`,
        classes: ['puppeteer-group-editor'],
        position: { width: 540, height: 680 },
        window: { title: 'Puppeteer Groups', resizable: true, minimizable: true },
        toolTheme: 'dark',
        windowSizeConstraints: { minWidth: 440, minHeight: 320 }
    };

    static ACTION_HANDLERS = {
        selectTab: (event, target, win) => win._setTab(target.dataset.value),
        copyUuid: (event, target, win) => win._copyUuid(target.dataset.uuid),
        selectMember: (event, target, win) => win._selectMember(target.dataset.type, target.dataset.id, event.shiftKey),
        syncAll: (event, target, win) => win._syncAll(),
        diagnose: (event, target, win) => win._diagnose(target.dataset.groupId),
        newGroup: (event, target, win) => win._newGroup(),
        rotate: (event, target, win) => win._rotate(target.dataset.groupId, Number(target.dataset.degrees)),
        captureArea: (event, target, win) => win._captureArea(target.dataset.groupId),
        recenterPivot: (event, target, win) => win._recenterPivot(target.dataset.groupId),
        movePivot: (event, target, win) => win._movePivot(target.dataset.groupId),
        exportGroup: (event, target, win) => win._exportGroup(target.dataset.groupId),
        saveToLibrary: (event, target, win) => win._saveToLibrary(target.dataset.groupId),
        stampTemplate: (event, target, win) => win._stamp(target.dataset.templateId),
        updateTemplate: (event, target, win) => win._updateTemplate(target.dataset.templateId),
        toggleGroupHidden: (event, target, win) => win._toggleGroupHidden(target.dataset.groupId),
        toggleMemberHidden: (event, target, win) => win._toggleMemberHidden(target.dataset.groupId, target.dataset.type, target.dataset.id),
        exportTemplate: (event, target, win) => win._exportTemplate(target.dataset.templateId),
        deleteTemplate: (event, target, win) => win._deleteTemplate(target.dataset.templateId),
        importTemplate: (event, target, win) => win.element.querySelector('input[data-field="importFile"]')?.click(),
        addSelected: (event, target, win) => win._addSelected(target.dataset.groupId),
        removeSelected: (event, target, win) => win._removeSelected(target.dataset.groupId),
        selectMembers: (event, target, win) => win._selectMembers(target.dataset.groupId, target.dataset.type || null),
        panTo: (event, target, win) => win._panTo(target.dataset.groupId),
        deleteGroup: (event, target, win) => win._deleteGroup(target.dataset.groupId),
        removeMember: (event, target, win) => win._removeMember(target.dataset.groupId, target.dataset.type, target.dataset.id),
        boardSelected: (event, target, win) => win._boardSelected(target.dataset.groupId),
        dismount: (event, target, win) => win._dismount(target.dataset.groupId, target.dataset.tokenId),
        adoptBody: (event, target, win) => win._adoptBody(target.dataset.groupId),
        clearBody: (event, target, win) => win._clearBody(target.dataset.groupId),
        openBodyActor: (event, target, win) => win._openBodyActor(target.dataset.groupId)
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

    /** Open the editor on the Scene Groups tab with one group's members showing, and bring that group into view. */
    static async focusGroup(groupId) {
        tab = 'groups';
        try { localStorage.setItem(TAB_KEY, tab); } catch { /* a remembered tab is a convenience */ }
        expanded.add(groupId);
        const win = await GroupEditorWindow.open();
        await win.render({ force: true });
        win.element?.querySelector(`.blacksmith-tool-card[data-group-id="${CSS.escape(groupId)}"]`)?.scrollIntoView({ block: 'nearest' });
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
                if (groupsTouched(changes)) this._redraw();
            }
        });
        getBlacksmith().HookManager.registerHook({
            name: 'canvasReady',
            description: 'Puppeteer: refresh the Group Editor when the scene in view changes',
            context: this._hookContext,
            priority: 4,
            key: `${this._hookContext}-scene`,
            callback: () => this._redraw()
        });
    }

    async _onRender(context, options) {
        await super._onRender?.(context, options);
        if (this.element.dataset.puppeteerEditable !== 'bound') {
            this.element.dataset.puppeteerEditable = 'bound';
            this.element.addEventListener('change', (event) => this._onEditableChange(event));
        }
        // Text and number fields commit on change, not on click, so they are wired here.
        for (const input of this.element.querySelectorAll('input[data-field], select[data-field], textarea[data-field]')) {
            input.addEventListener('change', () => this._commitField(input));
        }
        // An actor dragged from the sidebar onto a group's body row becomes the group's body.
        for (const zone of this.element.querySelectorAll('[data-drop-group]')) {
            zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('is-over'); });
            zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
            zone.addEventListener('drop', (event) => { event.preventDefault(); zone.classList.remove('is-over'); this._dropActor(event, zone.dataset.dropGroup); });
        }
    }

    _onClose(options) {
        getBlacksmith().HookManager.disposeByContext(this._hookContext);
        return super._onClose?.(options);
    }

    /** The icon button in the title bar that shows or hides the group bounds on the canvas. */
    getToolHeaderActions() {
        return [{
            id: 'bounds',
            icon: 'fa-solid fa-border-none',
            label: 'Show group bounds: draw the box that holds each group, its pivot and its heading on the canvas',
            active: boundsShown(),
            onClick: () => { toggleBounds(); this.render(); }
        }];
    }

    async getData() {
        const scene = canvas.scene;
        const groups = scene ? listGroups(scene) : [];
        const library = listTemplates();
        const footer = {
            groups: `<button type="button" class="blacksmith-window-btn-primary" data-action="newGroup"><i class="fa-solid fa-plus"></i> New Group</button>`,
            library: `<button type="button" class="blacksmith-window-btn-secondary" data-action="importTemplate"><i class="fa-solid fa-file-import"></i> Import</button>
                <input type="file" accept="application/json,.json" data-field="importFile" hidden>`,
            tools: ''
        }[tab];
        const body = {
            groups: () => this._groupsHtml(scene, groups),
            library: () => this._libraryHtml(scene, library, groups),
            tools: () => this._toolsHtml(scene, groups)
        }[tab]();

        return {
            appId: this.id,
            showToolBar: true,
            toolBarLeft: this._tabsHtml(groups.length, library.length),
            bodyContent: body,
            toolFooterLeft: footer,
            showToolFooter: !!footer
        };
    }

    _tabsHtml(groupCount, libraryCount) {
        const button = (id, icon, label, count) => `
            <button type="button" class="blacksmith-tab${tab === id ? ' is-active' : ''}" data-action="selectTab" data-value="${id}">
                <i class="${icon}"></i><span>${label}</span>${count === null ? '' : ` <span class="blacksmith-badge blacksmith-badge-accent">${count}</span>`}
            </button>`;
        return `<nav class="blacksmith-tabs">${button('library', 'fa-solid fa-boxes-stacked', 'Library', libraryCount)}${button('groups', 'fa-solid fa-up-down-left-right', 'Scene Groups', groupCount)}${button('tools', 'fa-solid fa-screwdriver-wrench', 'Tools', null)}</nav>`;
    }

    _groupsHtml(scene, groups) {
        if (!scene) return '<p class="blacksmith-tool-empty">There is no scene in view.</p>';
        if (!groups.length) {
            return `<p class="blacksmith-tool-empty">No groups on <strong>${esc(scene.name)}</strong>. Choose <strong>New Group</strong>, select some tiles, lights, sounds, walls, drawings, notes or regions on the canvas, then choose <strong>Add Selected</strong> on the group.</p>`;
        }
        return groups.map((group) => this._groupHtml(scene, group)).join('');
    }

    _libraryHtml(scene, templates, groups) {
        const options = groups.map((group) => `<option value="${esc(group.id)}">${esc(group.name)}</option>`).join('');
        const rows = templates.map((template) => {
            const id = esc(template.id);
            return `
            <div class="blacksmith-list-row puppeteer-template" data-template-id="${id}">
                <div class="blacksmith-list-row-main">
                    <div class="blacksmith-list-row-title">${this._editableHtml('templateName', template.name, 'Entry', { 'template-id': template.id }, { required: true })}</div>
                    <div class="blacksmith-list-row-meta">${template.members} part${template.members === 1 ? '' : 's'}${template.actor ? `, represents ${esc(template.actor)}` : ''}</div>
                    ${this._editableHtml('templateDescription', template.description, 'No description', { 'template-id': template.id }, { multiline: true, tooltip: 'Describe' })}
                    <div class="puppeteer-inline">
                        <select data-field="updateSource" data-template-id="${id}"${groups.length ? '' : ' disabled'} data-tooltip="The group on this scene to copy the entry's parts from">
                            ${options || '<option value="">No groups on this scene</option>'}
                        </select>
                        <button type="button" class="blacksmith-tool-btn" data-action="updateTemplate" data-template-id="${id}"${groups.length ? '' : ' disabled'} data-tooltip="Replace this entry's parts with the chosen group. Copies already placed are not changed."><i class="fa-solid fa-arrows-rotate"></i> Update from group</button>
                    </div>
                </div>
                <div class="blacksmith-list-row-action">
                    <button type="button" class="blacksmith-tool-btn" data-action="stampTemplate" data-template-id="${id}" data-tooltip="Fabricate a new copy at the centre of your view"><i class="fa-solid fa-hammer"></i> Fabricate</button>
                    <button type="button" class="blacksmith-tool-btn is-icon" data-action="exportTemplate" data-template-id="${id}" data-tooltip="Save as a JSON file"><i class="fa-solid fa-file-export"></i></button>
                    <button type="button" class="blacksmith-tool-btn is-icon is-danger" data-action="deleteTemplate" data-template-id="${id}" data-tooltip="Remove from the library"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>`;
        }).join('');
        return `
        <p class="blacksmith-tool-hint">Saved copies of groups. An entry is not tied to any scene: <strong>Fabricate</strong> builds a fresh, independent copy on this scene, as many times as you like. Make one with <strong>Save to Library</strong> on a group.</p>
        <div class="blacksmith-list">${rows || '<div class="blacksmith-list-empty">Nothing saved yet.</div>'}</div>`;
    }

    _toolsHtml(scene, groups) {
        const rows = groups.map((group) => `
            <div class="blacksmith-list-row">
                <div class="blacksmith-list-row-main">
                    <div class="blacksmith-list-row-title">${esc(group.name)}</div>
                    <div class="blacksmith-list-row-meta">${group.members.length} part${group.members.length === 1 ? '' : 's'}</div>
                </div>
                <div class="blacksmith-list-row-action">
                    <button type="button" class="blacksmith-tool-btn" data-action="diagnose" data-group-id="${esc(group.id)}" data-tooltip="Write where this group's anchor and every part is, against where it should be, to the browser console (F12)"><i class="fa-solid fa-stethoscope"></i> Diagnose</button>
                </div>
            </div>`).join('');
        const puppeteer = game.modules.get(MODULE_ID);
        const blacksmith = game.modules.get('coffee-pub-blacksmith');
        return `
        <section class="blacksmith-tool-section"><header class="blacksmith-tool-section-head"><span class="blacksmith-tool-section-title">Bring groups up to date</span></header>
            <p class="blacksmith-tool-hint">Move every group's parts to where its pin is now. This happens by itself while a GM is connected; use it after a pin moved while no GM was online and you want to be sure.</p>
            <button type="button" class="blacksmith-tool-btn" data-action="syncAll"><i class="fa-solid fa-rotate"></i> Update all groups</button>
        </section>
        <section class="blacksmith-tool-section"><header class="blacksmith-tool-section-head"><span class="blacksmith-tool-section-title">Diagnosis</span></header>
            <p class="blacksmith-tool-hint">If a group is not where you expect, a report of where its anchor and every part is, against where it should be, goes to the browser console (F12).</p>
            <div class="blacksmith-list">${rows || `<div class="blacksmith-list-empty">No groups on ${esc(scene?.name ?? 'this scene')}.</div>`}</div>
        </section>
        <section class="blacksmith-tool-section"><header class="blacksmith-tool-section-head"><span class="blacksmith-tool-section-title">About</span></header>
            <p class="blacksmith-tool-hint">Puppeteer ${esc(puppeteer?.version)} on Blacksmith ${esc(blacksmith?.version)} (API ${esc(blacksmith?.api?.version)}).</p>
            <p class="blacksmith-tool-hint">Show or hide the group bounds with the dotted-box icon in this window's title bar.</p>
        </section>`;
    }

    /**
     * A name shown as text with a pencil, Blacksmith's `blacksmith-tool-editable`. The field exists only while it is being
     * edited, and a change arrives as a `change` event on the root with the new value (`_onEditableChange`). `attrs` are
     * the data attributes the save needs, and `field` says which save it is.
     */
    _editableHtml(field, value, placeholder, attrs, { multiline = false, required = false, tooltip = 'Rename' } = {}) {
        const data = Object.entries(attrs).map(([key, val]) => ` data-${key}="${esc(val)}"`).join('');
        return `<span class="blacksmith-tool-editable${value ? '' : ' is-empty'}" data-edit-field="${field}" data-value="${esc(value)}" data-placeholder="${esc(placeholder)}"${multiline ? ' data-multiline="true"' : ''}${required ? ' data-required="true"' : ''}${data}>`
            + `<span class="blacksmith-tool-editable-text">${esc(value || placeholder)}</span>`
            + `<button type="button" class="blacksmith-tool-btn is-icon blacksmith-tool-editable-edit" data-tooltip="${esc(tooltip)}"><i class="fa-solid fa-pen"></i></button>`
            + '</span>';
    }

    /** A toggle switch with its label: Blacksmith's own control, wired through `data-field` like any other field. */
    _toggleHtml(field, groupId, label, checked, tooltip, disabled = false) {
        return `
            <div class="blacksmith-toggle-row" data-tooltip="${esc(tooltip)}">
                <span class="blacksmith-toggle-label">${label}</span>
                <label class="blacksmith-toggle">
                    <input type="checkbox" class="blacksmith-toggle-input" data-field="${field}" data-group-id="${esc(groupId)}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}>
                    <span class="blacksmith-toggle-slider"></span>
                </label>
            </div>`;
    }

    /**
     * One group as a card. Collapsed it is a single line with what you reach for while using the group: where it is,
     * whether it shows, and delete. Open, it has a section for each thing a group has: parts, pivot and heading, body,
     * riders and behaviour.
     */
    _groupHtml(scene, group) {
        const id = esc(group.id);
        const open = expanded.has(group.id);
        const heading = anchorState(scene, group)?.heading ?? group.heading;
        const count = group.members.length;
        const riders = (group.riders ?? []).length;
        const lost = !anchorExists(scene, group);

        const badges = [
            group.body ? '<span class="blacksmith-badge" data-tooltip="Can be attacked: it has a body"><i class="fa-solid fa-user-shield"></i></span>' : '',
            riders ? `<span class="blacksmith-badge" data-tooltip="Riders aboard"><i class="fa-solid fa-person-walking"></i> ${riders}</span>` : '',
            group.movePivot ? '<span class="blacksmith-badge blacksmith-badge-accent" data-tooltip="Move Pivot is on"><i class="fa-solid fa-crosshairs"></i></span>' : ''
        ].join('');

        const warnings = [
            lost ? '<div class="blacksmith-tool-card-notice is-warning"><i class="fa-solid fa-triangle-exclamation"></i> This group has lost its pin, so it cannot be moved. Delete the group and make a new one.</div>' : '',
            group.movePivot ? '<div class="blacksmith-tool-card-notice is-warning"><i class="fa-solid fa-crosshairs"></i> <strong>Move Pivot is on.</strong> Drag the pin to where the grip should be: it moves only the pin, nothing else moves, and this switches itself off when you drop it. Choose Move Pivot again to cancel.</div>' : ''
        ].join('');

        return `
        <div class="blacksmith-tool-card${group.hidden ? ' is-hidden' : ''}" data-group-id="${id}">
            <div class="blacksmith-tool-card-head">
                <label class="blacksmith-tool-card-summary">
                    <input type="checkbox" class="blacksmith-tool-card-toggle" data-field="cardOpen" data-group-id="${id}"${open ? ' checked' : ''}>
                    <i class="blacksmith-tool-card-caret fa-solid fa-chevron-right"></i>
                    <span class="blacksmith-tool-card-title">${this._editableHtml('name', group.name, 'Group', { 'group-id': group.id }, { required: true })}</span>
                    <span class="blacksmith-tool-card-badges">
                        <span class="blacksmith-badge">${count} part${count === 1 ? '' : 's'}, ${Math.round(heading)}&deg;</span>
                        ${badges}
                    </span>
                </label>
                <span class="blacksmith-tool-card-actions">
                    <button type="button" class="blacksmith-tool-btn" data-action="panTo" data-group-id="${id}" data-tooltip="Go to this group's pin"><i class="fa-solid fa-location-crosshairs"></i> Go To Pin</button>
                    <button type="button" class="blacksmith-tool-btn${group.hidden ? ' is-active' : ''}" data-action="toggleGroupHidden" data-group-id="${id}" data-tooltip="${group.hidden ? 'Show the group' : 'Hide the group'}: its tiles, drawings, lights, sounds, regions and body. Walls and notes cannot be hidden."><i class="fa-solid fa-eye${group.hidden ? '-slash' : ''}"></i> ${group.hidden ? 'Show' : 'Hide'}</button>
                    <button type="button" class="blacksmith-tool-btn is-icon is-danger" data-action="deleteGroup" data-group-id="${id}" data-tooltip="Delete the group"><i class="fa-solid fa-trash"></i></button>
                </span>
            </div>
            ${warnings}
            <div class="blacksmith-tool-card-body">${this._cardBodyHtml(scene, group, heading)}</div>
        </div>`;
    }

    /** The open half of a group's card. */
    _cardBodyHtml(scene, group, heading) {
        const id = esc(group.id);
        const button = (action, icon, label, tooltip = '') => `
            <button type="button" class="blacksmith-tool-btn" data-action="${action}" data-group-id="${id}"${tooltip ? ` data-tooltip="${esc(tooltip)}"` : ''}>
                <i class="${icon}"></i> ${label}
            </button>`;
        const step = (degrees, icon) => `
            <button type="button" class="blacksmith-tool-btn" data-action="rotate"
                data-group-id="${id}" data-degrees="${degrees}"${group.rotates === false ? ' disabled' : ''}
                data-tooltip="Rotate ${Math.abs(degrees)} degrees ${degrees < 0 ? 'counter-clockwise' : 'clockwise'}">
                <i class="${icon}"></i> ${Math.abs(degrees)}
            </button>`;

        const members = group.members.map((member) => {
            const doc = scene.getEmbeddedCollection(member.type).get(member.id);
            const present = !!doc;
            const kind = `${TYPE_LABEL[member.type] ?? member.type} ${member.id.slice(0, 6)}`;
            const canHide = HIDEABLE.includes(member.type) && present;
            const hiddenNow = !!doc?._source.hidden;
            return `
                <div class="blacksmith-list-row${present ? '' : ' puppeteer-missing'}">
                    <button type="button" class="blacksmith-tool-btn is-icon" data-action="selectMember" data-type="${esc(member.type)}" data-id="${esc(member.id)}"
                        data-tooltip="Select this ${esc((TYPE_LABEL[member.type] ?? member.type).toLowerCase())} on the canvas (Shift to add to the selection)"${present ? '' : ' disabled'}>
                        <i class="${TYPE_ICON[member.type] ?? 'fa-solid fa-circle'}"></i>
                    </button>
                    <div class="blacksmith-list-row-main puppeteer-part">
                        ${present ? this._editableHtml('memberLabel', member.label ?? '', kind, { 'group-id': group.id, type: member.type, id: member.id }) : `<span>${esc(kind)} (missing)</span>`}
                        <button type="button" class="puppeteer-id" data-action="copyUuid" data-uuid="${esc(`${scene.uuid}.${member.type}.${member.id}`)}"
                            data-tooltip="${esc(`${scene.uuid}.${member.type}.${member.id}`)} (click to copy)">${esc(member.id)}</button>
                    </div>
                    <div class="blacksmith-list-row-action">
                        ${canHide ? `<button type="button" class="blacksmith-tool-btn is-icon" data-action="toggleMemberHidden" data-group-id="${id}" data-type="${esc(member.type)}" data-id="${esc(member.id)}"
                            data-tooltip="${hiddenNow ? 'Show this part' : 'Hide this part'}"><i class="fa-solid fa-eye${hiddenNow ? '-slash' : ''}"></i></button>` : ''}
                        <button type="button" class="blacksmith-tool-btn is-icon is-danger" data-action="removeMember"
                            data-group-id="${id}" data-type="${esc(member.type)}" data-id="${esc(member.id)}"
                            data-tooltip="Remove from group"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                </div>`;
        }).join('');

        const counts = {};
        for (const member of group.members) counts[member.type] = (counts[member.type] ?? 0) + 1;
        const chips = Object.entries(counts).map(([type, count]) => `
            <button type="button" class="blacksmith-tool-btn" data-action="selectMembers"
                data-group-id="${id}" data-type="${esc(type)}" data-tooltip="Select these ${esc(TYPE_PLURAL[type] ?? type)} on the canvas">
                <i class="${TYPE_ICON[type] ?? 'fa-solid fa-circle'}"></i> ${esc(TYPE_PLURAL[type] ?? type)} ${count}
            </button>`).join('');

        return `
            <div class="puppeteer-card-body">
                <section class="blacksmith-tool-section"><header class="blacksmith-tool-section-head"><span class="blacksmith-tool-section-title">Parts</span></header>
                    ${chips ? `<div class="puppeteer-inline">${chips}</div>` : ''}
                    <div class="puppeteer-inline">
                        ${button('captureArea', 'fa-solid fa-vector-square', 'Capture Area')}
                        ${button('addSelected', 'fa-solid fa-plus', 'Add Selected')}
                        ${button('removeSelected', 'fa-solid fa-minus', 'Remove Selected')}
                    </div>
                    <div class="blacksmith-list">${members || '<div class="blacksmith-list-empty">No parts yet.</div>'}</div>
                </section>
                <section class="blacksmith-tool-section"><header class="blacksmith-tool-section-head"><span class="blacksmith-tool-section-title">Pivot and heading</span></header>
                    <div class="puppeteer-inline">
                        <label class="puppeteer-heading">Heading
                            <input type="number" data-field="heading" data-group-id="${id}" value="${Math.round(heading * 100) / 100}" min="0" max="360" step="1"${group.rotates === false ? ' disabled' : ''}>&deg;
                        </label>
                        ${step(-90, 'fa-solid fa-rotate-left')}${step(-15, 'fa-solid fa-rotate-left')}${step(15, 'fa-solid fa-rotate-right')}${step(90, 'fa-solid fa-rotate-right')}
                    </div>
                    <div class="puppeteer-inline">
                        ${button('recenterPivot', 'fa-solid fa-bullseye', 'Centre Pivot', 'Move the pin to the middle of the group without moving anything')}
                        <button type="button" class="blacksmith-tool-btn${group.movePivot ? ' is-active' : ''}" data-action="movePivot" data-group-id="${id}" data-tooltip="Put the grip anywhere: drag the pin once and only the pin moves. This switches itself off when you drop the pin."><i class="fa-solid fa-crosshairs"></i> ${group.movePivot ? 'Move Pivot: On' : 'Move Pivot'}</button>
                    </div>
                </section>
                <section class="blacksmith-tool-section"><header class="blacksmith-tool-section-head"><span class="blacksmith-tool-section-title">Body</span></header>
                    ${this._bodyHtml(scene, group)}
                </section>
                <section class="blacksmith-tool-section"><header class="blacksmith-tool-section-head"><span class="blacksmith-tool-section-title">Riders</span></header>
                    ${this._ridersHtml(scene, group)}
                </section>
                <section class="blacksmith-tool-section"><header class="blacksmith-tool-section-head"><span class="blacksmith-tool-section-title">Behaviour</span></header>
                    ${this._behaviourHtml(group)}
                </section>
                <div class="puppeteer-inline">
                    ${button('saveToLibrary', 'fa-solid fa-box-archive', 'Save to Library')}
                    ${button('exportGroup', 'fa-solid fa-file-export', 'Export')}
                </div>
            </div>`;
    }

    /** How the group behaves: how it eases, whether it turns with its pin, and whether its riders may wander. */
    _behaviourHtml(group) {
        const id = esc(group.id);
        const ease = easeOf(group);
        return `
                <div class="puppeteer-inline">
                    <span>Moves by</span>
                    <div class="blacksmith-tool-segmented" role="radiogroup" aria-label="Moves by" data-tooltip="How the group moves on screen when its pin moves or turns. Jumping shows no movement between the two places.">
                        <label class="blacksmith-tool-segment">
                            <input type="radio" name="ease-${id}" value="ease" data-field="easeMode" data-group-id="${id}"${ease.mode === 'ease' ? ' checked' : ''}>
                            <i class="fa-solid fa-wind"></i><span>Gliding</span>
                        </label>
                        <label class="blacksmith-tool-segment">
                            <input type="radio" name="ease-${id}" value="jump" data-field="easeMode" data-group-id="${id}"${ease.mode === 'jump' ? ' checked' : ''}>
                            <i class="fa-solid fa-forward-step"></i><span>Jumping</span>
                        </label>
                    </div>
                    <label class="puppeteer-field" data-tooltip="How long a glide takes, in milliseconds (100 to 3000).">
                        over <input type="number" data-field="easeMs" data-group-id="${id}" value="${ease.ms}" min="100" max="3000" step="50"${ease.mode === 'jump' ? ' disabled' : ''}> ms
                    </label>
                </div>
                <div class="blacksmith-tool-stack">
                ${this._toggleHtml('rotates', group.id, 'Turns when its pin turns', group.rotates !== false, 'Off, the group keeps the way it faces and only follows its pin about; turning the pin turns nothing.')}
                ${this._toggleHtml('announce', group.id, 'Announce boarding in chat', !!group.announce, 'Post a chat card, with a sound, when a token boards or leaves.')}
                ${this._toggleHtml('ridersFree', group.id, 'Riders can move about', group.ridersFree !== false, 'Off, a rider moved by hand is put back where it rides.')}
                </div>`;
    }

    /** The riders: tokens the group carries. They can be moved by hand inside it, and are let go when they leave. */
    _ridersHtml(scene, group) {
        const id = esc(group.id);
        const riders = (group.riders ?? []).map((rider) => {
            const token = scene.tokens.get(rider.tokenId);
            return `
                <div class="blacksmith-list-row">
                    <div class="blacksmith-list-row-main">
                        <div class="blacksmith-list-row-title"><i class="fa-solid fa-person-walking"></i> ${esc(token?.name ?? 'Missing token')}</div>
                    </div>
                    <div class="blacksmith-list-row-action">
                        <button type="button" class="blacksmith-tool-btn" data-action="dismount" data-group-id="${id}" data-token-id="${esc(rider.tokenId)}" data-tooltip="Let this token go. It stays where it is."><i class="fa-solid fa-person-walking-arrow-right"></i> Dismount</button>
                    </div>
                </div>`;
        }).join('');
        return `
                <div class="puppeteer-inline">
                    <span class="puppeteer-grow">${(group.riders ?? []).length} aboard</span>
                    <button type="button" class="blacksmith-tool-btn" data-action="boardSelected" data-group-id="${id}" data-tooltip="Put the selected tokens aboard. They must be on the group."><i class="fa-solid fa-person-walking-luggage"></i> Board Selected</button>
                </div>
                ${this._toggleHtml('mountable', group.id, 'Tokens board when they move onto it', !!group.mountable, 'A token that moves onto this group, or is dropped on it from the sidebar, boards it. Off, nothing boards unless you choose Board Selected.')}
                ${riders ? `<div class="blacksmith-list">${riders}</div>` : ''}`;
    }

    /** What the group is as a target: nothing, or an actor's token that covers it. */
    _bodyHtml(scene, group) {
        const id = esc(group.id);
        if (!group.body) {
            return `
                <div class="puppeteer-inline puppeteer-drop" data-drop-group="${id}">
                    <i class="fa-solid fa-user-shield"></i>
                    <span class="puppeteer-grow">Optional: drag an actor here to make the whole group one target that can be attacked, or</span>
                    <button type="button" class="blacksmith-tool-btn" data-action="adoptBody" data-group-id="${id}" data-tooltip="Use the selected token as the group's body: it is made transparent, locked and sized to cover the group">Use Selected Token</button>
                </div>`;
        }
        const token = bodyToken(scene, group);
        const actor = game.actors.get(group.body.actorId);
        const name = actor?.name ?? token?.name ?? 'an actor';
        return `
                <div class="puppeteer-inline puppeteer-drop" data-drop-group="${id}">
                    <i class="fa-solid fa-user-shield"></i>
                    <span class="puppeteer-grow">Represents <strong>${esc(name)}</strong>${token ? '' : ' (token missing)'}</span>
                    <button type="button" class="blacksmith-tool-btn is-icon" data-action="openBodyActor" data-group-id="${id}"${actor ? '' : ' disabled'} data-tooltip="Open the actor's sheet"><i class="fa-solid fa-id-card"></i></button>
                    <button type="button" class="blacksmith-tool-btn is-icon is-danger" data-action="clearBody" data-group-id="${id}" data-tooltip="Remove the body token. The group, its pin and its parts stay."><i class="fa-solid fa-xmark"></i></button>
                </div>
                ${this._toggleHtml('bodyLinked', group.id, 'Linked', !!token?.actorLink, 'Linked: one set of hit points shared by every token of this actor. Unlinked: this token has its own.', !token)}`;
    }

    // ---- actions ---------------------------------------------------------------------------------

    /** Redraw, unless a name is being typed: a redraw would take the field away mid-word. It redraws when it is done. */
    _redraw() {
        if (getBlacksmith().toolEditable.isEditing(this.element)) return;
        this.render();
    }

    /**
     * A name was changed through Blacksmith's editable label. It arrives as a `change` event on the label's root, which
     * carries the new value; the label's data attributes say what it was a name of. Saved as the field it replaced was.
     */
    async _onEditableChange(event) {
        const root = event.target;
        if (!(root instanceof HTMLElement) || !root.classList.contains('blacksmith-tool-editable')) return;
        event.stopPropagation();
        const stand = { value: event.detail?.value ?? '', checked: false, dataset: { ...root.dataset, field: root.dataset.editField } };
        await this._commitField(stand);
        this.render();
    }

    _commitField(input) {
        const scene = canvas.scene;
        const groupId = input.dataset.groupId;
        // A card opens and closes by itself; this only remembers which are open, so a redraw keeps them.
        if (input.dataset.field === 'cardOpen') {
            if (input.checked) expanded.add(groupId);
            else expanded.delete(groupId);
            return null;
        }
        if (input.dataset.field === 'updateSource') return null;
        return run('Update group', async () => {
            if (input.dataset.field === 'templateName') {
                try { await renameTemplate(input.dataset.templateId, input.value); } catch (error) { this.render(); throw error; }
                return this.render();
            }
            if (input.dataset.field === 'templateDescription') return setTemplateDescription(input.dataset.templateId, input.value);
            if (input.dataset.field === 'importFile') {
                const file = input.files?.[0];
                input.value = '';
                if (!file) return;
                const id = await importTemplate(await file.text());
                say('Template imported', `${getTemplate(id).name} is in the library.`);
                return this.render();
            }
            if (input.dataset.field === 'memberLabel') return renameMember(scene, groupId, input.dataset.type, input.dataset.id, input.value);
            if (input.dataset.field === 'mountable') return setMountable(scene, groupId, input.checked);
            if (input.dataset.field === 'easeMode') { await setBehaviour(scene, groupId, { ease: { mode: input.value } }); return this.render(); }
            if (input.dataset.field === 'easeMs') return setBehaviour(scene, groupId, { ease: { ms: Number(input.value) } });
            if (input.dataset.field === 'rotates') { await setBehaviour(scene, groupId, { rotates: input.checked }); return this.render(); }
            if (input.dataset.field === 'announce') return setBehaviour(scene, groupId, { announce: input.checked });
            if (input.dataset.field === 'ridersFree') return setBehaviour(scene, groupId, { ridersFree: input.checked });
            if (input.dataset.field === 'bodyLinked') return setBodyLinked(scene, groupId, input.checked);
            if (input.dataset.field === 'name') await renameGroup(scene, groupId, input.value);
            if (input.dataset.field === 'heading') await setHeading(scene, groupId, Number(input.value) || 0);
        });
    }

    _dropActor(event, groupId) {
        return run('Make group a target', async () => {
            const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
            if (data?.type !== 'Actor') {
                say('Drop an actor', 'Drag an actor from the Actors sidebar onto this row.');
                return;
            }
            const actor = await fromUuid(data.uuid);
            if (!actor) return;
            if (actor.pack) {
                say('Import the actor first', `${actor.name} is in a compendium. Import it to the world, then drop it here.`);
                return;
            }
            await setBody(canvas.scene, groupId, actor.id);
            say('Group is now a target', `Attacks and damage on this group go to ${actor.name}.`);
        });
    }

    _boardSelected(groupId) {
        return run('Board selected tokens', async () => {
            const tokens = canvas.tokens.controlled.map((placeable) => placeable.document);
            if (!tokens.length) {
                say('Select tokens', 'Select the tokens that should ride this group, then try again.');
                return;
            }
            const { mounted, skipped } = await mountTokens(canvas.scene, groupId, tokens);
            say(mounted ? 'Boarded' : 'Nobody boarded', `${mounted} aboard.${skipped.length ? ` Not boarded: ${skipped.join('; ')}.` : ''}`);
        });
    }

    _dismount(groupId, tokenId) {
        return run('Dismount', async () => {
            await dismountToken(canvas.scene, groupId, tokenId);
            this.render();
        });
    }

    _adoptBody(groupId) {
        return run('Use selected token as body', async () => {
            const controlled = canvas.tokens.controlled;
            if (controlled.length !== 1) {
                say('Select one token', 'Select the token that should be the group\'s body, then try again.');
                return;
            }
            const token = controlled[0].document;
            await adoptBody(canvas.scene, groupId, token);
            say('Group is now a target', `${token.name} is its body: transparent, locked, and sized to cover the group.`);
        });
    }

    _clearBody(groupId) {
        return run('Remove body', async () => {
            await clearBody(canvas.scene, groupId);
            say('Body removed', 'The body token is gone. The group, its pin and its parts are untouched.');
            this.render();
        });
    }

    _openBodyActor(groupId) {
        return run('Open actor', async () => {
            const group = listGroups(canvas.scene).find((g) => g.id === groupId);
            await game.actors.get(group?.body?.actorId)?.sheet.render({ force: true });
        });
    }

    _toggleGroupHidden(groupId) {
        return run('Hide or show group', async () => {
            const group = listGroups(canvas.scene).find((g) => g.id === groupId);
            const now = await setGroupHidden(canvas.scene, groupId, !group?.hidden);
            say(now ? 'Group hidden' : 'Group shown', now ? 'Its tiles, drawings, lights, sounds, regions and body are hidden. Walls and notes cannot be hidden.' : 'Everything it hid is shown again.');
            this.render();
        });
    }

    _toggleMemberHidden(groupId, type, id) {
        return run('Hide or show part', async () => {
            const doc = canvas.scene.getEmbeddedCollection(type).get(id);
            await setMemberHidden(canvas.scene, groupId, type, id, !doc?._source.hidden);
            this.render();
        });
    }

    _updateTemplate(templateId) {
        return run('Update library entry', async () => {
            const select = this.element.querySelector(`select[data-field="updateSource"][data-template-id="${CSS.escape(templateId)}"]`);
            const group = listGroups(canvas.scene).find((g) => g.id === select?.value);
            if (!group) {
                say('Choose a group', 'Pick the group on this scene to copy the entry from.');
                return;
            }
            const template = getTemplate(templateId);
            const confirmed = await getBlacksmith().dialog.confirm({
                title: 'Update Library Entry',
                content: `<p>Replace the parts of <strong>${esc(template?.name)}</strong> with those of <strong>${esc(group.name)}</strong>? Copies already placed on scenes are not changed.</p>`,
                confirmLabel: 'Update',
                confirmIcon: 'fa-solid fa-arrows-rotate'
            });
            if (!confirmed) return;
            await updateTemplateFromGroup(canvas.scene, group.id, templateId);
            say('Library entry updated', `${template?.name} now matches ${group.name}.`);
            this.render();
        });
    }

    _newGroup() {
        return run('Create group', async () => {
            const group = await createGroup(canvas.scene, { x: canvas.stage.pivot.x, y: canvas.stage.pivot.y }, { name: 'Group' });
            expanded.add(group.id);
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
        return run('Fabricate from library', async () => {
            const group = await stampTemplate(canvas.scene, templateId, { x: canvas.stage.pivot.x, y: canvas.stage.pivot.y });
            say('Fabricated', `${group.name} was placed at the centre of your view.`);
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

    _movePivot(groupId) {
        return run('Move pivot', async () => {
            const group = listGroups(canvas.scene).find((g) => g.id === groupId);
            const on = await setMovePivot(canvas.scene, groupId, !group?.movePivot);
            say(on ? 'Move Pivot is on' : 'Move Pivot is off', on ? 'Drag the pin to where the grip should be. Nothing else will move, and this switches off when you drop it.' : 'Dragging the pin moves the group again.');
            this.render();
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
        });
    }

    _removeMember(groupId, type, id) {
        return run('Remove member', () => removeMember(canvas.scene, groupId, type, id));
    }

    _selectMember(type, id, add) {
        return run('Select member', async () => {
            if (!selectMember(canvas.scene, type, id, { add })) say('Not on the canvas', 'That object is not on the scene in view.');
        });
    }

    _copyUuid(uuid) {
        return run('Copy UUID', async () => {
            await game.clipboard.copyPlainText(uuid);
            say('UUID copied', uuid);
        });
    }

    _setTab(id) {
        if (!TABS.includes(id) || id === tab) return;
        tab = id;
        try { localStorage.setItem(TAB_KEY, id); } catch { /* a remembered tab is a convenience */ }
        return this.render();
    }

    _syncAll() {
        return run('Update all groups', async () => {
            await syncAllGroups();
            say('Groups brought up to date', 'Every group\'s parts now match its pin.');
        });
    }

    _diagnose(groupId) {
        return run('Diagnose group', async () => {
            const report = diagnoseGroup(canvas.scene, groupId);
            const late = report.members.filter((m) => m.state !== 'in place').length;
            say('Diagnosis written to the console', late ? `${late} part${late === 1 ? ' is' : 's are'} out of place. Open the console (F12) to read it.` : 'Every part is in place. Open the console (F12) to read the report.');
        });
    }

    _deleteGroup(groupId) {
        return run('Delete group', async () => {
            const scene = canvas.scene;
            const group = listGroups(scene).find((g) => g.id === groupId);
            if (!group) return;
            const { dialog } = getBlacksmith();
            const parts = group.members.length;

            let removeMembers = false;
            if (parts === 0) {
                const confirmed = await dialog.confirm({
                    title: 'Delete Group',
                    content: `<p>Delete <strong>${esc(group.name)}</strong>? It has no parts.</p>`,
                    confirmLabel: 'Delete Group',
                    confirmIcon: 'fa-solid fa-trash',
                    destructive: true
                });
                if (!confirmed) return;
            } else {
                const { action, value } = await dialog.wait({
                    title: 'Delete Group',
                    content: `<p>Delete <strong>${esc(group.name)}</strong>? It holds ${parts} part${parts === 1 ? '' : 's'} (tiles, lights, walls, sounds, regions).</p>`,
                    buttons: [
                        { action: 'cancel', label: 'Cancel', icon: 'fa-solid fa-xmark', default: true },
                        { action: 'group', label: 'Delete group only', icon: 'fa-solid fa-link-slash' },
                        { action: 'all', label: `Delete group and ${parts} part${parts === 1 ? '' : 's'}`, icon: 'fa-solid fa-trash', destructive: true }
                    ],
                    closeValue: null
                });
                if (action !== dialog.ACTIONS.SUBMIT) return;
                if (value !== 'group' && value !== 'all') return;
                removeMembers = value === 'all';
            }

            const { removed } = await deleteGroup(scene, groupId, { removeMembers });
            say(removeMembers ? 'Group and parts deleted' : 'Group deleted', removeMembers ? `${removed} part${removed === 1 ? '' : 's'} removed from the scene.` : 'Its parts are still on the scene.');
            // Do not wait for a hook to notice: the list on screen is stale the moment the record is gone.
            this.render();
        });
    }
}
