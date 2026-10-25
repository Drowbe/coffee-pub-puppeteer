// Run with: node --test tests/*.test.mjs
// The menubar carries one Puppeteer button, in the middle zone, that opens a bar below it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakes } from './support/fake-foundry.mjs';

async function register() {
    installFakes();
    const { getBlacksmith } = await import('../scripts/blacksmith.js');
    const api = getBlacksmith();
    const calls = { tools: [], toolbar: [], bars: [], items: [], links: [], toggled: [] };
    api.registerWindow = () => true;
    api.registerToolbarTool = (id, data) => { calls.toolbar.push({ id, data }); return true; };
    api.registerMenubarTool = (id, data) => { calls.tools.push({ id, data }); return true; };
    api.registerSecondaryBarType = async (id, config) => { calls.bars.push({ id, config }); return true; };
    api.registerSecondaryBarItem = (bar, id, data) => { calls.items.push({ bar, id, data }); return true; };
    api.registerSecondaryBarTool = (bar, tool) => { calls.links.push({ bar, tool }); };
    api.toggleSecondaryBar = (id) => { calls.toggled.push(id); return true; };
    const { registerUi } = await import('../scripts/ui.js');
    await registerUi();
    return calls;
}

test('there is one menubar button, in the middle zone, beside the other Coffee Pub tools', async () => {
    const { tools } = await register();
    assert.equal(tools.length, 1);
    const { data } = tools[0];
    assert.equal(data.zone, 'middle');
    assert.equal(data.group, 'utility');
    assert.equal(data.title, 'Puppeteer');
    assert.equal(data.gmOnly, true);
    assert.equal(data.toggleable, true);
});

test('the button opens a bar, and the bar is linked to it so the button lights while it is open', async () => {
    const calls = await register();
    calls.tools[0].data.onClick();
    assert.deepEqual(calls.toggled, ['coffee-pub-puppeteer']);
    assert.deepEqual(calls.links, [{ bar: 'coffee-pub-puppeteer', tool: calls.tools[0].id }]);
    assert.equal(calls.bars.length, 1);
    assert.equal(calls.bars[0].id, 'coffee-pub-puppeteer');
});

test('the bar holds the editor, a new group, updating, and the bounds switch, all in the middle', async () => {
    const { items } = await register();
    assert.deepEqual(items.map((i) => i.id), ['editor', 'new-group', 'update-all', 'bounds']);
    assert.ok(items.every((i) => i.data.zone === 'middle'));
    assert.ok(items.every((i) => typeof i.data.onClick === 'function'));
    const bounds = items.find((i) => i.id === 'bounds');
    assert.equal(bounds.data.toggleable, true);
    assert.equal(bounds.data.group, 'view');
});

test('nothing of Puppeteer is placed in the left zone', async () => {
    const calls = await register();
    for (const { data } of calls.tools) assert.notEqual(data.zone, 'left');
    for (const { data } of calls.items) assert.notEqual(data.zone, 'left');
});
