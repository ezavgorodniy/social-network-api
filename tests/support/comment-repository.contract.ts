import type { Post } from '@app/domain/comment';
import type { CommentRepository, FetchedComment } from '@app/repositories/comment-repository';

/**
 * Shared behavioural contract for `CommentRepository` (see ADR 0005). Both
 * implementations must satisfy it: unit tests run it against the in-memory
 * double, integration tests run it against `PrismaCommentRepository` backed by a
 * real PostgreSQL container. Asserting the contract once — rather than testing
 * each implementation's internals — is what keeps the two aligned.
 *
 * The harness abstracts the two setup differences: constructing a fresh, empty
 * repository, and making an anchoring `Post` resolvable by `findPostById`
 * (in-memory seeds a map; Prisma inserts a row).
 */
export interface CommentRepositoryHarness<Repository extends CommentRepository = CommentRepository> {
  /** A fresh, empty repository for each test. */
  createRepository(): Promise<Repository> | Repository;
  /** Make `post` resolvable by `findPostById` in the given repository. */
  seedPost(repository: Repository, post: Post): Promise<void> | void;
}

const post: Post = {
  id: 'post-1',
  platform: 'FACEBOOK',
  externalId: 'fb-post-1',
  publishedAt: new Date('2026-01-01T00:00:00Z'),
};

function fetched(overrides: Partial<FetchedComment> & { externalId: string }): FetchedComment {
  return {
    authorHandle: 'alice',
    content: 'hello',
    parentExternalId: null,
    createdAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Runs the full contract against whatever implementation the harness builds.
 * Call inside a `describe` block from the unit and integration suites.
 */
export function runCommentRepositoryContract<Repository extends CommentRepository>(
  harness: CommentRepositoryHarness<Repository>,
): void {
  let repository: Repository;

  beforeEach(async () => {
    repository = await harness.createRepository();
  });

  describe('findPostById', () => {
    it('returns null when the post is unknown', async () => {
      expect(await repository.findPostById('missing')).toBeNull();
    });

    it('returns a seeded post', async () => {
      await harness.seedPost(repository, post);
      expect(await repository.findPostById('post-1')).toEqual(post);
    });
  });

  describe('findCommentById', () => {
    it('returns null when the comment is unknown', async () => {
      expect(await repository.findCommentById('missing')).toBeNull();
    });

    it('returns a comment persisted via upsertComments', async () => {
      await harness.seedPost(repository, post);
      const [row] = await repository.upsertComments({
        post,
        comments: [fetched({ externalId: 'c1' })],
      });
      const found = await repository.findCommentById(row?.id ?? '');
      expect(found).toMatchObject({ externalId: 'c1', postId: 'post-1', platform: 'FACEBOOK' });
    });
  });

  describe('upsertComments', () => {
    beforeEach(async () => {
      await harness.seedPost(repository, post);
    });

    it('returns an empty array for an empty page', async () => {
      expect(await repository.upsertComments({ post, comments: [] })).toEqual([]);
    });

    it('mints internal ids and stitches in postId and platform', async () => {
      const rows = await repository.upsertComments({
        post,
        comments: [fetched({ externalId: 'c1' })],
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        externalId: 'c1',
        postId: 'post-1',
        platform: 'FACEBOOK',
        authorHandle: 'alice',
        content: 'hello',
        parentCommentId: null,
      });
      expect(rows[0]?.id).toBeTruthy();
    });

    it('orders returned rows oldest-first by createdAt', async () => {
      const rows = await repository.upsertComments({
        post,
        comments: [
          fetched({ externalId: 'newer', createdAt: new Date('2026-01-03T00:00:00Z') }),
          fetched({ externalId: 'older', createdAt: new Date('2026-01-02T00:00:00Z') }),
        ],
      });
      expect(rows.map((row) => row.externalId)).toEqual(['older', 'newer']);
    });

    it('is idempotent on (platform, externalId): re-upsert updates, does not duplicate', async () => {
      const [first] = await repository.upsertComments({
        post,
        comments: [fetched({ externalId: 'c1', content: 'first' })],
      });
      const [second] = await repository.upsertComments({
        post,
        comments: [fetched({ externalId: 'c1', content: 'edited' })],
      });
      expect(second?.id).toBe(first?.id);
      expect(second?.content).toBe('edited');
    });

    it('threads a reply to its parent within the same page', async () => {
      const rows = await repository.upsertComments({
        post,
        comments: [
          fetched({ externalId: 'parent' }),
          fetched({ externalId: 'child', parentExternalId: 'parent' }),
        ],
      });
      const parent = rows.find((row) => row.externalId === 'parent');
      const child = rows.find((row) => row.externalId === 'child');
      expect(child?.parentCommentId).toBe(parent?.id);
    });

    it('leaves parentCommentId null when the parent is not present', async () => {
      const rows = await repository.upsertComments({
        post,
        comments: [fetched({ externalId: 'child', parentExternalId: 'absent-parent' })],
      });
      expect(rows[0]?.parentCommentId).toBeNull();
    });

    it('threads a reply to a parent cached in a previous page', async () => {
      const [parent] = await repository.upsertComments({
        post,
        comments: [fetched({ externalId: 'parent' })],
      });
      const [child] = await repository.upsertComments({
        post,
        comments: [fetched({ externalId: 'child', parentExternalId: 'parent' })],
      });
      expect(child?.parentCommentId).toBe(parent?.id);
    });
  });

  describe('upsertComment', () => {
    let parentCommentId: string;

    beforeEach(async () => {
      await harness.seedPost(repository, post);
      const [parent] = await repository.upsertComments({
        post,
        comments: [fetched({ externalId: 'parent' })],
      });
      parentCommentId = parent?.id ?? '';
    });

    it('persists a single authored reply threaded to its parent', async () => {
      const reply = await repository.upsertComment({
        post,
        externalId: 'reply-1',
        authorHandle: 'me',
        content: 'thanks',
        parentCommentId,
        createdAt: new Date('2026-01-04T00:00:00Z'),
      });
      expect(reply).toMatchObject({
        externalId: 'reply-1',
        postId: 'post-1',
        content: 'thanks',
        parentCommentId,
      });
      expect(await repository.findCommentById(reply.id)).toEqual(reply);
    });

    it('is idempotent on (platform, externalId)', async () => {
      const first = await repository.upsertComment({
        post,
        externalId: 'reply-1',
        authorHandle: 'me',
        content: 'first',
        parentCommentId,
        createdAt: new Date('2026-01-04T00:00:00Z'),
      });
      const second = await repository.upsertComment({
        post,
        externalId: 'reply-1',
        authorHandle: 'me',
        content: 'edited',
        parentCommentId,
        createdAt: new Date('2026-01-05T00:00:00Z'),
      });
      expect(second.id).toBe(first.id);
      expect(second.content).toBe('edited');
    });
  });
}
