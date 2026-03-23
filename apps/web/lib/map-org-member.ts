export interface RawOrgMemberLike {
  id?: string;
  userId?: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface NormalizedMember {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export function mapOrgMember(member: RawOrgMemberLike): NormalizedMember {
  const id = member.userId ?? member.id ?? '';

  return {
    id,
    email: member.email ?? null,
    displayName: member.displayName ?? null,
    avatarUrl: member.avatarUrl ?? null,
    firstName: member.firstName ?? null,
    lastName: member.lastName ?? null,
  };
}

