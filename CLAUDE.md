# 책갈피 (Mumumui)

Single-file static app (`index.html`) — a book review site backed by Firebase Auth (Google login) and Firestore.

## Workflow

The user wants local changes pushed to GitHub automatically, without being asked each time. After making and verifying a set of edits in a turn, commit them with a descriptive message and `git push` to `origin main` — do not wait for explicit "commit and push" instructions first. Still use judgment: don't push half-finished or broken edits, and if a push would overwrite unexpected remote history, stop and check with the user rather than force-pushing.

Note: this codespace's default git credentials only have access to the codespace's own origin repo, not `Mumumui`, and the sandbox's safety classifier blocks persisting a personal access token to disk (`gh auth login`, `~/.git-credentials`). So a fresh session has no push access until the user pastes a `repo`-scoped PAT again; once given, push with it embedded directly in the push URL (`git push https://<token>@github.com/ggang7529-cmd/Mumumui.git main`) rather than trying to store it.
