#!/usr/bin/env node

'use strict';

const childProcess = require('child_process');
const path = require('path');
const { promisify } = require('util');

const fs = require('fs-extra');
const minimist = require('minimist');
const yaml = require('js-yaml');

const execAsync = promisify(childProcess.exec);

const cwd = process.cwd();
const env = process.env;
const args = process.argv.slice(2);

async function main() {
  switch (args[0]) {

    case 'init':
      exit("'gru init' not yet supported.");
      break;

    case 'clone': {
      if (args.length < 2) exit('clone: no repository specified.');
      const cloneOpts = minimist(args.slice(1));
      const targetDir = cloneOpts._[1] ? path.relative(cwd, cloneOpts._[1]) : cwd;
      await clone(args.slice(1), targetDir);
      break;
    }

    default: // pass-thru command to git
      await exec('git ' + args.join(' '), cwd);
      break;

  }
}

// Clone repo; return repo name, manifest, and exclude list
async function clone(cloneArgs, targetDir) {
  let dir = targetDir;

  // Perform clone
  const cloneOutput = await exec('git clone ' + cloneArgs.join(' '), dir);
  const matches = cloneOutput.match(/Cloning into '([^']+)'/);
  if (!matches || !matches[1]) throw new Error('Could not get repo name');
  const repoName = matches[1];
  dir = path.join(targetDir, repoName);

  // Get repo manifest
  const lsOutput = await exec('git ls-files', dir);
  let manifest = lsOutput.trim().split('\n').filter(Boolean);

  // Look for and load gru.yml
  let gruConf;
  try {
    const data = await fs.readFile(path.join(dir, 'gru.yml'));
    log("Found 'gru.yml'");
    gruConf = yaml.load(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { repoName, manifest, excludes: [] };
    }
    throw err;
  }

  // Ensure .gru directory exists
  let excludes = ['.gru/'];
  const gruDir = path.join(dir, '.gru');
  await fs.ensureDir(gruDir);

  // Interpret derives-from property
  let baseRepos;
  if (Array.isArray(gruConf['derives-from'])) {
    baseRepos = gruConf['derives-from'];
  } else if (typeof gruConf['derives-from'] === 'string') {
    baseRepos = [gruConf['derives-from']];
  } else {
    throw new Error("'derives-from' property in 'gru.yml' must be a string or array");
  }

  if (baseRepos.length > 0) {
    log('Merging base repo(s): [' + baseRepos.join(', ') + ']');
  }

  // Merge each base repo
  for (const repoUrl of baseRepos) {
    const { repoName: baseName, manifest: baseManifest } = await clone([repoUrl], gruDir);
    const baseOnly = baseManifest.filter(f => !manifest.includes(f));
    manifest = [...new Set([...manifest, ...baseManifest])];
    excludes = [...new Set([...excludes, ...baseOnly])];
    for (const file of baseOnly) {
      await fs.copy(path.join(gruDir, baseName, file), path.join(dir, file));
    }
  }

  // Update locally excluded files in .git/info/exclude
  const excludeStr = '\n# gru excludes:\n' + excludes.join('\n') + '\n';
  await fs.appendFile(path.join(dir, '.git/info/exclude'), excludeStr);

  return { repoName, manifest, excludes };
}

function log(msg) {
  process.stdout.write('[gru]: ' + msg + '\n');
}

async function exec(command, dir) {
  process.stdout.write('[cmd]: ' + command + '\n');
  const { stdout, stderr } = await execAsync(command, { cwd: dir, env });
  const output = stdout + '\n' + stderr;
  process.stdout.write('[git]: ' + output.trim().replace(/\n/g, '\n[git]: ') + '\n');
  return output;
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
