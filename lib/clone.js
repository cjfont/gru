'use strict';

const path = require('path');
const fs = require('fs-extra');
const minimist = require('minimist');
const { git } = require('./git');
const { loadConfig, normalizeEntries } = require('./config');
const { saveState } = require('./state');
const { applyFilters } = require('./glob');

// Clone a repo and recursively merge any base repos listed in its gru.yml.
// Returns { repoName, dir, manifest, excludes }.
async function cloneRepo(cloneArgs, targetDir, opts = {}) {
  const { verbose = false, quiet = false, visited = new Set() } = opts;
  const log = makeLog(quiet);

  // Extract the repo URL for circular dependency detection (last positional arg)
  const parsedCloneArgs = minimist(cloneArgs);
  const repoUrl = parsedCloneArgs._[parsedCloneArgs._.length - 1];
  if (repoUrl && visited.has(repoUrl)) {
    throw new Error(`Circular dependency detected: '${repoUrl}' is already in the dependency chain`);
  }
  const childVisited = new Set([...visited, ...(repoUrl ? [repoUrl] : [])]);

  // Perform clone
  const cloneOutput = await git(['clone', ...cloneArgs], targetDir);
  const matches = cloneOutput.match(/Cloning into '([^']+)'/);
  if (!matches || !matches[1]) throw new Error('Could not get repo name');
  const repoName = matches[1];
  const dir = path.join(targetDir, repoName);

  // Get repo manifest
  const lsOutput = await git(['ls-files'], dir, { silent: !verbose });
  let manifest = lsOutput.trim().split('\n').filter(Boolean);

  // Load and validate gru.yml
  const gruConf = await loadConfig(dir);
  if (!gruConf) return { repoName, dir, manifest, excludes: [] };

  log("Found 'gru.yml'");
  const entries = normalizeEntries(gruConf);

  // Ensure .gru directory exists
  let excludes = ['.gru/'];
  const gruDir = path.join(dir, '.gru');
  await fs.ensureDir(gruDir);

  if (entries.length > 0) {
    log('Merging base repo(s): [' + entries.map(e => e.url).join(', ') + ']');
  }

  // Clone all base repos in parallel, then apply them sequentially (order matters for conflict resolution)
  const cloneResults = await Promise.all(
    entries.map(entry => {
      const refArgs = entry.ref ? ['--branch', entry.ref] : [];
      return cloneRepo([...refArgs, entry.url], gruDir, { verbose, quiet, visited: childVisited })
        .then(result => ({ ...result, entry }));
    })
  );

  const stateRepos = [];
  for (const { repoName: baseName, manifest: baseManifest, entry } of cloneResults) {
    // Warn about files that exist in both repos (derived takes precedence)
    const conflicts = baseManifest.filter(f => manifest.includes(f));
    for (const f of conflicts) {
      log(`Warning: '${f}' exists in both derived repo and base '${entry.url}' — derived version takes precedence`);
    }

    // Files only in base repo (not in derived)
    let baseOnly = baseManifest.filter(f => !manifest.includes(f));

    // Apply include/exclude glob filters from gru.yml entry
    baseOnly = applyFilters(baseOnly, entry.include, entry.exclude);

    manifest = [...new Set([...manifest, ...baseManifest])];
    excludes = [...new Set([...excludes, ...baseOnly])];

    // Copy base-only files to the derived repo's working directory
    await Promise.all(
      baseOnly.map(file =>
        fs.copy(path.join(gruDir, baseName, file), path.join(dir, file))
      )
    );

    // Record commit hash for state tracking
    let commit = '';
    try {
      commit = (await git(['rev-parse', 'HEAD'], path.join(gruDir, baseName), { silent: true })).trim();
    } catch {}

    stateRepos.push({ url: entry.url, ref: entry.ref || null, name: baseName, commit, files: baseOnly });
  }

  // Write the gru-managed exclusions into .git/info/exclude
  await writeExcludes(dir, excludes);

  // Persist state for use by update/list/status commands
  await saveState(dir, { baseRepos: stateRepos });

  return { repoName, dir, manifest, excludes };
}

// Write the gru-managed exclusions block into .git/info/exclude, replacing any previous block.
async function writeExcludes(dir, excludes) {
  const excludeFile = path.join(dir, '.git/info/exclude');
  let content = '';
  try {
    content = await fs.readFile(excludeFile, 'utf8');
  } catch {}

  content = stripGruSection(content);

  const block = [
    '# --- gru excludes begin ---',
    ...excludes,
    '# --- gru excludes end ---',
  ].join('\n');

  await fs.writeFile(excludeFile, content.trimEnd() + '\n' + block + '\n');
}

// Remove any previously written gru exclusions block from file content.
function stripGruSection(content) {
  return content
    .replace(/\n?# --- gru excludes begin ---[\s\S]*?# --- gru excludes end ---\n?/g, '')
    .trimEnd();
}

function makeLog(quiet) {
  return quiet ? () => {} : msg => process.stdout.write('[gru]: ' + msg + '\n');
}

module.exports = { cloneRepo, writeExcludes, stripGruSection };
