import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/jwt.strategy';

const PROJECT_LOGO_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_PROJECT_LOGO_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async listProjects(@CurrentUser() user: RequestUser) {
    return this.projectsService.listProjects(user);
  }

  @Post()
  async createProject(
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.projectsService.createProject(dto, user);
  }

  @Get(':id')
  async getProject(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.projectsService.getProjectById(id, user);
  }

  @Patch(':id')
  async updateProject(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.projectsService.updateProject(id, dto, user);
  }

  @Delete(':id')
  async deleteProject(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.projectsService.deleteProject(id, user);
    return { success: true };
  }

  @Post(':id/restore')
  async restoreProject(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.projectsService.restoreProject(id, user);
  }

  @Get(':id/sections')
  async getProjectSections(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.projectsService.getProjectSections(id, user);
  }

  @Post(':id/logo')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: PROJECT_LOGO_MAX_FILE_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_PROJECT_LOGO_MIME_TYPES.has(file.mimetype)) {
          cb(
            new BadRequestException(
              'Unsupported logo file type. Allowed: jpeg, png, webp, gif',
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadProjectLogo(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @CurrentUser() user: RequestUser,
  ) {
    return this.projectsService.uploadProjectLogo(id, file, user);
  }

  @Delete(':id/logo')
  async deleteProjectLogo(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.projectsService.deleteProjectLogo(id, user);
  }
}

