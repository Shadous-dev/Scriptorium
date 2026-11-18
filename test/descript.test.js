#!/usr/bin/env node
/*
 * descript.test.js — checks the Descript pull against a stand-in connector.
 *
 *   node test/descript.test.js
 *
 * No dependencies and no network: the stand-in answers in the shapes the real
 * Descript connector was seen to use (a JSON object for listings, plain text
 * for an exported transcript), with made-up projects. src/app/14-descript.js
 * is written for the browser page, so this loads its text and hands it small
 * stand-ins for the parts of the page it leans on. The pause between exports
 * is shortened so the test does not take minutes.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const GAP = 40;
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', '14-descript.js'), 'utf8')
  .replace('var DESCRIPT_GAP_MS = 6500;', 'var DESCRIPT_GAP_MS = ' + GAP + ';');
assert.ok(src.includes('DESCRIPT_GAP_MS = ' + GAP), 'the pause between exports could not be shortened for the test');

// A stand-in page: just enough of the Scriptorium for the pull to run against.
function makePage(mcp) {
  const page = { saved: [], paints: 0, calls: [] };
  const helpers = `
    var state = { sections: [], approved: true }, bookId = 'b1', nextScript = 1;
    var root = { querySelector: function () { return null; }, querySelectorAll: function () { return []; } };
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }
    function plural(n) { return n === 1 ? '' : 's'; }
    function paint() { page.paints += 1; }
    function syncFieldsFromDom() {}
    function newSection() { return { id: 's' + (nextScript++), name: '', raw: '', captions: '', descriptId: '' }; }
    function saveSection(id) { page.saved.push('script:' + id); return Promise.resolve(); }
    function saveCaptions(id) { page.saved.push('captions:' + id); return Promise.resolve(); }
    function saveMeta() { page.saved.push('meta'); return Promise.resolve(); }
    function useCap(name) { return Promise.resolve(name === 'mcp' ? mcp : null); }
  `;
  const api = new Function('page', 'mcp', helpers + src + `
    return { naturalCompare, toolText, toolData, descriptProblem, isAccessProblem, openPull, pullOpenFolder, pullPick, pullPickAll, pullStart, pullStop, renderPull,
             get pull() { return pull; }, get state() { return state; }, setBook: function (b) { bookId = b; } };`)(page, mcp);
  // Copy the live getters themselves (Object.assign would copy their values once, and `pull` changes).
  return Object.defineProperties(page, Object.getOwnPropertyDescriptors(api));
}

// A stand-in Descript: two folders, three audio guides in one of them, one with no transcript.
function makeDescript(opts) {
  opts = opts || {};
  const calls = [];
  const projects = [
    { id: 'p10', name: 'ED_Ruth_10_Sample_v1_DS', updated_at: '2026-01-03T00:00:00.000Z', folder_path: 'Teacher/ruth-project' },
    { id: 'p2', name: 'ED_Ruth_2_Sample_v1_DS', updated_at: '2026-01-02T00:00:00.000Z', folder_path: 'Teacher/ruth-project' },
    { id: 'p1', name: 'ED_Ruth_1_Sample_v1_DS', updated_at: '2026-01-01T00:00:00.000Z', folder_path: 'Teacher/ruth-project' }
  ];
  const text = { p1: 'welcome back my friends\n\nruth chapter one\n', p2: 'in the days when the judges ruled\n', p10: '' };
  const json = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }], payload: obj });
  const plain = (str) => ({ content: [{ type: 'text', text: str }], payload: str });
  return {
    calls,
    listTools: () => Promise.resolve({ servers: opts.noDescript ? [{ server: 'Google Drive', authStatus: 'connected', tools: [] }] : [{ server: 'Descript', authStatus: opts.authStatus || 'connected', tools: [] }] }),
    callTool: (server, tool, input) => {
      calls.push({ server, tool, input, at: Date.now() });
      if (opts.failExport && tool === 'export_transcript') return Promise.reject(opts.failExport);
      if (tool === 'list_folders') return Promise.resolve(json({ data: input.parent_path ? [{ path: input.parent_path + '/ruth-project' }] : [{ path: 'Teacher' }, { path: 'Assets ' }] }));
      if (tool === 'list_projects') {
        const inFolder = projects.filter((p) => p.folder_path === input.folder_path);
        if (!input.cursor) return Promise.resolve(json({ data: inFolder.slice(0, 2), pagination: { next_cursor: 'page-2' } }));
        return Promise.resolve(json({ data: inFolder.slice(2), pagination: {} }));
      }
      if (tool === 'export_transcript') {
        const body = text[input.project_id];
        return Promise.resolve(plain(input.format === 'srt' ? (body ? '1\n00:00:00,000 --> 00:00:02,000\n' + body.trim().split('\n')[0] + '\n' : '') : body));
      }
      return Promise.reject({ code: 'bad_request', message: 'unknown tool ' + tool });
    }
  };
}

const settle = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check, ms) { const end = Date.now() + ms; while (!check()) { if (Date.now() > end) throw new Error('timed out waiting'); await settle(10); } }

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('audio guides sort by number, not by letter', async () => {
  const page = makePage(makeDescript());
  assert.deepStrictEqual(['Isaiah_10', 'Isaiah_2', 'Isaiah_1'].sort(page.naturalCompare), ['Isaiah_1', 'Isaiah_2', 'Isaiah_10']);
});

test('a transcript is read as text, never as JSON — even one that looks like JSON', async () => {
  const page = makePage(makeDescript());
  assert.strictEqual(page.toolText({ content: [{ type: 'text', text: '42' }], payload: 42 }), '42');
  assert.strictEqual(page.toolText({ content: [{ type: 'text', text: 'hello ' }, { type: 'text', text: 'there' }] }), 'hello there');
  assert.strictEqual(page.toolText({ content: [], payload: 'only a payload' }), 'only a payload');
  assert.deepStrictEqual(page.toolData({ content: [{ type: 'text', text: '{"data":[1]}' }] }), { data: [1] });
  assert.deepStrictEqual(page.toolData({ content: [{ type: 'text', text: 'not json' }], payload: 'not json' }), {});
});

test('each kind of failure gets its own sentence, with the thing that fixes it', async () => {
  const page = makePage(makeDescript());
  const said = ['needs_reauth', 'server_not_connected', 'not_in_manifest', 'blocked_by_policy', 'server_unavailable', 'capability_disabled', 'tool_error', 'something_new'].map((code) => page.descriptProblem({ code, message: 'm' }));
  assert.strictEqual(new Set(said).size, said.length, 'two different failures share one message');
  assert.ok(/reconnect Descript/.test(said[0]) && /add Descript/.test(said[1]) && /choose Allow/.test(said[2]));
  assert.ok(page.isAccessProblem({ code: 'needs_reauth' }) && !page.isAccessProblem({ code: 'server_unavailable' }) && !page.isAccessProblem({ code: 'tool_error' }));
});

test('browsing: folders at the top, then a folder\'s audio guides across pages, in number order', async () => {
  const descript = makeDescript(), page = makePage(descript);
  page.openPull();
  await until(() => page.pull && !page.pull.loading, 1000);
  assert.deepStrictEqual(page.pull.folders, ['Assets ', 'Teacher'], 'a folder name keeps its trailing space — Descript needs it back exactly');
  assert.strictEqual(page.pull.projects.length, 0);
  page.pullOpenFolder('Teacher/ruth-project');
  await until(() => !page.pull.loading, 1000);
  assert.deepStrictEqual(page.pull.projects.map((p) => p.id), ['p1', 'p2', 'p10']);
  assert.strictEqual(descript.calls.filter((c) => c.tool === 'list_projects').length, 2, 'both pages were read');
  assert.ok(descript.calls.every((c) => c.server === 'Descript'));
  const html = page.renderPull();
  assert.ok(html.includes('ED_Ruth_10_Sample_v1_DS') && html.includes('Select all 3') && html.includes('Nothing in Descript is changed'));
});

test('pulling: each audio guide becomes a script with its transcript and captions, saved as it arrives', async () => {
  const descript = makeDescript(), page = makePage(descript);
  page.openPull(); await until(() => page.pull && !page.pull.loading, 1000);
  page.pullOpenFolder('Teacher/ruth-project'); await until(() => !page.pull.loading, 1000);
  page.pullPickAll(true);
  page.pullStart();
  assert.strictEqual(page.pull.step, 'pulling');
  await until(() => page.pull.step === 'done', 5000);
  const scripts = page.state.sections;
  assert.deepStrictEqual(scripts.map((s) => [s.name, s.descriptId]), [['ED_Ruth_1_Sample_v1_DS', 'p1'], ['ED_Ruth_2_Sample_v1_DS', 'p2']]);
  assert.strictEqual(scripts[0].raw, 'welcome back my friends\n\nruth chapter one');
  assert.ok(/00:00:00,000 --> 00:00:02,000\nwelcome back my friends$/.test(scripts[0].captions));
  assert.deepStrictEqual([page.pull.added, page.pull.updated, page.pull.failed.length], [2, 0, 1]);
  assert.ok(/no transcript/.test(page.pull.failed[0].why) && page.pull.failed[0].name === 'ED_Ruth_10_Sample_v1_DS');
  assert.strictEqual(page.state.approved, false, 'new text means the book must be reviewed again');
  assert.deepStrictEqual(page.saved.slice(0, 3), ['script:s1', 'captions:s1', 'meta']);
  assert.ok(/Pulled 2 audio guides/.test(page.renderPull()));
});

test('pulling only reads: the only tools called are the three listed, and exports ask for no speaker labels', async () => {
  const descript = makeDescript(), page = makePage(descript);
  page.openPull(); await until(() => page.pull && !page.pull.loading, 1000);
  page.pullOpenFolder('Teacher/ruth-project'); await until(() => !page.pull.loading, 1000);
  page.pullPick('p1', true); page.pullStart(); await until(() => page.pull.step === 'done', 5000);
  assert.deepStrictEqual([...new Set(descript.calls.map((c) => c.tool))].sort(), ['export_transcript', 'list_folders', 'list_projects']);
  const exports = descript.calls.filter((c) => c.tool === 'export_transcript');
  assert.deepStrictEqual(exports.map((c) => c.input), [
    { project_id: 'p1', format: 'txt', include_speaker_labels: 'off' },
    { project_id: 'p1', format: 'srt', include_speaker_labels: 'off' }
  ]);
});

test('pulling is paced: exports are never closer together than the pause Descript requires', async () => {
  const descript = makeDescript(), page = makePage(descript);
  page.openPull(); await until(() => page.pull && !page.pull.loading, 1000);
  page.pullOpenFolder('Teacher/ruth-project'); await until(() => !page.pull.loading, 1000);
  page.pullPick('p1', true); page.pullPick('p2', true); page.pullStart(); await until(() => page.pull.step === 'done', 5000);
  const at = descript.calls.filter((c) => c.tool === 'export_transcript').map((c) => c.at);
  assert.strictEqual(at.length, 4);
  for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= GAP - 8, 'exports ' + i + ' and ' + (i + 1) + ' were only ' + (at[i] - at[i - 1]) + ' ms apart');
});

test('pulling the same audio guide again updates its script instead of adding a second', async () => {
  const descript = makeDescript(), page = makePage(descript);
  for (let round = 0; round < 2; round++) {
    if (round === 0) { page.openPull(); await until(() => page.pull && !page.pull.loading, 1000); }
    page.pullOpenFolder('Teacher/ruth-project'); await until(() => !page.pull.loading, 1000);
    page.pullPick('p1', true); page.pullStart(); await until(() => page.pull.step === 'done', 5000);
  }
  assert.strictEqual(page.state.sections.length, 1);
  assert.deepStrictEqual([page.pull.added, page.pull.updated], [0, 1]);
  assert.ok(/already in this book/.test((page.pullOpenFolder('Teacher/ruth-project'), await until(() => !page.pull.loading, 1000), page.renderPull())));
});

test('an empty first script is filled rather than left behind', async () => {
  const descript = makeDescript(), page = makePage(descript);
  page.state.sections.push({ id: 'blank', name: '', raw: '', captions: '', descriptId: '' });
  page.openPull(); await until(() => page.pull && !page.pull.loading, 1000);
  page.pullOpenFolder('Teacher/ruth-project'); await until(() => !page.pull.loading, 1000);
  page.pullPick('p2', true); page.pullStart(); await until(() => page.pull.step === 'done', 5000);
  assert.deepStrictEqual(page.state.sections.map((s) => s.id), ['blank']);
  assert.strictEqual(page.state.sections[0].descriptId, 'p2');
});

test('an access problem stops the run instead of failing every remaining audio guide', async () => {
  const descript = makeDescript({ failExport: { code: 'needs_reauth', message: 'expired' } }), page = makePage(descript);
  page.openPull(); await until(() => page.pull && !page.pull.loading, 1000);
  page.pullOpenFolder('Teacher/ruth-project'); await until(() => !page.pull.loading, 1000);
  page.pullPickAll(true); page.pullStart(); await until(() => page.pull.step === 'done', 5000);
  assert.strictEqual(descript.calls.filter((c) => c.tool === 'export_transcript').length, 1, 'it kept calling after being told access was gone');
  assert.strictEqual(page.pull.failed.length, 1);
  assert.strictEqual(page.state.sections.length, 0);
  assert.ok(/Stopped with 2 still to go/.test(page.renderPull()));
});

test('Stop ends the run after the audio guide in flight', async () => {
  const descript = makeDescript(), page = makePage(descript);
  page.openPull(); await until(() => page.pull && !page.pull.loading, 1000);
  page.pullOpenFolder('Teacher/ruth-project'); await until(() => !page.pull.loading, 1000);
  page.pullPick('p1', true); page.pullPick('p2', true); page.pullStart();
  page.pullStop();
  await until(() => page.pull.step === 'done', 5000);
  assert.strictEqual(page.state.sections.length, 1, 'the one in flight is finished and kept');
  assert.strictEqual(page.pull.done, 1);
});

test('no Descript connector, or one that needs reconnecting, is said plainly and nothing is listed', async () => {
  const missing = makePage(makeDescript({ noDescript: true }));
  missing.openPull(); await until(() => missing.pull && !missing.pull.loading, 1000);
  assert.ok(/add Descript/.test(missing.pull.error));
  const lapsed = makePage(makeDescript({ authStatus: 'needs_reauth' }));
  lapsed.openPull(); await until(() => lapsed.pull && !lapsed.pull.loading, 1000);
  assert.ok(/reconnect Descript/.test(lapsed.pull.error));
  assert.ok(/Try again/.test(lapsed.renderPull()));
});

(async () => {
  let passed = 0;
  const warn = console.warn; console.warn = () => {};           // the page logs each failure it reports; keep the test output clean
  for (const [name, fn] of tests) {
    try { await fn(); passed += 1; console.log('  ok  ' + name); }
    catch (err) { console.error('FAIL  ' + name + '\n      ' + (err && err.message)); process.exitCode = 1; }
  }
  console.warn = warn;
  console.log('\n' + passed + ' checks passed' + (process.exitCode ? ', some FAILED' : ''));
})();
