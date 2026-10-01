#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")"
command -v gh >/dev/null || { print 'Install GitHub CLI first: brew install gh'; exit 1; }
gh auth status >/dev/null 2>&1 || gh auth login -h github.com
OWNER=$(gh api user --jq .login)
REPOSITORY="$OWNER/boarding-pass-studio"
if ! git remote get-url origin >/dev/null 2>&1; then
  if gh repo view "$REPOSITORY" >/dev/null 2>&1; then
    print "A repository already exists at $REPOSITORY. No files were pushed. Configure the desired git remote before rerunning."
    exit 1
  fi
  gh repo create "$REPOSITORY" --public --source=. --remote=origin
fi
REMOTE_URL=$(git remote get-url origin)
if [[ "$REMOTE_URL" != "https://github.com/$REPOSITORY.git" && "$REMOTE_URL" != "https://github.com/$REPOSITORY" && "$REMOTE_URL" != "git@github.com:$REPOSITORY.git" ]]; then
  print "Unexpected git remote: $REMOTE_URL. No files were pushed."
  exit 1
fi
git push -u origin main
if ! gh api "repos/$REPOSITORY/pages" >/dev/null 2>&1; then
  gh api --method POST "repos/$REPOSITORY/pages" -f build_type=workflow >/dev/null
else
  gh api --method PUT "repos/$REPOSITORY/pages" -f build_type=workflow >/dev/null
fi
gh workflow run pages.yml --repo "$REPOSITORY" --ref main
print "Deployment started: https://github.com/$REPOSITORY/actions"
print "Site URL after the workflow succeeds: https://$OWNER.github.io/boarding-pass-studio/"
print 'Signing downloads require a hosted backend and the VITE_API_BASE repository variable; see README.md.'
read '?Press Enter to close…'
