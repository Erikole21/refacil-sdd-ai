---
name: refacil:up-code
description: Push code and create PR for integration — git add, commit, push, and PR to the target branch
user-invocable: true
---

# refacil:up-code — Integrate Code and Publish Changes

Pushes changes to the remote repository and generates the PR for integration.
Applies the branch and integration policy defined in `refacil-prereqs/METHODOLOGY-CONTRACT.md` (no exceptions).

**Prerequisites**: `agents` profile from `refacil-prereqs/SKILL.md` + rules from `METHODOLOGY-CONTRACT.md` (branch policy applies without exceptions).

## Instructions

### Step 1: Detect and validate current branch

Run `git branch --show-current` to get the branch name.

Run `refacil-sdd-ai sdd config --json` to obtain the effective `protectedBranches` list for this project.
If the command fails or exits non-zero, use the default list: master, main.

- If the current branch is in the `protectedBranches` list, **stop** and inform the user:
  ```
  Cannot push code from a protected branch ([name]).
  Branch validation is done in /refacil:apply or /refacil:bug before writing code.
  Switch to your working branch (feature/*, fix/*, etc.) and run /refacil:up-code again.
  ```
- If the branch is a working branch (`feature/*`, `fix/*`, `hotfix/*`, `refactor/*`, etc.), continue.

### Step 2: Verify review (mandatory)

Before continuing, verify if there are active changes in `refacil-sdd/changes/` (exclude the `archive/` folder).

If there are active changes:
1. For each active folder, verify if the `.review-passed` file exists (hidden marker: **`METHODOLOGY-CONTRACT.md` §8** — do not conclude from `ls` without `-a`).
2. If **all** have `.review-passed` → continue to step 3.
3. If there is **one single** folder without `.review-passed`:
   - Inform the user which one.
   - Automatically run `/refacil:review <change-name>` on that change.
   - If the review approves (creates `.review-passed`) → continue to step 3.
   - If the review requires corrections → stop and inform the user of the findings.
4. If there are **multiple** folders without `.review-passed`:
   - Stop the flow and ask the user to explicitly select which change to push.
   - Run `/refacil:review <selected-change-name>` only for that change.
   - Do not run automatic bulk review in this case.

**IMPORTANT**: `/refacil:review` internally verifies if `.review-passed` exists and if there are changes after it. It only re-runs if it detects new changes after the last approved review.

If there is no `refacil-sdd/changes/` folder or no active changes → continue to step 3 (nothing to review).

### Step 3: Verify pending changes

Run `git status` to verify if there are changes to push.

- If there are no pending changes or unpushed commits, inform the user and stop.
- If there are uncommitted changes, continue to step 4.
- If there are only unpushed commits (nothing to commit), jump directly to step 5.

### Step 4: Commit changes

1. Run `git status --short` and show the user the list of detected files.
2. Ask for explicit confirmation before staging everything.
3. If the user confirms global staging, use `git add -A`.
4. If the user requests partial staging, add only the indicated paths.
5. If the user provided a message as argument (`$ARGUMENTS`), use it as the commit message.
6. If no message was provided, generate a descriptive one based on the detected changes with `git diff --staged --stat`.
7. Run `git commit -m "[message]"`.

### Step 5: Push to remote

Run `git push -u origin [current-branch]` to push the changes.

### Step 6: Confirm and create PR

1. Show the push summary:
```
=== Code pushed ===
 Branch: [branch-name]
 Commit: [short-hash] [message]
 Remote: origin/[branch-name]
```

2. **Ask the user** which branch they want to create the PR to. Show the list of protected branches obtained from `sdd config --json` in Step 1 so the user can pick one:
   ```
   Which branch do you want to create the PR to?
   Protected branches available: [list from sdd config --json]
   ```

  Verify the chosen branch exists on the remote by inspecting `git branch -r` output before generating the link. If it does not exist, inform the user and ask them to confirm or correct the name. If the user indicates a branch not in the protected branches list, warn them before proceeding.

3. Get the remote repository URL with `git remote get-url origin` and detect the VCS hosting used by this repository to generate the correct PR/MR link:
   - **GitHub** (url contains `github.com`): `https://github.com/[owner]/[repo]/compare/[target-branch]...[current-branch]?expand=1`
   - **Bitbucket Cloud** (url contains `bitbucket.org`): `https://bitbucket.org/[workspace]/[repo]/pull-requests/new?source=[current-branch]&dest=[target-branch]`
   - **GitLab** (url contains `gitlab.` or `gitlab.com`): `https://[gitlab-host]/[group]/[repo]/-/merge_requests/new?merge_request[source_branch]=[current-branch]&merge_request[target_branch]=[target-branch]`
   - **Azure DevOps** (url contains `dev.azure.com` or `visualstudio.com`): build the "create PR" URL for the detected project/repo using source and target branches.
   - For SSH remotes (`git@host:group/repo.git`), extract host/namespace/repo from the segment after `:`.
   - If hosting cannot be determined, do not assume a provider: show the detected remote URL and ask the user which platform is used before generating the final PR/MR link.

4. Show the generated link (provider-specific) to the user:
```
 Create your PR here: [link]

 Tip: PRing to a protected branch (e.g. one of those listed by `sdd config --json`) is recommended
 before promoting to main/master.
```

**This is the terminal step of the SDD flow.** Do not ask for a next skill — the cycle closes here. Apply the terminal step rule from `METHODOLOGY-CONTRACT.md §5`.

## Rules

- Strictly respect the protected branch and PR integration policy from `METHODOLOGY-CONTRACT.md`
- If the current branch is protected, **stop** — branch validation/change is done in `/refacil:apply` or `/refacil:bug`, not here
- Do not force push (--force) unless the user explicitly asks for it
