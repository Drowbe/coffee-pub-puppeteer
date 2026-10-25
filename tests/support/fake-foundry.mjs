// A small stand-in for the parts of Foundry and Blacksmith that Puppeteer's scene code talks to, so the
// real follower, group and pivot code can run under Node. It is deliberately close to the real thing where
// the real thing has caused trouble: flag writes are dotted paths that merge objects and replace arrays,
// hooks are started back to back and not awaited, and pins live in one scene flag.
import { setBlacksmith } from '../../scripts/blacksmith.js';

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);

function mergeInto(target, source) {
    for (const [key, value] of Object.entries(source)) {
        if (key.startsWith('-=')) { delete target[key.slice(2)]; continue; }
        if (isObject(value) && isObject(target[key])) mergeInto(target[key], value);
        else target[key] = structuredClone(value);
    }
}

// Foundry expands {'a.b.c': v} into {a: {b: {c: v}}}.
function expand(flat) {
    const out = {};
    for (const [path, value] of Object.entries(flat)) {
        const parts = path.split('.');
        let cursor = out;
        parts.slice(0, -1).forEach((part) => { cursor = cursor[part] ??= {}; });
        const last = parts.at(-1);
        if (isObject(cursor[last]) && isObject(value)) mergeInto(cursor[last], value);
        else cursor[last] = value;
    }
    return out;
}

const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

