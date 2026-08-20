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
npm run start:dev                    # start the API in watch mode (port 3000)
```

## Trying the API end-to-end

This slice has **no "publish a post" endpoint** — posts are assumed to be created by
the wider scheduling product (see [ADR 9](docs/adrs/0009-persist-posts-cache-comments.md)).
So `GET /posts/:postId/comments` needs a `Post` row to exist first, keyed by *our*
internal id. Without one, every request 404s. The seed script creates that anchor.

### 1. Seed a post

```bash
# Point the seed at a real Facebook post ({page-id}_{post-id}) you administer, so
# the live GET has something to fetch. Omitting it uses a placeholder externalId.
SEED_POST_EXTERNAL_ID=<PAGE_ID>_<POST_ID> npm run seed
# -> Seeded Post id=post_test_1 platform=FACEBOOK externalId=<PAGE_ID>_<POST_ID>
```

`post_test_1` is now your `:postId`. (See "Getting a Facebook token" below for how to
obtain a Page token and post id.)

### 2. Retrieve comments (fetches live from the platform, caches, returns)

```bash
TOKEN='<PAGE_ACCESS_TOKEN>'    # quote it; Facebook tokens contain no spaces but this avoids paste mishaps

curl -s -H "X-Platform-Token: $TOKEN" \
  http://localhost:3000/api/v1/posts/post_test_1/comments | jq
```

Expected `200`:

```json
{
  "data": [
    { "id": "<COMMENT_ID>", "postId": "post_test_1", "platform": "FACEBOOK",
      "externalId": "..._...", "authorHandle": "Some Author", "content": "Pong",
      "parentCommentId": null, "createdAt": "…", "syncedAt": "…" }
  ],
  "nextCursor": null
}
```

The `id` here is **our** internal comment id — copy one and use it as `<COMMENT_ID>`
below. `nextCursor` is the platform's opaque next-page cursor (`null` when there are
no more pages); pass it back as `?cursor=<value>`.

### 3. Reply to a comment (real Graph API call, then persisted)

```bash
curl -s -X POST \
  -H "X-Platform-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Thanks for the feedback!"}' \
  http://localhost:3000/api/v1/comments/<COMMENT_ID>/replies | jq
```

Expected `201` with the created reply (`parentCommentId` points at the comment you
replied to). This **actually posts to the platform** — delete the reply from the Page
afterwards if you don't want it to linger.

### 4. Error paths (no setup needed)

```bash
# 404 POST_NOT_FOUND — unknown post id
curl -i -H "X-Platform-Token: $TOKEN" http://localhost:3000/api/v1/posts/does-not-exist/comments

# 401 MISSING_PLATFORM_TOKEN — no X-Platform-Token header
curl -i http://localhost:3000/api/v1/posts/post_test_1/comments

# 400 INVALID_REQUEST — empty/invalid body
curl -i -X POST -H "X-Platform-Token: $TOKEN" -H "Content-Type: application/json" \
  -d '{}' http://localhost:3000/api/v1/comments/<COMMENT_ID>/replies
```

All errors share the envelope `{ "error": { "code": "...", "message": "..." } }`.

### No Facebook at all?

`npm run test:e2e` drives both endpoints end-to-end with the HTTP boundary mocked —
zero setup, no real token, no network.

### Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Empty output from `curl -s`, no error | A **line break inside the quoted header** splits the command — the shell runs a broken request and `-s` hides it. Put the token in a variable (`TOKEN='...'`) and keep the whole `-H` on one line. Drop `-s` (or add `-i`) while debugging to see the real response. |
| `401 MISSING_PLATFORM_TOKEN` | The `X-Platform-Token` header didn't arrive (missing, misspelled, or mangled by a paste). Verify with `curl -i` that the header is present. |
| `401`/`502 UPSTREAM_PLATFORM_ERROR` on GET | Token expired or lacks scope, or the post's `externalId` isn't real. Test the token directly: `curl "https://graph.facebook.com/v21.0/me?access_token=$TOKEN"`. |
| `404 POST_NOT_FOUND` | No `Post` row for that `:postId`. Run `npm run seed` (step 1) and use the printed id (`post_test_1`). |
| `404 COMMENT_NOT_FOUND` on reply | The `:commentId` is a Facebook external id, not **our** internal id. Use an `id` from a prior GET response (step 2). |
| `jq: command not found` | Install jq, or drop `| jq` — the API returns plain JSON regardless. |
| `DATABASE_URL must be set…` from seed | `.env` missing or not loaded. `cp .env.example .env` and ensure `DATABASE_URL` is set. |

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

It runs the happy path — fetch comments, post a reply, re-fetch to confirm the reply
appears — then a set of **unhappy-path** checks: an invalid token, a nonexistent
post, and a reply to a nonexistent comment must each surface as an
`UpstreamPlatformError`. The unhappy-path checks create nothing, so they need no
cleanup. Every resource the happy path creates is deleted afterwards (cleanup
defaults to `true` and runs even on failure); pass `--cleanup=false` to leave them
for inspection. The token is passed as a CLI parameter (falling back to
`FACEBOOK_ACCESS_TOKEN`) and is never logged. Exit code is `0` on success, non-zero
on any failure.

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
