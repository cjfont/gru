'use strict';

const path = require('path');
const fs = require('fs-extra');

const STATE_FILE = '.gru/state.json';

async function loadState(dir) {
  try {
    return await fs.readJson(path.join(dir, STATE_FILE));
  } catch {
    return { baseRepos: [] };
  }
}

async function saveState(dir, state) {
  await fs.outputJson(path.join(dir, STATE_FILE), state, { spaces: 2 });
}

module.exports = { loadState, saveState };
