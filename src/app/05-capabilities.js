/* 05-capabilities.js — Runtime capability lookup (sampling, db, MCP). */
  /* ==================================================================
     Capabilities
     ================================================================== */

  var capCache = {};
  function useCap(name) {
    if (capCache[name]) return capCache[name];
    if (!window.claude || typeof window.claude.use !== 'function') { capCache[name] = Promise.resolve(null); return capCache[name]; }
    capCache[name] = window.claude.use(name).catch(function () { return null; });
    return capCache[name];
  }

