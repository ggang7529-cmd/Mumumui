# 책갈피 (Mumumui)

A book review site: `index.html` (static frontend) plus a Cloudflare Pages Functions API in `functions/` backed by a Cloudflare D1 (SQLite) database. No Firebase — Google login is done client-side with Google Identity Services (GSI), and the ID token is verified server-side in a Function using Web Crypto against Google's public JWKS. Sessions are a signed HttpOnly cookie (HMAC-SHA256), not a database-backed session table.

Setup the user still needs to do in the Cloudflare/Google dashboards (not doable from this sandbox):
- Create a D1 database, bind it to the Pages project as `DB` (Settings → Functions → D1 database bindings), and run `schema.sql` against it via the D1 Console tab.
- Set two Pages environment variables/secrets: `GOOGLE_CLIENT_ID` (from a Google Cloud OAuth 2.0 Web client) and `SESSION_SECRET` (any long random string, used to sign session cookies).
- Add the Pages `*.pages.dev` domain (and any custom domain) as an Authorized JavaScript origin on that Google OAuth client.
- Put the same `GOOGLE_CLIENT_ID` into `index.html`'s `GOOGLE_CLIENT_ID` constant (it's a public identifier, fine to commit).

API routes live under `functions/api/`; shared helpers (session signing, Google token verification, JSON helpers) are in `functions/_lib/`, which Pages Functions' router ignores (leading underscore) so it's safe for non-route code.

## Workflow

The user wants local changes pushed to GitHub automatically, without being asked each time. After making and verifying a set of edits in a turn, commit them with a descriptive message and `git push` to `origin main` — do not wait for explicit "commit and push" instructions first. Still use judgment: don't push half-finished or broken edits, and if a push would overwrite unexpected remote history, stop and check with the user rather than force-pushing.

Note: this codespace's default git credentials only have access to the codespace's own origin repo, not `Mumumui`, and the sandbox's safety classifier blocks persisting a personal access token to disk (`gh auth login`, `~/.git-credentials`). So a fresh session has no push access until the user pastes a `repo`-scoped PAT again; once given, push with it embedded directly in the push URL (`git push https://<token>@github.com/ggang7529-cmd/Mumumui.git main`) rather than trying to store it.
