import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/jwt.strategy';

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
}

