'use strict';

const childProcess = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(childProcess.execFile);
const env = process.env;

// Run a git command with captured output (for internal use)
async function git(args, cwd, { silent = false } = {}) {
  if (!silent) process.stdout.write('[cmd]: git ' + args.join(' ') + '\n');
  try {
    const { stdout, stderr } = await execFileAsync('git', args, { cwd, env });
    const output = stdout + stderr;
    if (!silent && output.trim()) {
      process.stdout.write('[git]: ' + output.trim().replace(/\n/g, '\n[git]: ') + '\n');
    }
    return output;
  } catch (err) {
    if (err.stderr) process.stderr.write(err.stderr);
    throw err;
  }
}

// Pass-through git command with inherited stdio (preserves color/TTY for user-facing commands)
function gitPassthrough(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn('git', args, { cwd, env, stdio: 'inherit' });
    child.on('close', code => {
      if (code !== 0) {
        const err = new Error(`git exited with code ${code}`);
        err.code = code;
        reject(err);
      } else {
        resolve();
      }
    });
    child.on('error', reject);
  });
}

module.exports = { git, gitPassthrough };
