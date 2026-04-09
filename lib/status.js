'use strict';

const path = require('path');
const crypto = require('crypto');
const fs = require('fs-extra');
const { gitPassthrough } = require('./git');
const { loadState } = require('./state');

// Run git status, then append a gru section showing any modified base repo files.
async function status(dir, extraArgs) {
  await gitPassthrough(['status', ...extraArgs], dir);

  const state = await loadState(dir);
  if (!state.baseRepos || state.baseRepos.length === 0) return;

  const modified = [];
  for (const repo of state.baseRepos) {
    for (const file of (repo.files || [])) {
      const workingCopy = path.join(dir, file);
      const gruCopy = path.join(dir, '.gru', repo.name, file);
      try {
        const [wHash, gHash] = await Promise.all([hashFile(workingCopy), hashFile(gruCopy)]);
        if (wHash !== gHash) modified.push({ file, repo: repo.url });
      } catch {}
    }
  }

  if (modified.length > 0) {
    process.stdout.write('\n[gru]: Modified base repo files (git-excluded, not tracked by this repo):\n');
    for (const { file, repo } of modified) {
      process.stdout.write(`  modified: ${file}  [from: ${repo}]\n`);
    }
    process.stdout.write('\n[gru]: Run `gru update` to sync or `gru list` to inspect base repos.\n');
  }
}

async function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', d => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

module.exports = { status, hashFile };
