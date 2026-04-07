import type { APIRequestContext, APIResponse } from '@playwright/test';

async function responseErrorDetail(res: APIResponse): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as {
      message?: unknown;
      error?: string;
      statusCode?: number;
    };
    if (typeof parsed.message === 'string') return parsed.message;
    if (Array.isArray(parsed.message)) return parsed.message.join('; ');
    if (parsed.message != null) return JSON.stringify(parsed.message);
    if (typeof parsed.error === 'string') return parsed.error;
  } catch {
    /* use raw body */
  }
  return text.length > 0 ? text : '(empty response body)';
}

export type AutomationWorld = {
  apiBaseUrl: string;
  token: string;
  userId: string;
  email: string;
  password: string;
  orgId: string;
  projectId: string;
  backlogSectionId: string;
  reviewSectionId: string;
};

export async function seedAutomationWorld(
  request: APIRequestContext,
): Promise<AutomationWorld> {
  const apiBaseUrl =
    process.env.PLAYWRIGHT_API_BASE_URL || 'http://localhost:3002';
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const email = `e2e+${stamp}@example.com`;
  const password = 'Password123!';

  const reg = await request.post(`${apiBaseUrl}/auth/register`, {
    headers: { 'Content-Type': 'application/json' },
    data: { email, password, firstName: 'E2E', lastName: 'Automation' },
  });
  if (!reg.ok()) {
    const detail = await responseErrorDetail(reg);
    throw new Error(
      `register failed: ${reg.status()} ${reg.statusText()} — ${detail}`,
    );
  }
  const regBody = (await reg.json()) as {
    access_token: string;
    user: { id: string };
  };
  const token = regBody.access_token;
  const userId = regBody.user.id;

  const orgRes = await request.post(`${apiBaseUrl}/orgs`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: `E2E Org ${stamp}` },
  });
  if (!orgRes.ok()) {
    const detail = await responseErrorDetail(orgRes);
    throw new Error(
      `create org failed: ${orgRes.status()} ${orgRes.statusText()} — ${detail}`,
    );
  }
  const orgBody = (await orgRes.json()) as { id: string };
  const orgId = orgBody.id;

  const projRes = await request.post(`${apiBaseUrl}/projects`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-org-id': orgId,
    },
    data: {
      name: 'Automation E2E Project',
      sections: [{ name: 'Backlog' }, { name: 'Review' }, { name: 'Done' }],
    },
  });
  if (!projRes.ok()) {
    const detail = await responseErrorDetail(projRes);
    throw new Error(
      `create project failed: ${projRes.status()} ${projRes.statusText()} — ${detail}`,
    );
  }
  const project = (await projRes.json()) as {
    id: string;
    sections: Array<{ id: string; name: string }>;
  };
  const sections = project.sections;
  const backlog = sections.find((s) => s.name === 'Backlog');
  const review = sections.find((s) => s.name === 'Review');
  if (!backlog || !review) {
    throw new Error('expected Backlog and Review sections from API');
  }

  return {
    apiBaseUrl,
    token,
    userId,
    email,
    password,
    orgId,
    projectId: project.id,
    backlogSectionId: backlog.id,
    reviewSectionId: review.id,
  };
}

export async function createTaskViaApi(
  request: APIRequestContext,
  world: AutomationWorld,
  title: string,
): Promise<{ id: string }> {
  const res = await request.post(`${world.apiBaseUrl}/tasks`, {
    headers: {
      Authorization: `Bearer ${world.token}`,
      'x-org-id': world.orgId,
    },
    data: {
      projectId: world.projectId,
      title,
      sectionId: world.backlogSectionId,
      priority: 'LOW',
    },
  });
  if (!res.ok()) {
    const detail = await responseErrorDetail(res);
    throw new Error(
      `create task failed: ${res.status()} ${res.statusText()} — ${detail}`,
    );
  }
  return (await res.json()) as { id: string };
}
