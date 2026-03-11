import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/jwt.strategy';
import { TasksService } from './tasks.service';
import { GetTasksDto } from './dto/get-tasks.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { AddAssigneeDto } from './dto/add-assignee.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  /**
   * GET /tasks?projectId=...
   * Return all tasks for current org + projectId.
   */
  @Get()
  async getTasks(@Query() query: GetTasksDto, @CurrentUser() user: RequestUser) {
    return this.tasksService.listTasks(query.projectId, user);
  }

  /**
   * GET /tasks/my
   * Return tasks where the current user is an assignee in the current org.
   */
  @Get('my')
  async getMyTasks(@CurrentUser() user: RequestUser) {
    return this.tasksService.listMyTasks(user);
  }

  /**
   * GET /tasks/:id/subtasks
   * List subtasks for a parent task in the current org.
   */
  @Get(':id/subtasks')
  async getSubtasks(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tasksService.listSubtasks(id, user);
  }

  /**
   * GET /tasks/:id
   * Return a single task by id (org-scoped). Works for tasks and subtasks.
   */
  @Get(':id')
  async getTask(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tasksService.getTaskById(id, user);
  }

  /**
   * POST /tasks
   * Create a new task in the current org.
   */
  @Post()
  async createTask(
    @Body() dto: CreateTaskDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tasksService.createTask(dto, user);
  }

  /**
   * POST /tasks/:id/subtasks
   * Create a subtask under the given parent task.
   */
  @Post(':id/subtasks')
  async createSubtask(
    @Param('id') id: string,
    @Body() dto: CreateSubtaskDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tasksService.createSubtask(id, dto, user);
  }

  /**
   * PATCH /tasks/:id
   * Update basic task fields (title, dueDate, section).
   */
  @Patch(':id')
  async updateTask(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tasksService.updateTask(id, dto, user);
  }

  /**
   * DELETE /tasks/:id
   * Remove a task from the current org.
   */
  @Delete(':id')
  async deleteTask(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.tasksService.deleteTask(id, user);
    return { success: true };
  }

  /**
   * GET /tasks/:id/stories
   * Return all stories (activity + comments) for a task in the current org.
   */
  @Get(':id/stories')
  async getTaskStories(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tasksService.getTaskStories(id, user);
  }

  /**
   * POST /tasks/:id/assignees
   * Add a task assignee (idempotent).
   */
  @Post(':id/assignees')
  async addAssignee(
    @Param('id') id: string,
    @Body() dto: AddAssigneeDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tasksService.addAssignee(id, dto.userId, user);
  }

  /**
   * DELETE /tasks/:id/assignees/:userId
   * Remove a task assignee.
   */
  @Delete(':id/assignees/:userId')
  async removeAssignee(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tasksService.removeAssignee(id, userId, user);
  }

  /**
   * POST /tasks/:id/comments
   * Add a comment to a task.
   */
  @Post(':id/comments')
  async addComment(
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tasksService.addComment(id, dto.body, dto.mentions ?? [], user);
  }

  /**
   * PATCH /tasks/:taskId/comments/:commentId
   * Update a comment body. Only the author can edit.
   */
  @Patch(':taskId/comments/:commentId')
  async updateComment(
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tasksService.updateComment(taskId, commentId, dto.body, user);
  }

  /**
   * DELETE /tasks/:taskId/comments/:commentId
   * Delete a comment. Only the author can delete.
   */
  @Delete(':taskId/comments/:commentId')
  async deleteComment(
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tasksService.deleteComment(taskId, commentId, user);
  }

  /**
   * POST /tasks/:id/attachments
   * Upload a file attachment for a task (or subtask) in the current org.
   */
  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tasksService.uploadAttachment(id, file, user);
  }

  /**
   * GET /tasks/:id/attachments
   * List attachments for a task (or subtask) in the current org.
   */
  @Get(':id/attachments')
  async listAttachments(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tasksService.listAttachments(id, user);
  }

  /**
   * DELETE /tasks/:id/attachments/:attachmentId
   * Remove an attachment for a task (or subtask) in the current org.
   */
  @Delete(':id/attachments/:attachmentId')
  async deleteAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tasksService.deleteAttachment(id, attachmentId, user);
  }

  /**
   * GET /tasks/:id/attachments/:attachmentId/download
   * Force browser to download the attachment with Content-Disposition.
   */
  @Get(':id/attachments/:attachmentId/download')
  async downloadAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const file = await this.tasksService.getAttachmentFile(id, attachmentId, user);
    return res.download(file.path, file.fileName);
  }
}

/**
 * Example curl commands (replace TOKEN, PROJECT_ID, TASK_ID, USER_ID):
 *
 * # List tasks for a project
 * curl -H "Authorization: Bearer TOKEN" \
 *   "http://localhost:3002/tasks?projectId=PROJECT_ID"
 *
 * # Create a task (auto first section)
 * curl -X POST -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
 *   -d '{"projectId":"PROJECT_ID","title":"My task"}' \
 *   http://localhost:3002/tasks
 *
 * # Update task section
 * curl -X PATCH -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
 *   -d '{"sectionId":"SECTION_ID"}' \
 *   http://localhost:3002/tasks/TASK_ID
 *
 * # Add assignee
 * curl -X POST -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
 *   -d '{"userId":"USER_ID"}' \
 *   http://localhost:3002/tasks/TASK_ID/assignees
 *
 * # Remove assignee
 * curl -X DELETE -H "Authorization: Bearer TOKEN" \
 *   http://localhost:3002/tasks/TASK_ID/assignees/USER_ID
 */

