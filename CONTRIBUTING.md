# Contributing

Developer-facing setup and workflow for the Multi-Platform Comment System. For the
architecture, data model, and API reference, see [`docs/README.md`](docs/README.md);
design decisions live as ADRs under [`docs/adrs/`](docs/adrs/).

## Running locally

Prerequisites: Node.js (>= 22), Docker (for PostgreSQL).

```bash
npm ci
cp .env.example .env                 # then fill in the values
docker compose up -d db              # start local PostgreSQL
npm run prisma:migrate               # apply migrations
npm run start:dev                    # start the API in watch mode
```

Example requests (replace the token and IDs):

```bash
# Retrieve comments for a post
curl -H "X-Platform-Token: <ACCESS_TOKEN>" \
  http://localhost:3000/api/v1/posts/<POST_ID>/comments

# Reply to a comment
curl -X POST \
  -H "X-Platform-Token: <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"content":"Thanks for the feedback!"}' \
  http://localhost:3000/api/v1/comments/<COMMENT_ID>/replies
```

## Testing

See [ADR 8](docs/adrs/0008-testing-and-ci-strategy.md) for the full strategy.

```bash
npm test                 # unit + integration + e2e, with the 95% coverage gate
```

- **Unit** tests run against the in-memory repository and a mocked `HttpClient` — no
  database, no network.
- **Integration** tests run `PrismaCommentRepository` against the Dockerized
  PostgreSQL (start it with `docker compose up -d db` first).
- **E2E** tests drive the Nest app with `supertest`.

CI (GitHub Actions) runs the same suite on push/PR with a PostgreSQL service
container and enforces the coverage gate. Security scanning, image publishing, and
deployment are out of CI scope for this iteration.

## Live smoke test

A standalone Node application that exercises the **real Facebook Graph API** with a
real token. Run it manually — never in CI.

```bash
npm run smoke -- --token <ACCESS_TOKEN> --post-id <POST_ID> [--cleanup=false]
```

It fetches comments for the post, posts a reply, and re-fetches to confirm the reply
appears. Every resource it creates is deleted afterwards (cleanup defaults to `true`
and runs even on failure); pass `--cleanup=false` to leave them for inspection. The
token is passed as a CLI parameter (falling back to `FACEBOOK_ACCESS_TOKEN`) and is
never logged. Exit code is `0` on success, non-zero on any failure.

### Getting a Facebook token

