import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { OrgRole, Project } from '@prisma/client';
import { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';

interface RequestUserLike {
  userId: string;
  email: string;
  orgId?: string;
  role?: OrgRole | string;
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  private getOrgIdOrThrow(user: RequestUserLike): string {
    if (!user.orgId) {
      throw new NotFoundException('Organization context is missing');
    }
    return user.orgId;
  }

  async listProjects(user: RequestUserLike) {
    const orgId = this.getOrgIdOrThrow(user);

    return this.prisma.project.findMany({
      where: { orgId, archivedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        sections: {
          orderBy: { order: 'asc' },
        },
      },
    });
  }

  async getProjectById(id: string, user: RequestUserLike) {
    const orgId = this.getOrgIdOrThrow(user);

    const project = await this.prisma.project.findFirst({
      where: {
        id,
        orgId,
        archivedAt: null,
      },
      include: {
        sections: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  async getProjectSections(id: string, user: RequestUserLike) {
    const orgId = this.getOrgIdOrThrow(user);

    // Ensure project belongs to this org
    const projectExists = await this.prisma.project.findFirst({
      where: {
        id,
        orgId,
        archivedAt: null,
      },
      select: { id: true },
    });

    if (!projectExists) {
      throw new NotFoundException('Project not found');
    }

    return this.prisma.projectSection.findMany({
      where: {
        projectId: id,
        orgId,
      },
      orderBy: { order: 'asc' },
    });
  }

  async createProject(dto: CreateProjectDto, user: RequestUserLike) {
    const orgId = this.getOrgIdOrThrow(user);
    const name = dto.name.trim();
    const description = dto.description?.trim() || undefined;
    const category = dto.category?.trim() || undefined;
    const status = dto.status?.trim() || undefined;

    const sections = dto.sections
      .map((section) => section.name.trim())
      .filter((name) => name.length > 0);

    const uniqueNames = new Set(sections.map((value) => value.toLowerCase()));
    if (sections.length === 0 || uniqueNames.size !== sections.length) {
      throw new BadRequestException('Sections must contain at least one unique name');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          orgId,
          name,
          description,
          category,
          status,
        },
      });

      await tx.projectSection.createMany({
        data: sections.map((sectionName, index) => ({
          orgId,
          projectId: project.id,
          name: sectionName,
          order: index,
        })),
      });

      const projectWithSections = await tx.project.findUnique({
        where: { id: project.id },
        include: {
          sections: {
            orderBy: { order: 'asc' },
          },
        },
      });

      return projectWithSections as Project & {
        sections: { id: string; name: string; order: number }[];
      };
    });

    return result;
  }

  async updateProject(id: string, dto: UpdateProjectDto, user: RequestUserLike) {
    const orgId = this.getOrgIdOrThrow(user);

    const existing = await this.prisma.project.findFirst({
      where: {
        id,
        orgId,
        archivedAt: null,
      },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Project not found');
    }

    const trimmedName = dto.name?.trim();
    const trimmedDescription = dto.description?.trim() || undefined;
    const trimmedCategory = dto.category?.trim() || undefined;
    const trimmedStatus = dto.status?.trim() || undefined;

    const incomingSections = dto.sections
      ?.map((s) => ({
        id: s.id,
        name: s.name.trim(),
      }))
      .filter((s) => s.name.length > 0);

    if (incomingSections && incomingSections.length === 0) {
      throw new BadRequestException('Sections must contain at least one name');
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedProject = await tx.project.update({
        where: { id },
        data: {
          ...(trimmedName !== undefined ? { name: trimmedName } : {}),
          ...(trimmedDescription !== undefined ? { description: trimmedDescription } : {}),
          ...(trimmedCategory !== undefined ? { category: trimmedCategory } : {}),
          ...(trimmedStatus !== undefined ? { status: trimmedStatus } : {}),
        },
      });

      if (incomingSections) {
        const existingSections = await tx.projectSection.findMany({
          where: { projectId: id, orgId },
          select: { id: true },
        });
        const existingIdSet = new Set(existingSections.map((s) => s.id));

        const submittedExistingIds: string[] = [];
        for (const s of incomingSections) {
          if (s.id && existingIdSet.has(s.id)) {
            submittedExistingIds.push(s.id);
          }
        }

        // Upsert (update existing by id, create unknown ids)
        for (let index = 0; index < incomingSections.length; index++) {
          const s = incomingSections[index];
          if (s.id && existingIdSet.has(s.id)) {
            await tx.projectSection.update({
              where: { id: s.id },
              data: { name: s.name, order: index },
            });
          } else {
            await tx.projectSection.create({
              data: {
                orgId,
                projectId: id,
                name: s.name,
                order: index,
              },
            });
          }
        }

        // Delete removed sections, but only if they have no tasks
        const idsToDelete = existingSections
          .map((s) => s.id)
          .filter((sid) => !submittedExistingIds.includes(sid));

        if (idsToDelete.length > 0) {
          const tasksCount = await tx.task.count({
            where: { sectionId: { in: idsToDelete } },
          });

          if (tasksCount > 0) {
            throw new BadRequestException(
              'Cannot delete sections that have tasks. Move tasks to other sections before deleting.',
            );
          }

          await tx.projectSection.deleteMany({
            where: { id: { in: idsToDelete }, projectId: id, orgId },
          });
        }
      }

      const withSections = await tx.project.findUnique({
        where: { id },
        include: {
          sections: { orderBy: { order: 'asc' } },
        },
      });

      return withSections;
    });
  }

  async deleteProject(id: string, user: RequestUserLike) {
    const orgId = this.getOrgIdOrThrow(user);

    const existing = await this.prisma.project.findFirst({
      where: {
        id,
        orgId,
        archivedAt: null,
      },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Project not found');
    }

    return this.prisma.project.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }

  async restoreProject(id: string, user: RequestUserLike) {
    const orgId = this.getOrgIdOrThrow(user);

    const existing = await this.prisma.project.findFirst({
      where: {
        id,
        orgId,
        archivedAt: { not: null },
      },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Project not found');
    }

    return this.prisma.project.update({
      where: { id },
      data: { archivedAt: null },
    });
  }
}

