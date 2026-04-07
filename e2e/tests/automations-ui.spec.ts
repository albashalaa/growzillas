import { test, expect } from '@playwright/test';
import {
  createTaskViaApi,
  seedAutomationWorld,
  type AutomationWorld,
} from '../helpers/seed-automation-world';

async function gotoProjectWithToken(
  page: import('@playwright/test').Page,
  world: AutomationWorld,
  view: 'board' | 'list' | 'automations',
) {
  await page.addInitScript((t: string) => {
    localStorage.setItem('access_token', t);
  }, world.token);
  await page.goto(
    `/org/${world.orgId}/projects/${world.projectId}?view=${view}`,
  );
  await expect(page.getByText('Loading project...')).not.toBeVisible({
    timeout: 60_000,
  });
}

/** Form `select` order matches drawer markup: trigger, condition…, action… */
async function fillWhenMovedToReviewCondition(page: import('@playwright/test').Page) {
  await page.getByLabel('Trigger Type').selectOption('TASK_SECTION_CHANGED');
  await page.getByRole('button', { name: 'Add condition' }).click();
  await page.locator('form select').nth(1).selectOption('after.sectionId');
  await page.locator('form select').nth(3).selectOption({ label: 'Review' });
}

test.describe('Automations UI', () => {
  test('Board / List / Automations switcher stays usable', async ({
    page,
    request,
  }) => {
    const world = await seedAutomationWorld(request);
    await gotoProjectWithToken(page, world, 'board');
    await expect(
      page.getByRole('button', { name: 'Board', exact: true }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'List', exact: true }).click();
    await expect(page.getByPlaceholder('Add a task...')).toBeVisible({
      timeout: 15_000,
    });

    await page
      .getByRole('button', { name: 'Automations', exact: true })
      .click();
    await expect(page.getByTestId('automations-create-rule')).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: 'Board', exact: true }).click();
    await expect(
      page.getByTestId(`board-column-${world.backlogSectionId}`),
    ).toBeVisible();
  });

  test('Create, edit, toggle, and delete rule from Automations UI', async ({
    page,
    request,
  }) => {
    const world = await seedAutomationWorld(request);
    await gotoProjectWithToken(page, world, 'automations');
    await expect(page.getByTestId('automations-create-rule')).toBeVisible();

    await page.getByTestId('automations-create-rule').click();
    await expect(page.getByRole('heading', { name: 'Create Rule' })).toBeVisible();

    await page.getByLabel('Name', { exact: true }).fill('E2E CRUD Rule');
    await page.getByLabel('Trigger Type').selectOption('TASK_CREATED');
    await page.locator('form select').nth(1).selectOption('SET_PRIORITY');
    await page.locator('form select').nth(2).selectOption('MEDIUM');

    await page.locator('form').getByRole('button', { name: 'Create Rule' }).click();
    await expect(page.getByText('E2E CRUD Rule')).toBeVisible({ timeout: 20_000 });

    await page
      .getByRole('button', { name: 'Edit' })
      .filter({ hasNotText: 'project' })
      .click();
    await page.getByLabel('Name', { exact: true }).fill('E2E CRUD Rule Renamed');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByText('E2E CRUD Rule Renamed')).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole('button', { name: 'Turn off' }).click();
    await expect(page.getByText('OFF').first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Turn on' }).click();
    await expect(page.getByText('ON').first()).toBeVisible({ timeout: 20_000 });

    await page
      .getByRole('button', { name: 'Delete' })
      .filter({ hasNotText: 'project' })
      .click();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('E2E CRUD Rule Renamed')).not.toBeVisible();
  });

  test('TASK_SECTION_CHANGED → SET_REVIEWER: board move updates reviewer in drawer', async ({
    page,
    request,
  }) => {
    const world = await seedAutomationWorld(request);
    const task = await createTaskViaApi(request, world, 'E2E Reviewer Task');

    await gotoProjectWithToken(page, world, 'automations');
    await page.getByTestId('automations-create-rule').click();
    await page.getByLabel('Name', { exact: true }).fill('Reviewer on Review column');
    await fillWhenMovedToReviewCondition(page);

    await page.locator('form select').nth(4).selectOption('SET_REVIEWER');
    await page.locator('form select').nth(5).selectOption({ label: world.email });

    await page.locator('form').getByRole('button', { name: 'Create Rule' }).click();
    await expect(page.getByText('Reviewer on Review column')).toBeVisible({
      timeout: 20_000,
    });

    await gotoProjectWithToken(page, world, 'board');
    const taskCard = page.getByTestId(`board-task-${task.id}`);
    const moveResp = page.waitForResponse(
      (r) =>
        r.url().includes(`/tasks/${task.id}`) &&
        r.request().method() === 'PATCH' &&
        r.ok(),
    );
    await taskCard
      .locator('span', { hasText: '::' })
      .dragTo(page.getByTestId(`board-column-${world.reviewSectionId}`));
    await moveResp;

    await taskCard.getByText('E2E Reviewer Task', { exact: true }).click();
    const label = page.getByTestId('task-drawer-reviewer-label');
    await expect(label).not.toHaveText('No reviewer', { timeout: 25_000 });
    await expect(label).toContainText('E2E Automation');
  });

  test('SEND_NOTIFICATION rule shows entry on notifications page', async ({
    page,
    request,
  }) => {
    const world = await seedAutomationWorld(request);
    const taskTitle = 'E2E Notify Task';
    const task = await createTaskViaApi(request, world, taskTitle);

    await gotoProjectWithToken(page, world, 'automations');
    await page.getByTestId('automations-create-rule').click();
    await page.getByLabel('Name', { exact: true }).fill('Notify on move to Review');
    await fillWhenMovedToReviewCondition(page);

    await page.locator('form select').nth(4).selectOption('SEND_NOTIFICATION');
    await page.locator('form select').nth(5).selectOption('USER');
    await page.locator('form select').nth(6).selectOption({ label: world.email });
    await page.getByRole('checkbox', { name: /Notify even if triggered/ }).check();

    await page.locator('form').getByRole('button', { name: 'Create Rule' }).click();
    await expect(page.getByText('Notify on move to Review')).toBeVisible({
      timeout: 20_000,
    });

    await gotoProjectWithToken(page, world, 'board');
    await page
      .getByTestId(`board-task-${task.id}`)
      .locator('span', { hasText: '::' })
      .dragTo(page.getByTestId(`board-column-${world.reviewSectionId}`));

    await page.waitForTimeout(2500);
    await page.goto(`/org/${world.orgId}/notifications`);
    await expect(page.getByText('Loading…')).not.toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole('button', { name: new RegExp(`${taskTitle} was moved to`, 'i') }),
    ).toBeVisible({ timeout: 30_000 });
  });
});
