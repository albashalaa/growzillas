import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../auth/jwt.strategy';

export interface DashboardStats {
  completedTasks: number;
  completedTasksChange: number; // percent vs previous 7 days
  activeProjects: number;
  activeProjectsChange: number; // delta vs previous 7 days
  upcomingDeadlines: number;
  teamMembers: number;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(user: RequestUser): Promise<DashboardStats> {
    const orgId = user.orgId;
    if (!orgId) {
      return {
        completedTasks: 0,
        completedTasksChange: 0,
        activeProjects: 0,
        activeProjectsChange: 0,
        upcomingDeadlines: 0,
        teamMembers: 0,
      };
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(
      now.getTime() - 14 * 24 * 60 * 60 * 1000,
    );

    const [
      totalCompletedTasks,
      completedLast7,
      completedPrev7,
      activeProjects,
      activeCreatedLast7,
      activeCreatedPrev7,
      upcomingDeadlines,
      teamMembers,
    ] = await Promise.all([
      // All-time completed tasks (tasks in a section named "Done")
      this.prisma.task.count({
        where: {
          orgId,
          section: {
            name: 'Done',
          },
        },
      }),
      // Tasks that were recently updated in the Done section in the last 7 days
      this.prisma.task.count({
        where: {
          orgId,
          section: {
            name: 'Done',
          },
          updatedAt: {
            gte: sevenDaysAgo,
            lt: now,
          },
        },
      }),
      // Same for previous 7-day window
      this.prisma.task.count({
        where: {
          orgId,
          section: {
            name: 'Done',
          },
          updatedAt: {
            gte: fourteenDaysAgo,
            lt: sevenDaysAgo,
          },
        },
      }),
      // Active (non-archived) projects
      this.prisma.project.count({
        where: {
          orgId,
          archivedAt: null,
        },
      }),
      // Active projects created in last 7 days
      this.prisma.project.count({
        where: {
          orgId,
          archivedAt: null,
          createdAt: {
            gte: sevenDaysAgo,
            lt: now,
          },
        },
      }),
      // Active projects created in previous 7 days
      this.prisma.project.count({
        where: {
          orgId,
          archivedAt: null,
          createdAt: {
            gte: fourteenDaysAgo,
            lt: sevenDaysAgo,
          },
        },
      }),
      // Upcoming deadlines in next 48h for tasks not in Done
      this.prisma.task.count({
        where: {
          orgId,
          dueDate: {
            gte: now,
            lte: new Date(now.getTime() + 48 * 60 * 60 * 1000),
          },
          section: {
            name: {
              not: 'Done',
            },
          },
        },
      }),
      // Team members in the org
      this.prisma.orgMember.count({
        where: {
          orgId,
        },
      }),
    ]);

    const completedTasksChange = this.computePercentChange(
      completedLast7,
      completedPrev7,
    );

    const activeProjectsChange = activeCreatedLast7 - activeCreatedPrev7;

    return {
      completedTasks: totalCompletedTasks,
      completedTasksChange,
      activeProjects,
      activeProjectsChange,
      upcomingDeadlines,
      teamMembers,
    };
  }

  private computePercentChange(current: number, previous: number): number {
    if (previous === 0) {
      if (current === 0) return 0;
      return 100;
    }
    const diff = current - previous;
    const pct = (diff / previous) * 100;
    return Math.round(pct);
  }
}

