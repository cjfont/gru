var assert = require('assert');
var child_process = require('child_process');
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
        if (args.length < 2) exit("clone: no repository specified.");
        var clone_opts = minimist(args.slice(1));
        var target_dir = clone_opts._[1] ? path.relative(cwd, clone_opts._[1]) : cwd;
        clone(args.slice(1), target_dir, exit);
        break;
        
    default: // pass-thru command to git
        exec('git '+args.join(" "), cwd, exit);
        break;
        
}

// clone repo; return repo name, manifest and exclude list
function clone(clone_args, target_dir, callback) {
    var cwd = target_dir;
    var gru_yml;      
    var repo_name, manifest, excludes;
    async.waterfall([
        // perform clone
        function(cb) {
            exec('git clone '+clone_args.join(' '), cwd, function(err, output) {
                if (err) return cb(err);
                var matches = output.match(/Cloning into '([^']+)'/);
                if (matches && matches[1]) {
                    cwd = path.join(target_dir, matches[1]);
                    repo_name = matches[1];
                    cb();
                } else {
                    cb(new Error('Could not get repo name'))
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
                        gru_yml = yaml.safeLoad(data);
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
            excludes = [".gru/"];
            fs.ensureDir(path.join(cwd, ".gru"), cb);
        },
        // look for base repos
        function(gru_dir, cb) {
            var base_repos;
            // interpret 'derives-from' property
            if (Array.isArray(gru_yml['derives-from'])) {
                base_repos = gru_yml['derives-from'];
            } else if (typeof gru_yml['derives-from'] == 'string') {
                base_repos = [gru_yml['derives-from']];
            } else {
                return cb(new Error("'derives-from' property in 'gru.yml' must be a string or array"));
            }
            // merge each base repo
            if (_.isArray(base_repos) && !_.isEmpty(base_repos) > 0) log('Merging base repo(s): ['+base_repos.join(', ')+']');
            async.eachSeries(base_repos, function(repo_url, cb) {
                var gru_dir = path.join(cwd, '.gru');
                async.waterfall([
                    // clone base repo
                    function(cb) {
                        clone([repo_url], gru_dir, cb);
                    },
                    // copy files from base repo that are NOT in the derived repo,
                    // then add to .git/info/exclude those that only exist in base repo 
                    function(repo_name, base_manifest, base_excludes, cb) {
                        var base_repo_only = _.difference(base_manifest, manifest); // in base NOT in derived
                        manifest = _.union(manifest, base_manifest);
                        excludes = _.union(excludes, base_repo_only);
                        // copy base_repo_only files to derived repo
                        async.eachSeries(base_repo_only, function(file, cb) {
                            fs.copy(path.join(gru_dir, repo_name, file), path.join(cwd, file), cb);
                        }, cb);
                    }
                ], cb);
            }, cb);
        },
        // update locally excluded files in .git/info/exclude
        function(cb) {
            var exclude_str = '\n# gru excludes:\n'+excludes.join('\n')+'\n';
            fs.appendFile(path.join(cwd, '.git/info/exclude'), exclude_str, cb);
        }
    ], function(err) {
        if (!err || err === 'skip_to_end') {
            callback(null, repo_name, manifest, excludes);
        } else {
            callback(err);
        }
    });
}

function log(msg) {
    process.stdout.write('[gru]: '+msg+'\n');
}

function exec(command, cwd, callback) {
    process.stdout.write('[cmd]: '+command+'\n');
    child_process.exec(command, {cwd: cwd, env: env}, function(err, stdout, stderr) {
        if (err) {
            process.stderr.write(stderr);
            return exit(err);
        }
        var output = stdout.toString()+'\n'+stderr.toString();
        process.stdout.write('[git]: '+(output.trim().replace(new RegExp('\n', 'g'), '\n[git]: '))+'\n');
        callback(null, output);
    });
}

function exit(err) {
    if (err && err !== 'exit') {
        process.stdout.write('[gru]: '+err.toString()+'\n');
        process.exit(err.code || 1);
    } else {
        process.exit();        
    }
}