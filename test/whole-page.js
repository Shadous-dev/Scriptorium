/*
 * whole-page.js — not a test. A helper two test files share: it loads the WHOLE page (every module but the
 * event wiring) against a stand-in document and a stand-in store, the way build.js pastes the modules into
 * one scope, and hands back a way to reach anything inside it.
 *
 *   const { makeStore, makePage, settle } = require('./whole-page');
 *   const P = makePage();            P.ev('glossary')   // any name in the page's scope
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'src', 'app');
const modules = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).filter((f) => f !== '17-events.js');
const source = modules.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

// A stand-in for the artifact's document store: set replaces, update merges, and a test can make either fail.
function makeStore() {
  const store = new Map();
  const ctl = { sets: [], updates: [], deletes: [], reads: [], failSet: null, failRead: null, canOrder: true };
  const snap = (p) => ({ id: p.split('/').pop(), exists: store.has(p), data: () => (store.has(p) ? JSON.parse(JSON.stringify(store.get(p))) : undefined) });
  function doc(p) {
    return {
      id: p.split('/').pop(), path: p,
      get: () => { ctl.reads.push({ path: p }); return Promise.resolve(snap(p)); },
      set: (d) => {
        const data = JSON.parse(JSON.stringify(d));
        ctl.sets.push({ path: p, data });
        const err = ctl.failSet && ctl.failSet(p, data);
        if (err) return Promise.reject(err);
        store.set(p, data); return Promise.resolve();
      },
      update: (d) => {
        const data = JSON.parse(JSON.stringify(d));
        ctl.updates.push({ path: p, data });
        const err = ctl.failSet && ctl.failSet(p, data);
        if (err) return Promise.reject(err);
        if (!store.has(p)) return Promise.reject({ code: 'not_found' });
        store.set(p, Object.assign({}, store.get(p), data)); return Promise.resolve();
      },
      delete: () => { ctl.deletes.push(p); store.delete(p); return Promise.resolve(); },
    };
  }
  function coll(p, filters, order, lim) {
    const q = {
      path: p,
      limit: (n) => coll(p, filters, order, n),
      doc: (id) => doc(p + '/' + id),
      get: () => {
        ctl.reads.push({ path: p, filters, order, limit: lim });
        const err = ctl.failRead && ctl.failRead({ path: p, filters, order });
        if (err) return Promise.reject(err);
        const depth = p.split('/').length + 1;
        let docs = Array.from(store.keys()).filter((k) => k.indexOf(p + '/') === 0 && k.split('/').length === depth).map(snap);
        filters.forEach(([f, op, v]) => { docs = docs.filter((d) => { const x = d.data()[f]; return x != null && (op === '>=' ? x >= v : op === '>' ? x > v : x === v); }); });
        if (order) docs.sort((a, b) => { const x = a.data()[order], y = b.data()[order]; return x == null ? 1 : y == null ? -1 : x - y; });
        else docs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        return Promise.resolve({ docs: docs.slice(0, lim || 1000) });
      },
    };
    if (ctl.canOrder) { q.where = (f, op, v) => coll(p, filters.concat([[f, op, v]]), order, lim); q.orderBy = (f) => coll(p, filters, f, lim); }
    return q;
  }
  return { store, ctl, db: { doc, collection: (p) => coll(p, [], null, 0) } };
}

// `opts.loadScript(el)` plays the part of the browser fetching a <script>: call el.onload() or el.onerror().
function makePage(S, opts) {
  S = S || makeStore();
  opts = Object.assign({ scripts: [] }, opts || {});
  const page = new Function('S', 'O', `
    var root = { innerHTML: '', querySelector: function () { return null; }, querySelectorAll: function () { return []; } };
    var document = { activeElement: null, getElementById: function (id) { return id === 'app-root' ? root : id === 'seed-state' ? { textContent: '' } : null; },
                     createElement: function () { return {}; },
                     head: { appendChild: function (el) { O.scripts.push(el.src); setTimeout(function () { if (O.loadScript) O.loadScript(el, window); else if (el.onerror) el.onerror(); }, 0); } } };
    var window = { claude: { use: function (name) { return Promise.resolve(name === 'db' ? S.db : (O.caps && O.caps[name]) || null); } } };
    var navigator = O.navigator || {};
    ${source}
    return { root: root, window: window, ev: function (code) { return eval(code); } };
  `)(S, opts);
  page.S = S; page.opts = opts;
  return page;
}

const settle = async () => { for (let i = 0; i < 60; i++) await new Promise((r) => setTimeout(r, 0)); };

module.exports = { makeStore, makePage, settle };
