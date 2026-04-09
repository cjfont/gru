## What is gru?
Gru (Git Repo Unifier) is a tool that offers a flexible solution to having a project's codebase distributed across multiple git repositories. It allows you to clone one repo and have the contents of another repo automatically merged in, but excluded from the first repo's index of tracked files. This in turn allows a project's entire codebase to be pulled in from different repos and set up for development while *constricting* git to only see files/directories from one repo at a time. Gru can be used as a drop-in replacement for all git commands, since all parameters passed to gru are proxied through to git itself — it does all its work by adding side effects to some of the common git commands. This behavior is controlled in the `gru.yml` config file, which gru will look for and parse in each repo it handles.

The relationship between repos is established by saying that the *derived* repo *inherits* content from one or more *base* repos; this concept of [inheritance](http://en.wikipedia.org/wiki/Inheritance_%28object-oriented_programming%29#Types_of_inheritance) is borrowed from object-oriented programming. By including a `gru.yml` config file at the root of the repo, you can define one or more repos whose files you want essentially treated as part of the project on your local copy.

The command `gru clone <repo>` will first run the usual `git clone` command to do the respective clone, then it will look for the `gru.yml` file and recursively clone any repo it lists under `derives-from`, after which it will copy its file structure to the derived repo. Each file that is copied to the derived repo is also added to git's `.git/info/exclude` file which behaves exactly like `.gitignore` but whose rules are only applicable to the local repo.

#### Why not simply use submodules?
Git's [submodules](http://git-scm.com/book/en/v2/Git-Tools-Submodules) allow a project to reference other git repositories as sources to be included in the current repository, and similarly can recursively clone all dependent submodules into the project.

Submodules are the appropriate tool to use when the other repository you're referencing is a library or another dependency that can be embedded as a subdirectory, but not when it contains the main project root that you want your current repository to extend from. Gru permits the final arrangement of files and directories for the combined repos to be completely independent from the origin of the files.

#### What are some practical use cases for gru?
- Cases where you want two portions of the same project to remain completely separate from each other, but allow them to overlap the same directory hierarchy (i.e. separating additional private files that may be scattered throughout a public directory tree).
- Applying complex access control to projects down to the file level, where file permissions are determined by those of the repo that contains them.
- Aggregating scattered repositories of config or data files to facilitate editing and testing.

## Installation
Make sure you have [NPM](https://www.npmjs.com) installed, then run:
```
npm install -g gru
```

## Configuration (`gru.yml`)

Place a `gru.yml` file at the root of your derived repo to define which base repos to merge in.

**Simple form** — just a URL:
```yaml
derives-from:
  - https://github.com/user/first-base-repo
  - https://github.com/user/another-base-repo
```

**Extended form** — with optional `ref`, `include`, and `exclude`:
```yaml
derives-from:
  - url: https://github.com/user/private-config
    ref: main                  # branch, tag, or commit SHA (optional)
    include:                   # only copy files matching these patterns (optional)
      - config/**
      - scripts/**
    exclude:                   # skip files matching these patterns (optional)
      - "*.test.js"
  - https://github.com/user/another-base-repo   # short form still works
```

The two forms can be mixed freely. `include` and `exclude` support `*` (any non-separator chars), `**` (any chars including `/`), and `?` (single non-separator char) glob patterns.

Base repos are cloned into a `.gru/` directory inside the derived repo. All base-only files are copied into the derived repo's working directory and automatically added to `.git/info/exclude` so they remain invisible to git. State about the merged repos is stored in `.gru/state.json`.

## Commands

### `gru clone <repo> [git-clone-options]`
Clone a derived repo and automatically merge in all base repos from its `gru.yml`.

```
gru clone https://github.com/user/my-project
```

Base repos are cloned in parallel for speed; files are applied in the order listed in `gru.yml` for deterministic conflict resolution (derived repo always wins, then first base, then second, etc.).

### `gru init`
Interactively create a `gru.yml` in the current directory. Prompts for base repo URLs and optional per-repo settings. In non-interactive (piped) environments, writes a commented template instead.

```
gru init
```

### `gru update`
Pull the latest changes from all base repos and sync updated files into the derived repo's working directory. Adds newly created files, updates changed files, and removes files that were deleted from the base repos.

```
gru update
```

Warns if any base repo files have been locally modified before overwriting them. State in `.gru/state.json` is updated after each successful sync.

### `gru status`
Runs the standard `git status` and then appends a gru-specific section listing any base repo files that have been locally modified (i.e. their working copy differs from the copy in `.gru/`). These files are git-excluded and will not appear in the normal git status output.

```
gru status
```

### `gru list`
Display all base repos currently merged into this derived repo, including their URL, ref (if set), last-synced commit hash, and the list of files they contributed.

```
gru list
```

### `gru commit [git-commit-options]`
Runs `git commit` but first checks whether any base repo files have been locally modified. If so, prints a warning identifying which files were changed and which repos own them, so you don't accidentally think those changes are being committed.

```
gru commit -m "my message"
```

### All other commands
Any command not listed above is passed directly through to git:

```
gru pull
gru push origin main
gru log --oneline
```

## Global flags

| Flag | Description |
|------|-------------|
| `--verbose` / `-v` | Show extra detail, including `git ls-files` output during clone/update |
| `--quiet` / `-q` | Suppress all `[gru]:` log output |

## Security and safety

**File conflict resolution** — When a file exists in both the derived repo and a base repo, the derived repo's version always takes precedence. A warning is printed for each conflict so you are aware of the override.

**Circular dependency detection** — If repo A derives from B and B derives from A (directly or transitively), gru will detect the cycle and abort with an error rather than looping infinitely.

**Commit safety** — Running `gru commit` checks for locally modified base repo files and warns you before proceeding. Because those files are git-excluded, the modifications will not be included in the commit. This prevents confusion about why changes seem to disappear.

**Base repo modifications on update** — `gru update` warns you if a base repo file has been locally modified and is about to be overwritten by the upstream version. Because base-only files are not tracked by the derived repo, this is the only protection against losing those local edits.

**`.git/info/exclude` management** — Gru writes its exclusions between `# --- gru excludes begin ---` and `# --- gru excludes end ---` markers so they can be cleanly updated on subsequent `gru update` runs without touching the rest of the file.

## State file (`.gru/state.json`)

After a `gru clone` or `gru update`, gru writes a `.gru/state.json` file recording the URL, ref, current commit hash, and list of contributed files for each base repo. This is used by `gru update`, `gru list`, `gru status`, and `gru commit`. It should be committed to the derived repo if you want other developers to see the same base repo metadata.
