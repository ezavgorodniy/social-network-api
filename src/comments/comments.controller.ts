import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';

import { ZodValidationPipe } from '@app/common/zod-validation.pipe';
import { CommentService } from './comment-service';
import {
  createReplyBodySchema,
  listCommentsQuerySchema,
  type CreateReplyBody,
  type ListCommentsQuery,
} from './dto/request';
import {
  toCreateReplyResponse,
  toListCommentsResponse,
  type CreateReplyResponse,
  type ListCommentsResponse,
} from './dto/response';

/**
 * REST surface for comments (see PLAN.md). The `/api/v1` prefix is applied
 * globally at bootstrap (step 9). zod pipes validate input at the boundary and
 * throw `InvalidRequestError` (400); the service throws the other typed domain
 * errors, all rendered by the exception filter into the shared error envelope.
 */
@Controller()
export class CommentsController {
  constructor(private readonly commentService: CommentService) {}

  @Get('posts/:postId/comments')
  async listComments(
    @Param('postId') postId: string,
    @Query(new ZodValidationPipe(listCommentsQuerySchema)) query: ListCommentsQuery,
  ): Promise<ListCommentsResponse> {
    const { comments, nextCursor } = await this.commentService.getComments(postId, {
      limit: query.limit,
      cursor: query.cursor,
    });
    return toListCommentsResponse(comments, nextCursor);
  }

  @Post('comments/:commentId/replies')
  @HttpCode(HttpStatus.CREATED)
  async createReply(
    @Param('commentId') commentId: string,
    @Body(new ZodValidationPipe(createReplyBodySchema)) body: CreateReplyBody,
  ): Promise<CreateReplyResponse> {
    const reply = await this.commentService.replyToComment(commentId, body.content);
    return toCreateReplyResponse(reply);
  }
}
