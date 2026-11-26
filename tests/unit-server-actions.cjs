// A file that starts with 'use server' may export only async functions (and types). Exporting anything else, such as a list of
// constants, breaks `next build` ("A use server file can only export async functions") even though the type checker is happy,
// and it once stopped a deployment. This looks for it in every server action file.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let failures = 0;
const assert = (c, m) => { if (!c) { failures++; console.error('FAIL:', m); } else console.log('ok -', m); };

function* sources(dir) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sources(rel);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield rel;
  }
}

const serverFiles = [...sources('apps/web/src')].filter((f) => /^\s*(['"])use server\1/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
assert(serverFiles.length > 5, `found the server action files (${serverFiles.length})`);
for (const file of serverFiles) {
  const bad = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /^export\s+(const|let|var|class|enum|default|\{|\*)/.test(line) || /^export\s+(?!async\s+function|type\s|interface\s)function\s/.test(line));
  assert(bad.length === 0, `${file} exports only async functions and types${bad.length ? ` (line ${bad.map(([n]) => n).join(', ')})` : ''}`);
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll server action files are valid');
process.exit(failures ? 1 : 0);
