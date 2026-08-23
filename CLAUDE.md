# 책갈피 (Mumumui)

A book review site: `index.html` (static frontend) plus a Cloudflare Pages Functions API in `functions/` backed by a Cloudflare D1 (SQLite) database. No Firebase — Google login is done client-side with Google Identity Services (GSI), and the ID token is verified server-side in a Function using Web Crypto against Google's public JWKS. Sessions are a signed HttpOnly cookie (HMAC-SHA256), not a database-backed session table.

Adding a book requires searching Kakao's book search API (`/api/search-books`, proxied server-side in `functions/api/search-books.js`) and picking a result — there's no free-text title/author entry anymore, specifically to avoid duplicate/typo'd entries. The picked result's `isbn` is stored on the book row and enforced unique (partial unique index, since older/self-added rows may have no isbn); title is still deduped case-insensitively as a fallback.

Setup the user still needs to do in the Cloudflare/Google/Kakao dashboards (not doable from this sandbox):
- Create a D1 database, bind it to the Pages project as `DB` (Settings → Functions → D1 database bindings), and run `schema.sql` against it via the D1 Console tab.
- Set Pages environment variables/secrets: `GOOGLE_CLIENT_ID` (from a Google Cloud OAuth 2.0 Web client), `SESSION_SECRET` (any long random string, used to sign session cookies), and `KAKAO_REST_API_KEY` (from a Kakao Developers app's REST API key, used server-side only — never exposed to the client).
- Add the Pages `*.pages.dev` domain (and any custom domain) as an Authorized JavaScript origin on that Google OAuth client.
- Put the same `GOOGLE_CLIENT_ID` into `index.html`'s `GOOGLE_CLIENT_ID` constant (it's a public identifier, fine to commit).

API routes live under `functions/api/`; shared helpers (session signing, Google token verification, JSON helpers) are in `functions/_lib/`, which Pages Functions' router ignores (leading underscore) so it's safe for non-route code.

## Workflow

The user wants local changes pushed to GitHub automatically, without being asked each time. After making and verifying a set of edits in a turn, commit them with a descriptive message and `git push` to `origin main` — do not wait for explicit "commit and push" instructions first. Still use judgment: don't push half-finished or broken edits, and if a push would overwrite unexpected remote history, stop and check with the user rather than force-pushing.

Note: this codespace's default git credentials only have access to the codespace's own origin repo, not `Mumumui`. The user ran `gh auth login` themselves (device flow, no token pasted) to get a real `repo`-scoped token stored in `~/.config/gh/hosts.yml` — that persists for the life of this codespace. The catch: the Codespaces-injected `GITHUB_TOKEN`/`GH_TOKEN` env vars take precedence over that stored gh credential, and each Bash tool call starts a fresh shell (env unset doesn't carry over between calls). So every `git push` needs `unset GITHUB_TOKEN GH_TOKEN` in the *same* command, e.g. `unset GITHUB_TOKEN GH_TOKEN && git push origin main`. If this codespace is ever rebuilt and pushes start failing with a 403 again, re-run `gh auth login` (have the user do it via a `!` command, not Claude directly — Claude's own attempts to persist a token to disk get blocked by the sandbox's safety classifier) followed by `gh auth setup-git`.
