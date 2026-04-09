'use strict';

// Converts a glob pattern to a RegExp.
// Supports: * (non-separator chars), ** (any chars including /), ? (single non-separator char)
function globToRegex(pattern) {
  const p = pattern.replace(/\\/g, '/');
  let reg = '';
  let i = 0;
  while (i < p.length) {
    const ch = p[i];
    if (ch === '*' && p[i + 1] === '*') {
      i += 2;
      if (p[i] === '/') { i++; reg += '(?:.+/)?'; }
      else reg += '.*';
    } else if (ch === '*') {
      reg += '[^/]*'; i++;
    } else if (ch === '?') {
      reg += '[^/]'; i++;
    } else {
      // Escape regex metacharacters
      reg += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&'); i++;
    }
  }
  return new RegExp('^' + reg + '$');
}

function matchGlob(pattern, filePath) {
  return globToRegex(pattern).test(filePath.replace(/\\/g, '/'));
}

// Filter a list of file paths by include and/or exclude glob patterns.
// include: if set, only files matching at least one pattern are kept.
// exclude: if set, files matching any pattern are removed.
function applyFilters(files, include, exclude) {
  let result = files;
  if (include && include.length > 0) {
    result = result.filter(f => include.some(p => matchGlob(p, f)));
  }
  if (exclude && exclude.length > 0) {
    result = result.filter(f => !exclude.some(p => matchGlob(p, f)));
  }
  return result;
}

module.exports = { matchGlob, applyFilters };
