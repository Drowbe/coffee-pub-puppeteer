// The Blacksmith API handle. Set once by bootstrap, read everywhere else. Kept apart from bootstrap so
// code that only needs the handle does not pull in Blacksmith's bridge module, which also lets that code
// run under Node in the tests with a stand-in handle.
import { MODULE_ID } from './constants.js';

let api = null;

export function setBlacksmith(value) {
    api = value;
}

/** The Blacksmith API, once bootstrap has succeeded. Throws before that, so a missed call site is loud. */
export function getBlacksmith() {
    if (!api) throw new Error(`${MODULE_ID}: Blacksmith is not available; bootstrap has not completed.`);
    return api;
}