The API itself is bring-your-own-token (see the
[Authentication section in `docs/README.md`](docs/README.md#authentication)); this
section only covers how to obtain a real token for the smoke test. Reading and
replying to comments on a published Page post requires a **Page Access Token** (a
personal user token cannot post replies as the Page), with these scopes:

- `pages_read_user_content` — read user-generated comments (`GET /{post}/comments`).
- `pages_manage_engagement` — post replies (`POST /{comment}/comments`). Meta lists
  `pages_read_user_content` as a **dependency** of this scope, so the login dialog
  always requests both; removing `pages_read_user_content` yields an *"Invalid
  Scopes"* error even when you did not tick it.
- `pages_show_list` — a dependency of the above; lets the token enumerate the Page.

Note `pages_read_engagement` is **not** the right scope here — it covers
*Page-authored* content and insights, not user comments. Do not substitute it.

1. **Create a Meta app.** At [developers.facebook.com/apps](https://developers.facebook.com/apps),
   create an app. You can start with **"Create an app without a use case"** for a
   bare app ID, but the current Meta dashboard funnels all permissions through use
   cases — from the app **Dashboard** you must click **"+ Add use cases"** and add
   **"Manage everything on your Page"** (the Pages API) before the `pages_*` scopes
   become selectable in the Graph API Explorer. Until a Pages use case is attached,
   the Explorer only offers `public_profile` (and Facebook Login may report
   *"Feature unavailable"* on a freshly created app — wait a few minutes and reload).
   Least privilege is therefore enforced at the **token scope** (step 3), not the
   use-case picker. You need a Facebook account that administers the Page you will
   test against.

   > **TODO:** Research a genuine least-privilege path. The Pages use case bundles
   > broader permissions than this workflow needs. Investigate whether a System User
   > token (Business Manager) or a narrower product setup can grant only
   > `pages_read_user_content` + `pages_manage_engagement` (+ `pages_show_list`)
   > without the full "Manage everything on your Page" use case, and update these
   > instructions accordingly.
2. **Open the Graph API Explorer.** Go to
   [Graph API Explorer](https://developers.facebook.com/tools/explorer/) and select
   your app.
3. **Generate a User Token** granting `pages_show_list`, `pages_read_user_content`,
   and `pages_manage_engagement`. In the **Permissions** panel, open **Add a
   Permission → Pages** and tick those three (leave everything else unchecked; the
   dropdown is scrollable). All three must be **added to the use case** first, or
   the login dialog fails with *"Invalid Scopes: pages_read_user_content"* — this
   happens even in a fresh incognito session and even when the scope is unticked,
   because `pages_manage_engagement` depends on it. To add it: **My Apps →
   test-social-api → Use cases → Manage everything on your Page → Customize**, then
   on the **Permissions** tab click **+ Add** next to `pages_read_user_content`
   (and confirm the other two are present). **Generate Access Token** stays greyed
   out ("Please select at least one permission or configuration") until at least
   one scope is ticked.
4. **Switch to a Page Access Token.** In the Explorer's token dropdown, select your
   Page instead of *User Token*. This yields a token scoped to that Page.
5. **(Optional) Extend the lifetime.** Explorer tokens are short-lived (~1–2 hours).
   Inspect expiry with the
   [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/),
   or exchange for a long-lived token via
   `GET /oauth/access_token?grant_type=fb_exchange_token`.

The `--post-id` is a post on that Page, in the form `{page-id}_{post-id}`.

#### Setting up a test Page and finding the ids

The smoke test acts on a **Page you administer** — a personal user token alone is
not enough. If your account has no Page yet:

1. Create one at [facebook.com/pages/create](https://www.facebook.com/pages/create).
2. Publish at least one post (the Page's **"What's on your mind?"** box), and add a
   comment to it so `fetchComments` has something to return.
3. Re-generate the token (steps 2–4 above) **after** the Page exists, so it is
   included; a token minted before the Page existed will not see it.

Then resolve the Page Access Token and post id with the Graph API (replace
`<USER_TOKEN>`):

```bash
# List the Pages the token can manage → gives {page-id} and a per-Page access_token
curl -s -G "https://graph.facebook.com/v21.0/me/accounts" \
  --data-urlencode "fields=id,name,access_token" \
  -H "Authorization: Bearer <USER_TOKEN>"

# List that Page's posts → gives the full {page-id}_{post-id}
curl -s -G "https://graph.facebook.com/v21.0/<PAGE_ID>/posts" \
  --data-urlencode "fields=id,message,created_time" \
  -H "Authorization: Bearer <PAGE_ACCESS_TOKEN>"
```

If `me/accounts` returns an empty list, the token predates the Page (or no Page was
granted in the login dialog) — regenerate it. Use the **Page** `access_token` (not
the user token) for `--token`, so replies are authored as the Page. Verify a token's
type and scopes any time with `GET /debug_token?input_token=<TOKEN>`.

#### Running it

```bash
# Full run with cleanup (default): fetch → reply → confirm → delete the reply
npm run smoke -- --token <PAGE_ACCESS_TOKEN> --post-id <PAGE_ID>_<POST_ID>

# Leave the created reply in place for manual inspection
npm run smoke -- --token <PAGE_ACCESS_TOKEN> --post-id <PAGE_ID>_<POST_ID> --cleanup=false
```

Expected output ends with `Live smoke test PASSED.` (exit `0`); any API error or
failed assertion prints `Live smoke test FAILED: …` and exits non-zero.

**Handling the token locally.** The token is a live credential — never commit it.
Pass it inline (`npm run smoke -- --token <TOKEN> ...`) or via the
`FACEBOOK_ACCESS_TOKEN` env var. If you must stash it in a file while testing, keep
it under a git-ignored path (e.g. `.claude/fb-token-gitignore.txt`, matched by the
`*token*.txt` rule in `.gitignore`) and delete it once done. Confirm it is ignored
with `git check-ignore -v <path>` before any commit.
