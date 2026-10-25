// THROWAWAY probe for the body-token design. Paste into a Script macro and run as GM on a scene.
// It changes the scene (adds one token) and writes one small PNG under modules/coffee-pub-puppeteer/probe/.
// Run it, read the console table, then do the manual checks it prints. Run `puppeteerProbe.cleanup()` when done.
//
// Answers: can a large, fractional, transparent, locked token be made; does `locked` stop programmatic
// moves; do plain / teleport / move() displace moves differ in recorded movement history; is it targetable.
(async () => {
    const scene = canvas.scene;
    if (!game.user.isGM || !scene) return ui.notifications.error('Run as GM on a scene.');
    const results = [];
    const note = (check, value) => { results.push({ check, value: typeof value === 'string' ? value : JSON.stringify(value) }); };
    const grid = scene.grid.size;

    // ---- a transparent image, uploaded once --------------------------------------------------------
    const FP = foundry.applications.apps.FilePicker.implementation;
    const dir = 'modules/coffee-pub-puppeteer/probe';
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0));
    let src = `${dir}/transparent.png`;
    try { await FP.createDirectory('data', dir); } catch { /* exists */ }
    try {
        await FP.upload('data', dir, new File([png], 'transparent.png', { type: 'image/png' }), {}, { notify: false });
        note('transparent png uploaded', src);
    } catch (e) { note('transparent png upload FAILED', e.message); }

    // ---- an actor to stand in for the group's actor ------------------------------------------------
    const actor = canvas.tokens.controlled[0]?.actor ?? game.actors.find((a) => a.type !== 'character') ?? game.actors.contents[0];
    if (!actor) return ui.notifications.error('Make an actor first.');
    note('actor', actor.name);

    // ---- 1. big, fractional, transparent, locked, created in one go --------------------------------
    const centre = canvas.stage.pivot;
    const data = {
        name: 'PROBE body', actorId: actor.id, actorLink: false,
        x: Math.round(centre.x), y: Math.round(centre.y),
        width: 6.5, height: 3.5,
        texture: { src }, locked: true, sight: { enabled: false }, displayName: 0
    };
    let doc;
    try {
        [doc] = await scene.createEmbeddedDocuments('Token', [data]);
        note('create 6.5 x 3.5 transparent locked', { width: doc.width, height: doc.height, locked: doc.locked, shape: doc.shape });
    } catch (e) { return note('create FAILED', e.message), console.table(results); }
    globalThis.puppeteerProbe = {
        doc,
        async cleanup() { await scene.deleteEmbeddedDocuments('Token', [doc.id]); delete globalThis.puppeteerProbe; }
    };
    await new Promise((r) => setTimeout(r, 400));
    const obj = doc.object;
    note('drawn footprint px (w x h) vs grid', { w: obj?.w, h: obj?.h, expected: [6.5 * grid, 3.5 * grid] });
    note('hit area', obj?.hitArea ? { x: obj.hitArea.x, y: obj.hitArea.y, w: obj.hitArea.width, h: obj.hitArea.height } : 'none');

    // ---- 2. does `locked` stop programmatic moves? -------------------------------------------------
    const historyLen = () => doc.movementHistory?.length ?? 'n/a';
    const snap = () => ({ x: doc._source.x, y: doc._source.y, history: historyLen() });
    note('start', snap());

    await doc.update({ x: doc._source.x + grid * 3 });
    await new Promise((r) => setTimeout(r, 900));
    note('plain update x+3 squares on a locked token', snap());

    await doc.update({ x: doc._source.x + grid * 3 }, { teleport: true, animate: false });
    await new Promise((r) => setTimeout(r, 400));
    note('update with teleport:true', { ...snap(), lastAction: doc.movement?.passed?.waypoints?.at(-1)?.action ?? 'n/a' });

    try {
        await doc.move([{ x: doc._source.x + grid * 3, y: doc._source.y, action: 'displace' }],
            { constrainOptions: { ignoreWalls: true, ignoreCost: true } });
        await new Promise((r) => setTimeout(r, 900));
        note('move() with action displace, walls and cost ignored', { ...snap(), lastAction: doc.movement?.passed?.waypoints?.at(-1)?.action ?? 'n/a' });
    } catch (e) { note('move() displace FAILED', e.message); }

    // ---- 3. targeting ------------------------------------------------------------------------------
    try {
        obj?.setTarget(true, { releaseOthers: true, groupSelection: false });
        note('programmatic target', { targeted: game.user.targets.has(obj) });
        obj?.setTarget(false);
    } catch (e) { note('target FAILED', e.message); }

    console.table(results);
    console.log('PROBE manual checks (the token is on the map, centre of your view):\n' +
        ' 1. Hover it: what does the border look like over the transparent token?\n' +
        ' 2. Click it, then press T to target it. Does the target marker show?\n' +
        ' 3. Try to drag it. Is the drag refused and is a warning shown (this is the locked behaviour)?\n' +
        ' 4. Double-click: does the actor sheet open?\n' +
        ' 5. Roll an attack from another token at it (or target and apply damage): does it work?\n' +
        ' 6. Is it easy to click a tile or light BENEATH it? Does it get in the way of selecting other objects?\n' +
        ' 7. Add it to a combat: does moving it (puppeteerProbe.doc.move) change anything?\n' +
        'When finished: await puppeteerProbe.cleanup()');
    ui.notifications.info('Probe done: see the console table and manual checks (F12).');
})();
