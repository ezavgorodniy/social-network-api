// Live smoke test (PLAN.md step 11).
//
// A standalone Node application that exercises the REAL Facebook Graph API with a
// real Page Access Token: it fetches a post's comments, posts a reply, re-fetches
// to confirm the reply is visible, then (by default) deletes the reply it created.
// Run manually — never in CI. See docs/README.md "Live smoke test".
//
// The token is supplied as a CLI parameter (falling back to FACEBOOK_ACCESS_TOKEN)
// and is never logged.

// Relative imports (not the @app/* tsconfig alias) so `ts-node` runs this
// standalone script without a path-resolution shim.
import { FetchHttpClient } from '../../src/http-client/fetch-http-client';
import type { HttpClient } from '../../src/http-client/http-client';
import type { TokenProvider } from '../../src/auth/token-provider';
import { FacebookAdapter } from '../../src/platforms/facebook-adapter';
import type { PlatformComment } from '../../src/platforms/platform-adapter';

const GRAPH_API_BASE_URL = 'https://graph.facebook.com/v21.0';
const REPLY_MARKER = 'live-smoke';

interface SmokeOptions {
  readonly token: string;
  readonly postId: string;
  readonly cleanup: boolean;
}

/** A minimal TokenProvider seeded with a fixed token (no request scope here). */
class StaticTokenProvider implements TokenProvider {
  constructor(private readonly token: string) {}

  getToken(): string {
    return this.token;
  }
}

class SmokeTestError extends Error {}

function parseArgs(argv: readonly string[]): SmokeOptions {
  const values = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match !== null) {
      const key = match[1];
      const value = match[2];
      if (key !== undefined && value !== undefined) {
        values.set(key, value);
      }
    }
  }

  const token = values.get('token') ?? process.env.FACEBOOK_ACCESS_TOKEN;
  const postId = values.get('post-id');
  const cleanupRaw = values.get('cleanup');

  if (token === undefined || token.trim() === '') {
    throw new SmokeTestError(
      'Missing token. Pass --token=<ACCESS_TOKEN> or set FACEBOOK_ACCESS_TOKEN.',
    );
  }
  if (postId === undefined || postId.trim() === '') {
    throw new SmokeTestError('Missing post id. Pass --post-id=<{page-id}_{post-id}>.');
  }
  if (cleanupRaw !== undefined && cleanupRaw !== 'true' && cleanupRaw !== 'false') {
    throw new SmokeTestError(`Invalid --cleanup value: ${cleanupRaw} (expected true or false).`);
  }

  return {
    token: token.trim(),
    postId: postId.trim(),
    // Cleanup defaults to true; only an explicit --cleanup=false opts out.
    cleanup: cleanupRaw !== 'false',
  };
}

async function deleteComment(
  httpClient: HttpClient,
  token: string,
  commentExternalId: string,
): Promise<void> {
  const response = await httpClient.send({
    method: 'DELETE',
    url: `${GRAPH_API_BASE_URL}/${encodeURIComponent(commentExternalId)}`,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new SmokeTestError(
      `Cleanup failed: Graph API returned status ${response.status} deleting ${commentExternalId}.`,
    );
  }
}

async function run(options: SmokeOptions): Promise<void> {
  const httpClient: HttpClient = new FetchHttpClient();
  const tokenProvider: TokenProvider = new StaticTokenProvider(options.token);
  const adapter = new FacebookAdapter(httpClient, tokenProvider);

  let createdReply: PlatformComment | undefined;

  try {
    console.log(`[1/3] Fetching comments for post ${options.postId}…`);
    const initialPage = await adapter.fetchComments(options.postId, { limit: 25 });
    console.log(`      Fetched ${initialPage.comments.length} comment(s).`);

    const replyContent = `${REPLY_MARKER} ${new Date().toISOString()}`;
    console.log('[2/3] Posting a reply…');
    createdReply = await adapter.postReply(options.postId, replyContent);
    console.log(`      Posted reply with external id ${createdReply.externalId}.`);

    console.log('[3/3] Re-fetching to confirm the reply is visible…');
    const confirmPage = await adapter.fetchComments(options.postId, { limit: 100 });
    const found = confirmPage.comments.some(
      (comment) => comment.externalId === createdReply?.externalId,
    );
    if (!found) {
      throw new SmokeTestError(
        `Reply ${createdReply.externalId} did not appear in the re-fetched comments.`,
      );
    }
    console.log('      Confirmed: reply is visible on the post.');
  } finally {
    // Cleanup runs even on failure, so a partially-created reply is not orphaned.
    if (options.cleanup && createdReply !== undefined) {
      console.log(`Cleaning up: deleting reply ${createdReply.externalId}…`);
      await deleteComment(httpClient, options.token, createdReply.externalId);
      console.log('Cleanup complete.');
    } else if (!options.cleanup && createdReply !== undefined) {
      console.log(
        `Skipping cleanup (--cleanup=false); reply ${createdReply.externalId} left in place.`,
      );
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await run(options);
  console.log('\nLive smoke test PASSED.');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nLive smoke test FAILED: ${message}`);
  process.exitCode = 1;
});
