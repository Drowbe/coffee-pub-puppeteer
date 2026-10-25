// The Group Editor: every group on the scene in view, its members, its heading, and the actions on them.
// Loaded on demand by the window registry (see ui.js), so a Blacksmith failure cannot stop the module's
// scripts from loading.
import { BlacksmithToolWindowBaseV2 } from '/modules/coffee-pub-blacksmith/api/blacksmith-api.js';
import { MODULE_ID, MODULE_NAME } from './constants.js';
import { getBlacksmith } from './blacksmith.js';
import {
    createGroup, createTokenGroup, attachToToken, detachToPin, captureArea, recenterPivot, exportGroup, addSelected, removeSelected, renameMember, removeMember, selectMembers, renameGroup,
    setHeading, rotateBy, deleteGroup, listGroups, diagnoseGroup, selectMember, setBody, adoptBody, clearBody, setBodyLinked
} from './groups.js';
import { bodyToken } from './body.js';
import { boundsShown, toggleBounds } from './overlay.js';
import { syncAllGroups } from './follower.js';
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

// Which tab is showing. Remembered for the session and across reloads, per user.
const TAB_KEY = `${MODULE_ID}.editorTab`;
const TABS = ['groups', 'library', 'tools'];
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
        setTab: (event, target, win) => win._setTab(target.dataset.tab),
        copyUuid: (event, target, win) => win._copyUuid(target.dataset.uuid),
        selectMember: (event, target, win) => win._selectMember(target.dataset.type, target.dataset.id, event.shiftKey),
        syncAll: (event, target, win) => win._syncAll(),
        diagnose: (event, target, win) => win._diagnose(target.dataset.groupId),
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
        removeMember: (event, target, win) => win._removeMember(target.dataset.groupId, target.dataset.type, target.dataset.id),
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
        // An actor dragged from the sidebar onto a group's body row becomes the group's body.
        for (const zone of this.element.querySelectorAll('[data-drop-group]')) {
            zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('is-over'); });
            zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
            zone.addEventListener('drop', (event) => { event.preventDefault(); zone.classList.remove('is-over'); this._dropActor(event, zone.dataset.dropGroup); });
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
            groups: `<button type="button" class="puppeteer-btn puppeteer-btn-primary" data-action="newGroup"><i class="fa-solid fa-plus"></i> New Group</button>
                <button type="button" class="puppeteer-btn" data-action="newTokenGroup" data-tooltip="Make a group that follows the selected token, such as a cart or a ship"><i class="fa-solid fa-horse"></i> On Selected Token</button>`,
            library: `<button type="button" class="puppeteer-btn" data-action="importTemplate"><i class="fa-solid fa-file-import"></i> Import</button>
                <input type="file" accept="application/json,.json" data-field="importFile" hidden>`,
            tools: ''
        }[tab];
        const body = {
            groups: () => this._groupsHtml(scene, groups),
            library: () => this._libraryHtml(library),
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
            <button type="button" class="puppeteer-tab${tab === id ? ' is-active' : ''}" data-action="setTab" data-tab="${id}">
                <i class="${icon}"></i> ${label}${count === null ? '' : ` <span class="puppeteer-tab-count">${count}</span>`}
            </button>`;
        return `<nav class="puppeteer-tabs">${button('groups', 'fa-solid fa-up-down-left-right', 'Groups', groupCount)}${button('library', 'fa-solid fa-boxes-stacked', 'Library', libraryCount)}${button('tools', 'fa-solid fa-screwdriver-wrench', 'Tools', null)}</nav>`;
    }

    _groupsHtml(scene, groups) {
        if (!scene) return '<p class="puppeteer-empty">There is no scene in view.</p>';
        if (!groups.length) {
            return `<p class="puppeteer-empty">No groups on <strong>${esc(scene.name)}</strong>. Choose <strong>New Group</strong>, select some tiles, lights, sounds, walls, drawings, notes or regions on the canvas, then choose <strong>Add Selected</strong> on the group. Or select a token and choose <strong>On Selected Token</strong> to make a group that follows it.</p>`;
        }
        return groups.map((group) => this._groupHtml(scene, group)).join('');
    }

    _libraryHtml(templates) {
        const rows = templates.map((template) => `
            <li class="puppeteer-template">
                <i class="fa-solid fa-cubes"></i>
                <span class="puppeteer-template-name">${esc(template.name)} <span class="puppeteer-template-count">${template.members} member${template.members === 1 ? '' : 's'}${template.actor ? `, represents ${esc(template.actor)}` : ''}</span></span>
                <button type="button" class="puppeteer-btn puppeteer-btn-primary" data-action="stampTemplate" data-template-id="${esc(template.id)}" data-tooltip="Place a copy at the centre of your view"><i class="fa-solid fa-stamp"></i> Stamp</button>
                <button type="button" class="puppeteer-btn" data-action="exportTemplate" data-template-id="${esc(template.id)}" data-tooltip="Save as a JSON file"><i class="fa-solid fa-file-export"></i></button>
                <button type="button" class="puppeteer-btn puppeteer-btn-critical" data-action="deleteTemplate" data-template-id="${esc(template.id)}" data-tooltip="Remove from the library"><i class="fa-solid fa-trash"></i></button>
            </li>`).join('');
        return `
        <section class="puppeteer-panel">
            <p>Saved copies of groups. A template is not tied to any scene: <strong>Stamp</strong> puts a fresh, independent copy on this scene, as many times as you like. Make one with <strong>Save to Library</strong> on a group.</p>
            <ul>${rows || '<li class="puppeteer-member-none">Nothing saved yet.</li>'}</ul>
        </section>`;
    }

    _toolsHtml(scene, groups) {
        const rows = groups.map((group) => `
            <li class="puppeteer-template">
                <i class="${group.anchor.type === 'token' ? 'fa-solid fa-horse' : 'fa-solid fa-thumbtack'}"></i>
                <span class="puppeteer-template-name">${esc(group.name)} <span class="puppeteer-template-count">${group.members.length} member${group.members.length === 1 ? '' : 's'}, on a ${group.anchor.type}</span></span>
                <button type="button" class="puppeteer-btn" data-action="diagnose" data-group-id="${esc(group.id)}" data-tooltip="Write where this group's anchor and every part is, against where it should be, to the browser console (F12)"><i class="fa-solid fa-stethoscope"></i> Diagnose</button>
            </li>`).join('');
        const puppeteer = game.modules.get(MODULE_ID);
        const blacksmith = game.modules.get('coffee-pub-blacksmith');
        return `
        <section class="puppeteer-panel">
            <h3>Bring groups up to date</h3>
            <p>Move every group's parts to where its pin or token is now. This happens by itself while a GM is connected; use it after a token moved while no GM was online and you want to be sure.</p>
            <button type="button" class="puppeteer-btn" data-action="syncAll"><i class="fa-solid fa-rotate"></i> Update all groups</button>
        </section>
        <section class="puppeteer-panel">
            <h3>Diagnosis</h3>
            <p>If a group is not where you expect, a report of where its anchor and every part is, against where it should be, goes to the browser console (F12).</p>
            <ul>${rows || `<li class="puppeteer-member-none">No groups on ${esc(scene?.name ?? 'this scene')}.</li>`}</ul>
        </section>
        <section class="puppeteer-panel">
            <h3>About</h3>
            <p>Puppeteer ${esc(puppeteer?.version)} on Blacksmith ${esc(blacksmith?.version)} (API ${esc(blacksmith?.api?.version)}).</p>
            <p>Show or hide the group bounds with the dotted-box icon in this window's title bar.</p>
        </section>`;
    }

    _groupHtml(scene, group) {
        const id = esc(group.id);
        const step = (degrees, icon) => `
            <button type="button" class="puppeteer-btn puppeteer-step" data-action="rotate"
                data-group-id="${id}" data-degrees="${degrees}"
                data-tooltip="Rotate ${Math.abs(degrees)}° ${degrees < 0 ? 'counter-clockwise' : 'clockwise'}">
                <i class="${icon}"></i> ${Math.abs(degrees)}
            </button>`;
        const button = (action, icon, label, tooltip = '') => `
            <button type="button" class="puppeteer-btn" data-action="${action}" data-group-id="${id}"${tooltip ? ` data-tooltip="${esc(tooltip)}"` : ''}>
                <i class="${icon}"></i> ${label}
            </button>`;

        const members = group.members.map((member) => {
            const present = !!scene.getEmbeddedCollection(member.type).get(member.id);
            const kind = `${TYPE_LABEL[member.type] ?? member.type} ${member.id.slice(0, 6)}`;
            return `
                <li class="puppeteer-member${present ? '' : ' puppeteer-member-missing'}">
                    <button type="button" class="puppeteer-member-select" data-action="selectMember" data-type="${esc(member.type)}" data-id="${esc(member.id)}"
                        data-tooltip="Select this ${esc((TYPE_LABEL[member.type] ?? member.type).toLowerCase())} on the canvas (Shift to add to the selection)"${present ? '' : ' disabled'}>
                        <i class="${TYPE_ICON[member.type] ?? 'fa-solid fa-circle'}"></i>
                    </button>
                    <input type="text" class="puppeteer-member-name" data-field="memberLabel" data-group-id="${id}"
                        data-type="${esc(member.type)}" data-id="${esc(member.id)}"
                        value="${esc(member.label ?? '')}" placeholder="${esc(kind)}"${present ? '' : ' disabled'}>
                    ${present ? '' : '<span class="puppeteer-member-gone">missing</span>'}
                    <button type="button" class="puppeteer-member-id" data-action="copyUuid" data-uuid="${esc(`${scene.uuid}.${member.type}.${member.id}`)}"
                        data-tooltip="${esc(`${scene.uuid}.${member.type}.${member.id}`)} (click to copy)">${esc(member.id)}</button>
                    <button type="button" class="puppeteer-member-remove" data-action="removeMember"
                        data-group-id="${id}" data-type="${esc(member.type)}" data-id="${esc(member.id)}"
                        data-tooltip="Remove from group"><i class="fa-solid fa-xmark"></i></button>
                </li>`;
        }).join('');

        const counts = {};
        for (const member of group.members) counts[member.type] = (counts[member.type] ?? 0) + 1;
        const chips = Object.entries(counts).map(([type, count]) => `
            <button type="button" class="puppeteer-btn puppeteer-chip" data-action="selectMembers"
                data-group-id="${id}" data-type="${esc(type)}" data-tooltip="Select these ${esc(TYPE_PLURAL[type] ?? type)} on the canvas">
                <i class="${TYPE_ICON[type] ?? 'fa-solid fa-circle'}"></i> ${esc(TYPE_PLURAL[type] ?? type)} ${count}
            </button>`).join('');
        const onToken = group.anchor.type === 'token';
        const lost = !anchorExists(scene, group);
        const warning = lost
            ? `<div class="puppeteer-warning"><i class="fa-solid fa-triangle-exclamation"></i> This group has lost its ${onToken ? 'token' : 'pin'}, so it cannot be moved. Delete the group and make a new one.</div>`
            : '';
        const heading = anchorState(scene, group)?.heading ?? group.heading;
        const bodyRow = this._bodyHtml(scene, group);

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
                <button type="button" class="puppeteer-btn puppeteer-btn-critical" data-action="deleteGroup" data-group-id="${id}">
                    <i class="fa-solid fa-trash"></i> Delete
                </button>
            </div>
            ${bodyRow}
            <details class="puppeteer-group-members" data-group-id="${id}"${expanded.has(group.id) ? ' open' : ''}>
                <summary>Members</summary>
                <ul>${members || '<li class="puppeteer-member-none">No members yet.</li>'}</ul>
            </details>
        </section>`;
    }

    /** The row that says what the group is as a target: nothing, or an actor's token that covers it. */
    _bodyHtml(scene, group) {
        const id = esc(group.id);
        if (!group.body) {
            return `
            <div class="puppeteer-group-row puppeteer-body puppeteer-drop" data-drop-group="${id}">
                <i class="fa-solid fa-user-shield"></i>
                <span class="puppeteer-body-text">Optional: drag an actor here to make the whole group one target that can be attacked, or</span>
                <button type="button" class="puppeteer-btn" data-action="adoptBody" data-group-id="${id}" data-tooltip="Use the selected token as the group's body: it is made transparent, locked and sized to cover the group">Use Selected Token</button>
            </div>`;
        }
        const token = bodyToken(scene, group);
        const actor = game.actors.get(group.body.actorId);
        const name = actor?.name ?? token?.name ?? 'an actor';
        return `
            <div class="puppeteer-group-row puppeteer-body puppeteer-drop" data-drop-group="${id}">
                <i class="fa-solid fa-user-shield"></i>
                <span class="puppeteer-body-text">Represents <strong>${esc(name)}</strong>${token ? '' : ' <span class="puppeteer-member-gone">token missing</span>'}</span>
                <label class="puppeteer-body-linked" data-tooltip="Linked: one set of hit points shared by every token of this actor. Unlinked: this token has its own.">
                    <input type="checkbox" data-field="bodyLinked" data-group-id="${id}"${token?.actorLink ? ' checked' : ''}${token ? '' : ' disabled'}> Linked
                </label>
                <button type="button" class="puppeteer-btn" data-action="openBodyActor" data-group-id="${id}"${actor ? '' : ' disabled'} data-tooltip="Open the actor's sheet"><i class="fa-solid fa-id-card"></i></button>
                <button type="button" class="puppeteer-btn puppeteer-btn-critical" data-action="clearBody" data-group-id="${id}" data-tooltip="Remove the body token. The group, its pin and its parts stay."><i class="fa-solid fa-xmark"></i></button>
            </div>`;
    }

    // ---- actions ---------------------------------------------------------------------------------

    _commitField(input) {
        const scene = canvas.scene;
        const groupId = input.dataset.groupId;
        return run('Update group', async () => {
            if (input.dataset.field === 'importFile') {
                const file = input.files?.[0];
                input.value = '';
                if (!file) return;
                const id = await importTemplate(await file.text());
                say('Template imported', `${getTemplate(id).name} is in the library.`);
                return this.render();
            }
            if (input.dataset.field === 'memberLabel') return renameMember(scene, groupId, input.dataset.type, input.dataset.id, input.value);
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
            say('Groups brought up to date', 'Every group\'s parts now match its pin or token.');
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
