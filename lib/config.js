'use strict';

const path = require('path');
const fs = require('fs-extra');
const yaml = require('js-yaml');

async function loadConfig(dir) {
  try {
    const data = await fs.readFile(path.join(dir, 'gru.yml'), 'utf8');
    const conf = yaml.load(data);
    validateConfig(conf);
    return conf;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function validateConfig(conf) {
  if (!conf || typeof conf !== 'object') {
    throw new Error('gru.yml: must be a YAML object');
  }
  if (!conf['derives-from']) {
    throw new Error("gru.yml: missing required 'derives-from' property");
  }
  const raw = Array.isArray(conf['derives-from'])
    ? conf['derives-from']
    : [conf['derives-from']];
  if (raw.length === 0) {
    throw new Error("gru.yml: 'derives-from' must not be empty");
  }
  for (const entry of raw) {
    if (typeof entry === 'string') continue;
    if (entry && typeof entry === 'object') {
      if (typeof entry.url !== 'string' || !entry.url) {
        throw new Error(`gru.yml: entry missing required 'url' field: ${JSON.stringify(entry)}`);
      }
      if (entry.ref !== undefined && typeof entry.ref !== 'string') {
        throw new Error(`gru.yml: 'ref' must be a string: ${JSON.stringify(entry)}`);
      }
      if (entry.include !== undefined && !Array.isArray(entry.include)) {
        throw new Error(`gru.yml: 'include' must be an array: ${JSON.stringify(entry)}`);
      }
      if (entry.exclude !== undefined && !Array.isArray(entry.exclude)) {
        throw new Error(`gru.yml: 'exclude' must be an array: ${JSON.stringify(entry)}`);
      }
      continue;
    }
    throw new Error(`gru.yml: invalid 'derives-from' entry: ${JSON.stringify(entry)}`);
  }
}

// Normalize all derives-from entries to objects with at least a 'url' field
function normalizeEntries(conf) {
  const raw = Array.isArray(conf['derives-from'])
    ? conf['derives-from']
    : [conf['derives-from']];
  return raw.map(entry => (typeof entry === 'string' ? { url: entry } : entry));
}

module.exports = { loadConfig, validateConfig, normalizeEntries };
