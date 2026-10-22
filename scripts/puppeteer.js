// Entry point. The one native hook: it is how a module reaches Blacksmith's ready signal at all.
// Everything else registers through Blacksmith once bootstrap has succeeded.
// See documentation/plans/plan-puppeteer-groups.md.
import { bootstrap } from './bootstrap.js';

Hooks.once('ready', async () => {
    const blacksmith = await bootstrap();
    if (!blacksmith) return;
});
