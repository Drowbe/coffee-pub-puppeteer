#!/usr/bin/env node
/*
 * check-scripts.mjs -- the checks `node --check` does not make.
 *
 * Foundry loads these files as ES modules in the browser, where a mistake only shows when the file is
 * first imported (for example, when a window opens). This catches the usual ones before then:
 *   - every file parses as an ES module (`node --check` alone treats .js as CommonJS and misses
 *     duplicate declarations),
 *   - no name is imported twice from one module,
 *   - every name imported from a sibling script is exported by it.
 *
 *   node tools/check-scripts.mjs
 *
 * Exits non-zero on any problem.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = path.join(ROOT, 'scripts');
const problems = [];

const files = fs.readdirSync(SCRIPTS).filter((f) => f.endsWith('.js'));

for (const file of files) {
    const full = path.join(SCRIPTS, file);
    const source = fs.readFileSync(full, 'utf8');

    const parsed = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: source, encoding: 'utf8' });
    if (parsed.status !== 0) {
        problems.push(`${file}: does not parse as an ES module\n${parsed.stderr.trim().split('\n').slice(0, 4).join('\n')}`);
        continue;
    }

    for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/([^']+)'/g)) {
        const [, list, target] = match;
        const targetPath = path.join(SCRIPTS, target);
        if (!fs.existsSync(targetPath)) {
            problems.push(`${file}: imports ./${target}, which does not exist`);
            continue;
        }
        const exported = fs.readFileSync(targetPath, 'utf8');
        const seen = new Set();
        for (const name of list.split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
            if (seen.has(name)) problems.push(`${file}: imports ${name} twice from ./${target}`);
            seen.add(name);
            const declared = new RegExp(`export\\s+(async\\s+)?(function|const|let|class)\\s+${name}\\b`);
            if (!declared.test(exported)) problems.push(`${file}: ./${target} does not export ${name}`);
        }
    }
}

if (problems.length) {
    console.error(`check-scripts: ${problems.length} problem(s)\n`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
}
console.log(`check-scripts: OK (${files.length} scripts)`);
