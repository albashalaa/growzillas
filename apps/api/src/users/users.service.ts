import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface SearchUsersParams {
  orgId: string;
  query: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async searchUsers(params: SearchUsersParams) {
    const { orgId, query } = params;
    const trimmed = (query || '').trim();

    if (!orgId) {
      return [];
    }

    // Find members of the org and eagerly load user
    const members = await this.prisma.orgMember.findMany({
      where: {
        orgId,
        user: trimmed
          ? {
              OR: [
                {
                  displayName: {
                    contains: trimmed,
                    mode: 'insensitive',
                  },
                },
                {
                  firstName: {
                    contains: trimmed,
                    mode: 'insensitive',
                  },
                },
                {
                  lastName: {
                    contains: trimmed,
                    mode: 'insensitive',
                  },
                },
                {
                  email: {
                    contains: trimmed,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : undefined,
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
          },
        },
      },
      take: 20,
    });

    const users = members
      .map((m) => m.user)
      .filter(Boolean)
      .map((u) => {
        const fallback =
          (u.email ? u.email.split('@')[0] : '') ?? '';
        return {
          id: u.id,
          displayName: u.displayName || fallback,
        };
      });

    // Sort by displayName and limit to 8 for dropdown
    users.sort((a, b) =>
      (a.displayName || '').localeCompare(b.displayName || '', undefined, { sensitivity: 'base' }),
    );
    return users.slice(0, 8);
  }
}

