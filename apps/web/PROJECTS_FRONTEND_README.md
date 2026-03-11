# Projects Frontend (Day 3) - How to Test

## Routes

- `/org/:orgId/projects` - List projects
- `/org/:orgId/projects/new` - Create project
- `/org/:orgId/projects/:projectId` - Project board/list view

All pages:
- Require login (redirect to `/login` if not authenticated)
- Use Montserrat font
- Use existing `AuthContext` and `apiFetch`

## Prerequisites

1. **Backend** running with projects API:
   ```bash
   cd apps/api
   npm run start:dev
   ```
2. **Frontend** running:
   ```bash
   cd apps/web
   pnpm dev
   ```
3. Have a user + organization (login flow already working).

## Test Flow

### 1. Open Projects List

1. Login at `http://localhost:3000/login`.
2. Manually visit:
   ```
   http://localhost:3000/org/<YOUR_ORG_ID>/projects
   ```
3. **Expected:**
   - Page title “Projects”
   - If no projects exist → “No projects yet.”
   - “Create project” button.

### 2. Create a Project

1. From `/org/<orgId>/projects`, click **“Create project”**.
2. You should be on `/org/<orgId>/projects/new`.
3. Fill in:
   - Project name (required)
   - Optional description
4. Click **“Create project”**.
5. **Expected:**
   - Redirects to `/org/<orgId>/projects/<projectId>`.
   - Header shows project name (and description if provided).

### 3. View Project Board + List

1. On `/org/<orgId>/projects/<projectId>`:
   - Default tab is **Board**.
   - Four columns:
     - Backlog
     - In Progress
     - Review
     - Done
   - Each column shows “No tasks yet”.
2. Click **“List”** tab:
   - See table of sections with:
     - Section name
     - Order
     - “No tasks yet” in Tasks column.
3. Use **“← Back to projects”** to return to the list page.

### 4. Revisit Projects List

1. Back on `/org/<orgId>/projects`:
   - The new project should appear in the list.
   - Clicking a row navigates back to `/org/<orgId>/projects/<projectId>`.

## Notes

- All data is org-scoped on the backend; the frontend uses `/org/:orgId/*` only for routing and UX.
- If you open any of these pages without being logged in, you’ll be redirected to `/login`.

