import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { OrgRole, Project } from '@prisma/client';

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

  async createProject(
    name: string,
    description: string | undefined,
    user: RequestUserLike,
  ) {
    const orgId = this.getOrgIdOrThrow(user);

    const result = await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          orgId,
          name,
          description,
        },
      });

      const defaultSections = [
        { name: 'Backlog', order: 0 },
        { name: 'In Progress', order: 1 },
        { name: 'Review', order: 2 },
        { name: 'Done', order: 3 },
      ];

      await tx.projectSection.createMany({
        data: defaultSections.map((section) => ({
          orgId,
          projectId: project.id,
          name: section.name,
          order: section.order,
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

  async updateProject(
    id: string,
    data: { name?: string; description?: string },
    user: RequestUserLike,
  ) {
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
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined
          ? { description: data.description }
          : {}),
      },
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

