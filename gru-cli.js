#!/usr/bin/env node

'use strict';

const path = require('path');
const minimist = require('minimist');

const { gitPassthrough } = require('./lib/git');
const { cloneRepo } = require('./lib/clone');
const { update } = require('./lib/update');
const { init } = require('./lib/init');
const { list } = require('./lib/list');
const { status } = require('./lib/status');
const { loadState } = require('./lib/state');
const { hashFile } = require('./lib/update');

const cwd = process.cwd();
const rawArgs = process.argv.slice(2);

// Parse global flags
const parsed = minimist(rawArgs, { boolean: ['verbose', 'quiet', 'v', 'q'] });
const verbose = parsed.verbose || parsed.v;
const quiet = parsed.quiet || parsed.q;

// Strip gru-specific global flags before passing through to git
const GRU_FLAGS = new Set(['--verbose', '-v', '--quiet', '-q']);
const args = rawArgs.filter(a => !GRU_FLAGS.has(a));

async function main() {
  switch (args[0]) {

    case 'init':
      await init(cwd);
      break;

    case 'clone': {
      if (args.length < 2) exit('clone: no repository specified.');
      const cloneOpts = minimist(args.slice(1));
      const targetDir = cloneOpts._[1] ? path.relative(cwd, cloneOpts._[1]) : cwd;
      await cloneRepo(args.slice(1), targetDir, { verbose, quiet });
      break;
    }

    case 'update':
      await update(cwd, { verbose, quiet });
      break;

    case 'list':
      await list(cwd);
      break;

    case 'status':
      await status(cwd, args.slice(1));
      break;

    case 'commit':
      await warnBaseRepoModifications(cwd);
      await gitPassthrough(['commit', ...args.slice(1)], cwd);
      break;

    default: // pass-through to git
      await gitPassthrough(args, cwd);
      break;

  }
}

// Before committing, warn if any base repo files have been locally modified.
// They are git-excluded and won't be included in the commit, so this is purely informational.
async function warnBaseRepoModifications(dir) {
  const state = await loadState(dir);
  if (!state.baseRepos || state.baseRepos.length === 0) return;

  const modified = [];
  for (const repo of state.baseRepos) {
    for (const file of (repo.files || [])) {
      try {
        const [wHash, gHash] = await Promise.all([
          hashFile(path.join(dir, file)),
          hashFile(path.join(dir, '.gru', repo.name, file)),
        ]);
        if (wHash !== gHash) modified.push({ file, repo: repo.url });
      } catch {}
    }
  }

  if (modified.length > 0) {
    process.stdout.write('\n[gru]: Warning: the following base repo files have local modifications:\n');
    for (const { file, repo } of modified) {
      process.stdout.write(`  ${file}  [from: ${repo}]\n`);
    }
    process.stdout.write('[gru]: These files are git-excluded and will NOT be included in this commit.\n');
    process.stdout.write('[gru]: Use `gru list` to see which repos own these files.\n\n');
  }
}

function exit(err) {
  if (err && err !== 'exit') {
    process.stdout.write('[gru]: ' + err.toString() + '\n');
    process.exit(err.code || 1);
  } else {
    process.exit(0);
  }
}

main().catch(exit);
