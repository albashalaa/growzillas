import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface SearchParams {
  orgId: string;
  query: string;
}

interface TaskResult {
  id: string;
  title: string;
  projectId: string;
  sectionId: string;
  parentId: string | null;
  priority: string;
  dueDate: string | null;
  projectName: string;
  sectionName: string;
  assignees: { id: string; email: string }[];
}

interface ProjectResult {
  id: string;
  name: string;
  description: string | null;
}

interface MemberResult {
  id: string;
  displayName: string;
  email: string;
  role: string;
}

export interface SearchResponse {
  tasks: TaskResult[];
  projects: ProjectResult[];
  members: MemberResult[];
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(params: SearchParams): Promise<SearchResponse> {
    const { orgId, query } = params;
    const trimmed = (query || '').trim();

    if (!orgId || !trimmed) {
      return { tasks: [], projects: [], members: [] };
    }

    const [tasks, projects, members] = await Promise.all([
      this.searchTasks(orgId, trimmed),
      this.searchProjects(orgId, trimmed),
      this.searchMembers(orgId, trimmed),
    ]);

    return { tasks, projects, members };
  }

  private async searchTasks(
    orgId: string,
    query: string,
  ): Promise<TaskResult[]> {
    const rows = await this.prisma.task.findMany({
      where: {
        orgId,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: {
        project: { select: { name: true } },
        section: { select: { name: true } },
        memberships: {
          where: { role: 'ASSIGNEE' },
          include: { user: { select: { id: true, email: true } } },
        },
      },
      take: 15,
      orderBy: { updatedAt: 'desc' },
    });

    // Sort: exact title matches first, then partial title, then description-only
    const lowerQ = query.toLowerCase();
    rows.sort((a, b) => {
      const aExact = a.title.toLowerCase() === lowerQ ? 0 : 1;
      const bExact = b.title.toLowerCase() === lowerQ ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;

      const aTitle = a.title.toLowerCase().includes(lowerQ) ? 0 : 1;
      const bTitle = b.title.toLowerCase().includes(lowerQ) ? 0 : 1;
      return aTitle - bTitle;
    });

    return rows.map((t) => ({
      id: t.id,
      title: t.title,
      projectId: t.projectId,
      sectionId: t.sectionId,
      parentId: t.parentId,
      priority: t.priority,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      projectName: t.project.name,
      sectionName: t.section.name,
      assignees: t.memberships.map((m) => ({
        id: m.user.id,
        email: m.user.email,
      })),
    }));
  }

  private async searchProjects(
    orgId: string,
    query: string,
  ): Promise<ProjectResult[]> {
    const rows = await this.prisma.project.findMany({
      where: {
        orgId,
        archivedAt: null,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, description: true },
      take: 8,
      orderBy: { updatedAt: 'desc' },
    });

    const lowerQ = query.toLowerCase();
    rows.sort((a, b) => {
      const aName = a.name.toLowerCase().includes(lowerQ) ? 0 : 1;
      const bName = b.name.toLowerCase().includes(lowerQ) ? 0 : 1;
      return aName - bName;
    });

    return rows;
  }

  private async searchMembers(
    orgId: string,
    query: string,
  ): Promise<MemberResult[]> {
    const rows = await this.prisma.orgMember.findMany({
      where: {
        orgId,
        user: {
          OR: [
            { displayName: { contains: query, mode: 'insensitive' } },
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
          ],
        },
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      take: 8,
    });

    return rows
      .filter((m) => m.user)
      .map((m) => ({
        id: m.user.id,
        displayName:
          m.user.displayName ||
          [m.user.firstName, m.user.lastName].filter(Boolean).join(' ') ||
          m.user.email.split('@')[0],
        email: m.user.email,
        role: m.role,
      }));
  }
}
