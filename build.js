#!/usr/bin/env node
/*
 * build.js — reassembles src/ into dist/index.html, the single self-contained
 * file that gets published as the Scriptorium artifact.
 *
 *   node build.js            build dist/index.html
 *   node build.js --check    build and compare against dist/index.html, no write
 *
 * The split under src/ exists so changes are reviewable in a diff. It is a
 * concatenation, not a module system: every file in src/app is pasted, in the
 * order given by src/app/manifest.json, into one shared function scope. A
 * function defined in one file is visible in all of them.
 */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const appDir = path.join(root, 'src', 'app');

function read(p) { return fs.readFileSync(p, 'utf8'); }

// Each module file opens with a one-line `/* name — blurb */` banner that is
// for readers of the repo, not for the browser. Drop it, and the trailing
// newline the file ends with.
function moduleBody(file) {
  const text = read(path.join(appDir, file));
  const firstBreak = text.indexOf('\n');
  return text.slice(firstBreak + 1).replace(/\n$/, '');
}

const manifest = JSON.parse(read(path.join(appDir, 'manifest.json')));
const app = manifest.map(moduleBody).join('\n');
const styles = read(path.join(root, 'src', 'styles.css')).replace(/\n$/, '');
const seed = JSON.stringify(JSON.parse(read(path.join(root, 'src', 'seed-state.json'))));

const html = read(path.join(root, 'src', 'shell.html'))
  .replace('{{STYLES}}', () => styles)
  .replace('{{SEED}}', () => seed)
  .replace('{{APP}}', () => app);

// The tests load the modules' own text, banner line and all, so none of them would notice a page that
// does not parse once it is assembled: a banner that runs on to a second line, or a module that closes a
// brace too many. Every script in the assembled page is parsed here, on a build and on --check alike.
// Nothing is run. A page that does not parse is never written.
(function mustParse() {
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    if (/type="application\/json"|\ssrc=/.test(m[1])) continue;
    try { new Function(m[2]); }
    catch (err) {
      console.error('The assembled page does not parse: ' + err.message + '. Check that each module\'s banner comment is one line.');
      process.exit(1);
    }
  }
  manifest.forEach(function (file) {
    const first = read(path.join(appDir, file)).split('\n')[0];
    if (!/^\/\*.*\*\/\s*$/.test(first)) { console.error(file + ': the first line must be a one-line /* banner */ — the build drops it.'); process.exit(1); }
  });
})();

const outPath = path.join(root, 'dist', 'index.html');

if (process.argv.includes('--check')) {
  const current = fs.existsSync(outPath) ? read(outPath) : null;
  if (current === html) { console.log('dist/index.html is up to date (' + html.length + ' bytes)'); process.exit(0); }
  console.error('dist/index.html does NOT match src/ — run `node build.js`');
  process.exit(1);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html);
console.log('wrote dist/index.html — ' + html.length + ' bytes, ' + manifest.length + ' modules');
