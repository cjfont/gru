'use strict';

const { loadState } = require('./state');

async function list(dir) {
  const state = await loadState(dir);

  if (!state.baseRepos || state.baseRepos.length === 0) {
    process.stdout.write('[gru]: No base repos tracked. Has this repo been cloned with gru?\n');
    return;
  }

  process.stdout.write(`[gru]: ${state.baseRepos.length} base repo(s):\n`);
  for (const repo of state.baseRepos) {
    process.stdout.write(`\n  ${repo.url}\n`);
    if (repo.ref)    process.stdout.write(`    ref:    ${repo.ref}\n`);
    if (repo.commit) process.stdout.write(`    commit: ${repo.commit}\n`);
    process.stdout.write(`    files:  ${(repo.files || []).length}\n`);
    if (repo.files && repo.files.length > 0) {
      for (const f of repo.files) {
        process.stdout.write(`      - ${f}\n`);
      }
    }
  }
}

module.exports = { list };
