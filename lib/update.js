'use strict';

const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const { git } = require('./git');
const { loadState, saveState } = require('./state');
const { writeExcludes } = require('./clone');

// Pull updates for all base repos and sync changed files into the derived repo.
async function update(dir, { verbose = false, quiet = false } = {}) {
  const log = makeLog(quiet);
  const state = await loadState(dir);

  if (!state.baseRepos || state.baseRepos.length === 0) {
    log('No base repos tracked. Has this repo been cloned with gru?');
    return;
  }

  log(`Updating ${state.baseRepos.length} base repo(s)...`);

  // Get the derived repo's tracked files to avoid overwriting them
  const lsOutput = await git(['ls-files'], dir, { silent: !verbose });
  const derivedManifest = lsOutput.trim().split('\n').filter(Boolean);

  const updatedRepos = [];
  for (const repoState of state.baseRepos) {
    const repoDir = path.join(dir, '.gru', repoState.name);

    if (!await fs.pathExists(repoDir)) {
      log(`Warning: base repo '${repoState.name}' not found at .gru/${repoState.name}. Re-clone to restore.`);
      updatedRepos.push(repoState);
      continue;
    }

    log(`Pulling ${repoState.name} (${repoState.url})...`);
    try {
      await git(['pull'], repoDir);
    } catch (err) {
      log(`Warning: failed to pull '${repoState.url}': ${err.message}`);
      updatedRepos.push(repoState);
      continue;
    }

    const newCommit = (await git(['rev-parse', 'HEAD'], repoDir, { silent: true })).trim();
    if (newCommit === repoState.commit) {
      log(`  ${repoState.name}: already up to date`);
      updatedRepos.push(repoState);
      continue;
    }

    // Compute the new set of base-only files (same logic as clone)
    const baseOutput = await git(['ls-files'], repoDir, { silent: !verbose });
    const baseManifest = baseOutput.trim().split('\n').filter(Boolean);
    const newBaseOnly = baseManifest.filter(f => !derivedManifest.includes(f));

    const oldFiles = repoState.files || [];
    const added = newBaseOnly.filter(f => !oldFiles.includes(f));
    const removed = oldFiles.filter(f => !newBaseOnly.includes(f));
    const kept = newBaseOnly.filter(f => oldFiles.includes(f));

    // Warn about locally modified base files that will be overwritten
    const locallyModified = [];
    for (const file of kept) {
      try {
        const [wHash, gHash] = await Promise.all([
          hashFile(path.join(dir, file)),
          hashFile(path.join(repoDir, file)),
        ]);
        if (wHash !== gHash) locallyModified.push(file);
      } catch {}
    }
    if (locallyModified.length > 0) {
      log(`  Warning: locally modified base repo files will be overwritten:`);
      for (const f of locallyModified) log(`    ${f}`);
    }

    // Copy added and updated files
    await Promise.all(
      [...added, ...kept].map(file =>
        fs.copy(path.join(repoDir, file), path.join(dir, file), { overwrite: true })
      )
    );

    // Remove files that no longer exist in the base repo
    for (const file of removed) {
      try { await fs.remove(path.join(dir, file)); } catch {}
    }

    if (added.length) log(`  Added:   ${added.join(', ')}`);
    if (kept.length)  log(`  Updated: ${kept.join(', ')}`);
    if (removed.length) log(`  Removed: ${removed.join(', ')}`);

    updatedRepos.push({ ...repoState, commit: newCommit, files: newBaseOnly });
  }

  // Rebuild .git/info/exclude with the current file list
  const allExcludes = ['.gru/', ...updatedRepos.flatMap(r => r.files || [])];
  await writeExcludes(dir, [...new Set(allExcludes)]);

  await saveState(dir, { baseRepos: updatedRepos });
  log('Update complete.');
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

function makeLog(quiet) {
  return quiet ? () => {} : msg => process.stdout.write('[gru]: ' + msg + '\n');
}

module.exports = { update, hashFile };
