import { getToken } from './auth';

export const API_BASE_URL =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL
    : 'http://localhost:3002';

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.headers) {
    Object.assign(headers, options.headers as Record<string, string>);
  }

  // Attach Authorization header when token exists.
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // If this is an org-scoped frontend route (/org/[orgId]/...),
  // automatically propagate orgId via x-org-id header when not already set.
  if (!headers['x-org-id']) {
    const orgMatch = path.match(/^\/org\/([^/]+)/);
    if (orgMatch && orgMatch[1]) {
      headers['x-org-id'] = orgMatch[1];
    }

    // Fallback for API calls: when the user is currently on an org page in the
    // browser (/org/:orgId/...), derive orgId from the current pathname.
    // This keeps /auth/me and other org-role-sensitive responses consistent.
    if (!headers['x-org-id'] && typeof window !== 'undefined') {
      const pathname = window.location.pathname || '';
      const currentOrgMatch = pathname.match(/^\/org\/([^/]+)/);
      if (currentOrgMatch && currentOrgMatch[1]) {
        headers['x-org-id'] = currentOrgMatch[1];
      }
    }
  }

  const url = `${API_BASE_URL}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (err) {
    const message =
      err instanceof TypeError && err.message === 'Failed to fetch'
        ? `Cannot reach API at ${url}. Is the API server running? (e.g. \`npm run start:dev\` in apps/api)`
        : err instanceof Error
          ? err.message
          : 'Network error';
    throw new Error(message);
  }

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function apiFetchFormData(path: string, formData: FormData, options: RequestInit = {}) {
  const token = getToken();

  const headers: Record<string, string> = {};

  if (options.headers) {
    Object.assign(headers, options.headers as Record<string, string>);
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    method: options.method ?? 'POST',
    body: formData,
    headers,
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

