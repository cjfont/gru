#!/usr/bin/env node

'use strict';
var childProcess = require('child_process');
var path = require('path');

var async = require('async');
var fs = require('fs-extra');
var minimist = require('minimist');
var yaml = require('js-yaml');
var _ = require('lodash');

var args = process.argv.slice(2);

var cwd = process.cwd(); // current working directory
var env = process.env;   // environment vars

switch (args[0]) {

  case 'init':
    exit("'gru init' not yet supported.");
    break;

  case 'clone':
    if (args.length < 2) exit('clone: no repository specified.');
    var cloneOpts = minimist(args.slice(1));
    var targetDir = cloneOpts._[1] ? path.relative(cwd, cloneOpts._[1]) : cwd;
    clone(args.slice(1), targetDir, exit);
    break;

  default: // pass-thru command to git
    exec('git ' + args.join(' '), cwd, exit);
    break;

}

// clone repo; return repo name, manifest and exclude list
function clone(cloneArgs, targetDir, callback) {
  var cwd = targetDir;
  var gruConf;
  var repoName, manifest, excludes;
  async.waterfall([
    // perform clone
    function(cb) {
      exec('git clone ' + cloneArgs.join(' '), cwd, function(err, output) {
        if (err) return cb(err);
        var matches = output.match(/Cloning into '([^']+)'/);
        if (matches && matches[1]) {
          cwd = path.join(targetDir, matches[1]);
          repoName = matches[1];
          cb();
        } else {
          cb(new Error('Could not get repo name'));
        }
      });
    },
    // get repo manifest
    function(cb) {
      exec('git ls-files', cwd, function(err, output) {
        if (err) return cb(err);
        manifest = output.trim().split('\n');
        cb();
      });
    },
    // look for and load gru.yml
    function(cb) {
      fs.readFile(path.join(cwd, 'gru.yml'), function(err, data) {
        if (!err) {
          log("Found 'gru.yml'");
          try {
            gruConf = yaml.safeLoad(data);
            return cb();
          } catch (e) {
            return cb(e); // YAML parse error
          }
        } else if (err.code === 'ENOENT') {
          cb('skip_to_end'); // no gru.yml file exists in repo; we're done
        } else {
          cb(err);
        }
      });
    },
    // ensure .gru directory exists
    function(cb) {
      excludes = ['.gru/'];
      fs.ensureDir(path.join(cwd, '.gru'), cb);
    },
    // look for base repos
    function(gruDir, cb) {
      var baseRepos;
      // interpret 'derives-from' property
      if (Array.isArray(gruConf['derives-from'])) {
        baseRepos = gruConf['derives-from'];
      } else if (typeof gruConf['derives-from'] == 'string') {
        baseRepos = [gruConf['derives-from']];
      } else {
        return cb(new Error("'derives-from' property in 'gru.yml' must be a string or array"));
      }
      // merge each base repo
      if (_.isArray(baseRepos) && !_.isEmpty(baseRepos) > 0) log('Merging base repo(s): [' + baseRepos.join(', ') + ']');
      async.eachSeries(baseRepos, function(repoUrl, cb) {
        var gruDir = path.join(cwd, '.gru');
        async.waterfall([
          // clone base repo
          function(cb) {
            clone([repoUrl], gruDir, cb);
          },
          // copy files from base repo that are NOT in the derived repo
          function(repoName, baseManifest, baseExcludes, cb) {
            var baseRepoOnly = _.difference(baseManifest, manifest); // in base NOT in derived
            manifest = _.union(manifest, baseManifest);
            excludes = _.union(excludes, baseRepoOnly);
            async.eachSeries(baseRepoOnly, function(file, cb) {
              fs.copy(path.join(gruDir, repoName, file), path.join(cwd, file), cb);
            }, cb);
          }
        ], cb);
      }, cb);
    },
    // update locally excluded files in .git/info/exclude
    function(cb) {
      var excludeStr = '\n# gru excludes:\n' + excludes.join('\n') + '\n';
      fs.appendFile(path.join(cwd, '.git/info/exclude'), excludeStr, cb);
    }
  ], function(err) {
    if (!err || err === 'skip_to_end') {
      callback(null, repoName, manifest, excludes);
    } else {
      callback(err);
    }
  });
}

function log(msg) {
  process.stdout.write('[gru]: ' + msg + '\n');
}

function exec(command, cwd, callback) {
  process.stdout.write('[cmd]: ' + command + '\n');
  childProcess.exec(command, {cwd: cwd, env: env}, function(err, stdout, stderr) {
    if (err) {
      process.stderr.write(stderr);
      return exit(err);
    }
    var output = stdout.toString() + '\n' + stderr.toString();
    process.stdout.write('[git]: ' + output.trim().replace(new RegExp('\\n', 'g'), '\n[git]: ') + '\n');
    callback(null, output);
  });
}

function exit(err) {
  if (err && err !== 'exit') {
    process.stdout.write('[gru]: ' + err.toString() + '\n');
    process.exit(err.code || 1);
  } else {
    process.exit();
  }
}