export function installFakes({ dropOptions = false } = {}) {
    const hooks = [];
    const HookManager = {
        registerHook(opts) { hooks.push(opts); return hooks.length; },
        disposeByContext() {}
    };
    const fire = (name, ...args) => {
        for (const hook of hooks.filter((h) => h.name === name)) {
            try {
                const result = hook.callback(...args);
                if (result?.catch) result.catch((e) => { throw e; });
            } catch (error) {
                console.error(`hook ${name} threw`, error);
                throw error;
            }
        }
    };

    const scene = {
        id: 'S1',
        name: 'Test Scene',
        flags: {},
        grid: { size: 100, sizeX: 100, sizeY: 100 },
        tokens: new Map(),
        collections: { Tile: new Map(), Drawing: new Map(), AmbientLight: new Map(), AmbientSound: new Map(), Wall: new Map(), Note: new Map(), Region: new Map() },
        getFlag(module, key) { return this.flags[module]?.[key]; },
        getEmbeddedCollection(type) { return this.collections[type]; },
        async update(flat) {
            const changes = expand(flat);
            mergeInto(this, changes);
            await Promise.resolve();
            fire('updateScene', this, changes, {}, 'u1');
            return this;
        },
        async updateEmbeddedDocuments(type, updates, options = {}) {
            for (const update of updates) {
                const doc = this.collections[type].get(update._id);
                const { _id, ...changes } = update;
                mergeInto(doc._source, changes);
                await Promise.resolve();
                fire(`update${type}`, doc, changes, dropOptions ? {} : options, 'u1');
            }
        },
        // A token as v14 stores it: x, y is the top-left of its footprint, width and height are in grid squares.
        addToken(id, data) {
            const scene = this;
            const doc = {
                id,
                name: data.name ?? id,
                documentName: 'Token',
                parent: scene,
                _source: structuredClone({ _id: id, width: 1, height: 1, rotation: 0, flags: {}, ...data }),
                getFlag(scope, key) { return this._source.flags?.[scope]?.[key]; },
                get actorId() { return this._source.actorId; },
                async update(flat, options = {}) {
                    // Foundry writes its own fields onto the options it is given (the parent, for one), so an options
                    // object that is frozen, or shared and meant to stay unchanged, fails there. Do the same.
                    options.parent = this.parent;
                    // A locked token refuses an ordinary move, as Foundry does; a teleport gets through.
                    if (this._source.locked && ('x' in flat || 'y' in flat) && !options.teleport) return this;
                    const changes = expand(flat);
                    mergeInto(this._source, changes);
                    await Promise.resolve();
                    fire('updateToken', this, changes, options, 'u1');
                    return this;
                },
                unsetFlag(scope, key) { return this.update({ [`flags.${scope}.-=${key}`]: null }); }
            };
            scene.tokens.set(id, doc);
            return doc;
        },
        async deleteEmbeddedDocuments(type, ids) {
            const docs = ids.map((id) => this.collections[type].get(id)).filter(Boolean);
            for (const doc of docs) this.collections[type].delete(doc.id);
            await Promise.resolve();
            for (const doc of docs) fire(`delete${type}`, doc, {}, 'u1');
            return docs;
        },
        async createEmbeddedDocuments(type, datas) {
            const make = (data) => {
                const id = Math.random().toString(36).slice(2, 18).padEnd(16, 'x');
                return type === 'Token' ? this.addToken(id, data) : this.add(type, id, data);
            };
            const docs = datas.map(make);
            await Promise.resolve();
            for (const doc of docs) fire(`create${type}`, doc, {}, 'u1');
            return docs;
        },
        add(type, id, data) {
            const doc = { id, name: data.name, documentName: type, parent: this, _source: structuredClone({ _id: id, ...data }) };
            this.collections[type].set(id, doc);
            return doc;
        }
    };

    // Tokens are an embedded collection of the scene like the rest.
    scene.collections.Token = scene.tokens;

    const FLAG = 'flags.coffee-pub-blacksmith.pins';
    const list = () => scene.flags['coffee-pub-blacksmith']?.pins ?? [];
    const pins = {
        async create(data) { const pin = structuredClone(data); await scene.update({ [FLAG]: [...list(), pin] }); return structuredClone(pin); },
        get(id) { const pin = list().find((p) => p.id === id); return pin ? structuredClone(pin) : null; },
        exists(id) { return list().some((p) => p.id === id); },
        async update(id, patch) { await scene.update({ [FLAG]: list().map((p) => (p.id === id ? { ...p, ...patch } : p)) }); },
        async delete(id) { await scene.update({ [FLAG]: list().filter((p) => p.id !== id) }); },
        async panTo() { return true; },
        // Handlers, so a test can play the part of Blacksmith reporting a drag.
        handlers: [],
        on(type, handler, options) { this.handlers.push({ type, handler, options }); return () => {}; },
        registerPinType() {}, registerPinTaxonomy() {}, registerContextMenuItem() {}
    };

    globalThis.foundry = {
        utils: {
            deepClone: (v) => structuredClone(v),
            randomID: () => Math.random().toString(36).slice(2, 18).padEnd(16, 'x'),
            hasProperty: (obj, path) => getPath(obj, path) !== undefined,
            escapeHTML: (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        }
    };
    globalThis.game = {
        user: { id: 'u1', isGM: true },
        scenes: [scene],
        settings: { register() {} },
        // Actors a test can add; `getTokenDocument` is what Foundry gives an actor, returning something with `toObject()`.
        actors: new Map(),
        users: { activeGM: { isSelf: true } },
        modules: new Map([['coffee-pub-puppeteer', { version: 'test' }]])
    };
    globalThis.canvas = { scene, stage: { pivot: { x: 0, y: 0 } } };

    const settings = new Map();
    // What Blacksmith plays and posts, kept so a test can look.
    const sounds = [];
    const cards = [];
    globalThis.BlacksmithConstants = { SOUNDBUTTON01: 'button-01', SOUNDBUTTON02: 'button-02', SOUNDVOLUMESOFT: '0.5' };
    setBlacksmith({
        HookManager,
        pins,
        utils: {
            postConsoleAndNotification() {},
            playSound: (sound, volume, loop, broadcast) => { sounds.push({ sound, volume, loop, broadcast }); },
            getSettingSafely: (module, key, fallback) => (settings.has(`${module}.${key}`) ? structuredClone(settings.get(`${module}.${key}`)) : fallback),
            setSettingSafely: async (module, key, value) => { settings.set(`${module}.${key}`, structuredClone(value)); }
        },
        toast: { show() {}, registerChannel() {} },
        chatCards: { post: async (card) => { cards.push(card); return card; } },
        updateMenubarToolActive() {}
    });

    // Let everything queued (hooks, the follower's chain, flag writes) run to the end.
    const settle = async () => { for (let i = 0; i < 60; i += 1) await new Promise((r) => setImmediate(r)); };

    // A stand-in for the canvas animation ticker, advanced by hand, and a clock that moves only when told to.
    const ticker = {
        fns: new Set(),
        add(fn) { this.fns.add(fn); },
        remove(fn) { this.fns.delete(fn); },
        run() { for (const fn of [...this.fns]) fn(); }
    };
    globalThis.canvas.app = { ticker };
    globalThis.PIXI = { UPDATE_PRIORITY: { LOW: -25 } };
    const emitPin = (type, event) => pins.handlers.filter((h) => h.type === type).forEach((h) => h.handler(event));

    return { scene, pins, hooks, fire, settle, ticker, emitPin, sounds, cards };
}
