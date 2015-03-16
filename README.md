## What is gru?
Gru (Git Repo Unifier) is a tool that offers a flexible solution to having a project's codebase distributed across multiple git repositories.  It allows you to clone one repo and have the contents of another repo automatically merged in, but excluded from the first repo's index of tracked files.  This in turn allows a project's entire codebase to be pulled in from different repos and set up for development while *constricting* git to only see files/directories from one repo at a time.  Gru can be used as a drop-in replacement for all git commands, since all parameters passed to gru are proxied through to git itself — it does all its work by adding side effects to some of the common git commands.  This behavior is controlled in the ```gru.yml``` config file, which gru will look for and parse in each repo it handles.

The relationship between repos is defined by saying that the *derived* repo *inherits* content from one or more *base* repos; this concept of [inheritance](http://en.wikipedia.org/wiki/Inheritance_%28object-oriented_programming%29#Types_of_inheritance) is borrowed from object-oriented programming.  By including a ```gru.yml``` config file at the root of the repo, you can define one or more repos whose files you want to essentially treat as part of the project on your local copy.  Within the config file, gru expects the property ```derives-from``` to be an array of the sources the repo will inherit from.

The command ```gru clone <repo>``` will first run ```git clone``` to do the respective clone, and then it will look for the ```gru.yml``` file and recursively clone each referenced repo, and then copy its file structure to the derived repo.  Each file that is copied to the derived repo is also added to its ```.git/info/exclude``` file which behaves like ```.gitignore``` but is kept on the local repo only.

#### Why not simply use submodules?
Git's [submodules](http://git-scm.com/book/en/v2/Git-Tools-Submodules) allow a project to reference other git repositories as sources to be included in the current repository, and similarly can recursively clone all dependent submodules into the project.

Submodules are the appropriate tool to use when the other repository you're referencing is a library or another dependency that can be embedded as a subdirectory, but not when it contains the main project root that you want your current repository to extend from.  Gru permits the final arrangement of files and directories for the combined repos to be completely independent from the origin of the files.

#### What are some practical use cases for gru?
- Cases where you want two portions of the same project to remain completely separate from each other, but allow them to overlap the same directory hierarchy (i.e. separating additional private files that may be scattered throughout a public directory tree).
- Applying complex access control to projects down to the file level, where file permissions are determined by those of the repo that contains them.
- Aggregating scattered repositories of config or data files to facilitate editing and testing.

## Installation
Better installation instructions to follow — for now just clone the project somewhere, edit the ```scripts/gru``` script to reflect the gru project folder location, and then create a symbolic link pointing to it and put the link in ```/usr/bin``` or somewhere that is defined in your ```$PATH```.

## Usage
```
gru clone <repo>
```
More commands/options to follow...

Note that this project is still in the early stages of development and should not be used to blindly deploy code to production.

####TODO####
- Add tests
- Support ```gru init```
- Allow base repos to be selected for modification, swapping out ```.git``` directories and updating excludes accordingly.
- Show security notifications and confirmations for "risky" operations:
  + On commit or status, optionally notify when changes are made to untracked files (belonging to other repos not currently selected for modification)
  + Add option to force user confirmation of any change made to any base repo, to prevent accidentally committing sensitive information to the wrong repo.