'use strict';

const path = require('path');
const fs = require('fs-extra');
const readline = require('readline');
const yaml = require('js-yaml');

async function init(dir) {
  const gruYmlPath = path.join(dir, 'gru.yml');

  if (await fs.pathExists(gruYmlPath)) {
    process.stdout.write('[gru]: gru.yml already exists in this directory.\n');
    return;
  }

  // Non-interactive: write a commented template
  if (!process.stdin.isTTY) {
    await fs.writeFile(gruYmlPath, TEMPLATE);
    process.stdout.write('[gru]: Created gru.yml template.\n');
    return;
  }

  // Interactive: prompt for base repo details
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(resolve => rl.question(q, resolve));

  process.stdout.write('[gru]: Initializing gru.yml...\n');

  const entries = [];
  while (true) {
    const url = (await ask('\n[gru]: Base repo URL (leave blank to finish): ')).trim();
    if (!url) break;

    const ref = (await ask('[gru]:   Branch/tag/commit ref (leave blank for default): ')).trim();
    const includeRaw = (await ask('[gru]:   Include patterns, comma-separated (leave blank for all): ')).trim();
    const excludeRaw = (await ask('[gru]:   Exclude patterns, comma-separated (leave blank for none): ')).trim();

    const entry = { url };
    if (ref) entry.ref = ref;
    if (includeRaw) entry.include = includeRaw.split(',').map(s => s.trim()).filter(Boolean);
    if (excludeRaw) entry.exclude = excludeRaw.split(',').map(s => s.trim()).filter(Boolean);

    // Use short string form when no extra options were specified
    entries.push(!entry.ref && !entry.include && !entry.exclude ? url : entry);
  }

  rl.close();

  if (entries.length === 0) {
    process.stdout.write('[gru]: No base repos specified, gru.yml not created.\n');
    return;
  }

  const conf = { 'derives-from': entries.length === 1 ? entries[0] : entries };
  await fs.writeFile(gruYmlPath, yaml.dump(conf, { lineWidth: -1 }));
  process.stdout.write('[gru]: Created gru.yml\n');
}

const TEMPLATE = `# gru.yml — Git Repo Unifier configuration
# Run \`gru init\` in a terminal to configure interactively.
#
# Simple form (URL only):
# derives-from:
#   - https://github.com/user/base-repo
#
# Extended form (with optional ref, include, and exclude filters):
# derives-from:
#   - url: https://github.com/user/base-repo
#     ref: main
#     include:
#       - config/**
#       - scripts/**
#     exclude:
#       - "*.test.js"

derives-from: []
`;

module.exports = { init };
