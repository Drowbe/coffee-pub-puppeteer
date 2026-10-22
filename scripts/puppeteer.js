// Entry point. Nothing is built yet; see documentation/plans/plan-puppeteer-groups.md.
export const MODULE_ID = 'coffee-pub-puppeteer';

Hooks.once('ready', () => {
    console.log(`${MODULE_ID} | ready (scaffold only)`);
});
