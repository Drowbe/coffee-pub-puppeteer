#!/usr/bin/env node
/*
 * check-blacksmith-only.mjs -- enforce the hard-dependency rule.
 *
 * Blacksmith is a hard dependency of Puppeteer. Anything Blacksmith provides goes through Blacksmith, with no
 * fallback to the Foundry call underneath. This fails on the core calls that Blacksmith replaces.
 *
 *   node tools/check-blacksmith-only.mjs
 *
 * Exits non-zero on any violation. Comments are ignored, so a comment may name a forbidden call to explain
 * why it is not used. Errors and warnings may use console.error and console.warn, as Blacksmith's logging
 * guide says; console.log and console.info are Blacksmith's logger's job.
 *
 * To allow one use, add it to ALLOWED with the reason. The reason is the point: an exception nobody can
 * explain is how a hard dependency turns into a soft one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = path.join(ROOT, 'scripts');

const FORBIDDEN = [
    { rule: /\bHooks\.(on|once|call|callAll)\s*\(/, use: 'BlacksmithHookManager.registerHook' },
    { rule: /\bgame\.socket\b/, use: 'api.sockets (events) or api.gmRequest (asking a GM to act)' },
    { rule: /\bui\.notifications\b/, use: 'api.toast.show, or postConsoleAndNotification with the notification flag' },
    { rule: /\bAudioHelper\b|\bfoundry\.audio\b/, use: 'utils.playSound' },
    { rule: /\bChatMessage\.create\b/, use: 'api.chatCards.post' },
    { rule: /\bnew\s+Dialog\s*\(|\bDialog\.(confirm|prompt|wait)\b|\bDialogV2\b/, use: 'api.dialog' },
    { rule: /\bconsole\.(log|info|debug)\s*\(/, use: 'utils.postConsoleAndNotification' }
];

// file name -> [{ rule source text, reason }]
const ALLOWED = {
    'puppeteer.js': [
        {
            rule: String(FORBIDDEN[0].rule),
            only: /Hooks\.once\(\s*'ready'/,
            reason: 'A module reaches Blacksmith\'s ready signal through Foundry\'s own ready hook; nothing in Blacksmith exists to wait on before it.'
        }
    ]
};

const stripComments = (text) => text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => line.replace(/(^|[^:'"`\\])\/\/.*$/, '$1'))
    .join('\n');

const problems = [];
for (const file of fs.readdirSync(SCRIPTS).filter((f) => f.endsWith('.js'))) {
    const lines = stripComments(fs.readFileSync(path.join(SCRIPTS, file), 'utf8')).split('\n');
    lines.forEach((line, i) => {
        for (const { rule, use } of FORBIDDEN) {
            if (!rule.test(line)) continue;
            const allowed = (ALLOWED[file] ?? []).some((a) => a.rule === String(rule) && a.only.test(line));
            if (!allowed) problems.push(`${file}:${i + 1} -- ${line.trim()}\n      use ${use}`);
        }
    });
}

if (problems.length) {
    console.error(`check-blacksmith-only: ${problems.length} violation(s)\n`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
}
console.log('check-blacksmith-only: OK');
