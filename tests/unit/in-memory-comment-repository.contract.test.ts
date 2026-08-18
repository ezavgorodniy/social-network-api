import type { Post } from '@app/domain/comment';
import { InMemoryCommentRepository } from '../support/in-memory-comment-repository';
import {
  runCommentRepositoryContract,
  type CommentRepositoryHarness,
} from '../support/comment-repository.contract';

const harness: CommentRepositoryHarness<InMemoryCommentRepository> = {
  createRepository: () => new InMemoryCommentRepository(),
  seedPost: (repository: InMemoryCommentRepository, post: Post) => {
    repository.seedPost(post);
  },
};

describe('InMemoryCommentRepository (contract)', () => {
  runCommentRepositoryContract(harness);
});
