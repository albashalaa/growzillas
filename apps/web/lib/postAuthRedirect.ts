import { apiFetch } from './api';

type RouterLike = {
  push: (href: string) => void;
};

type PostAuthOptions = {
  returnTo?: string | null;
};

export async function handlePostAuthRedirect(
  router: RouterLike,
  options?: PostAuthOptions,
) {
  const returnTo = options?.returnTo;

  // If user came from an invite or any explicit returnTo,
  // always go back there first (e.g. /invite?token=...).
  if (returnTo) {
    router.push(returnTo);
    return;
  }

  // Otherwise decide based on org membership count
  const orgs = await apiFetch('/orgs/my');

  if (!Array.isArray(orgs) || orgs.length === 0) {
    router.push('/create-org');
    return;
  }

  if (orgs.length === 1) {
    const org = orgs[0] as any;
    const orgId = org.orgId ?? org.id;
    router.push(`/org/${orgId}/home`);
    return;
  }

  router.push('/org/select');
}

