import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TaskMemberRole } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

type AuthContext = {
  token: string;
  userId: string;
  orgId: string;
  projectId: string;
  reviewSectionId: string;
  backlogSectionId: string;
};

describe('Automations V1 acceptance (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('rule CRUD: create, edit, toggle, delete', async () => {
    const ctx = await createContext();

    const created = await createRule(ctx, {
      name: 'CRUD rule',
      triggerType: 'TASK_CREATED',
      conditions: [],
      actions: [{ type: 'SET_PRIORITY', config: { priority: 'HIGH' } }],
    });

    expect(created.id).toBeDefined();
    expect(created.isActive).toBe(true);

    const editedRes = await authed(ctx)
      .patch(`/automations/${created.id}`)
      .send({
        name: 'CRUD rule edited',
        actions: [{ type: 'SET_PRIORITY', config: { priority: 'LOW' } }],
      })
      .expect(200);
    expect(editedRes.body.name).toBe('CRUD rule edited');
    expect(editedRes.body.actions[0].config.priority).toBe('LOW');

    const toggledOffRes = await authed(ctx)
      .post(`/automations/${created.id}/toggle`)
      .send({ isActive: false })
      .expect(201);
    expect(toggledOffRes.body.isActive).toBe(false);

    const execCountBeforeOff = await prisma.automationExecution.count({
      where: { ruleId: created.id },
    });
    expect(execCountBeforeOff).toBe(0);

    const taskWhileOff = await createTask(ctx, 'crud-off-task', {
      priority: 'URGENT',
    });
    const updatedOff = await prisma.task.findUniqueOrThrow({
      where: { id: taskWhileOff.id },
    });
    expect(updatedOff.priority).toBe('URGENT');

    const execCountAfterOff = await prisma.automationExecution.count({
      where: { ruleId: created.id },
    });
    expect(execCountAfterOff).toBe(0);

    const toggledOnRes = await authed(ctx)
      .post(`/automations/${created.id}/toggle`)
      .send({ isActive: true })
      .expect(201);
    expect(toggledOnRes.body.isActive).toBe(true);

    const taskWhileOn = await createTask(ctx, 'crud-on-task', {
      priority: 'URGENT',
    });
    const updatedOn = await prisma.task.findUniqueOrThrow({
      where: { id: taskWhileOn.id },
    });
    // Edited rule sets priority to LOW.
    expect(updatedOn.priority).toBe('LOW');

    const execCountAfterOn = await prisma.automationExecution.count({
      where: { ruleId: created.id },
    });
    expect(execCountAfterOn).toBe(1);

    const latest = await latestExecution(created.id);
    expect(latest?.status).toBe('SUCCESS');

    await authed(ctx).delete(`/automations/${created.id}`).expect(200);

    await authed(ctx).get(`/automations/${created.id}`).expect(404);
  });

  it('CASE A: TASK_CREATED -> SET_PRIORITY(MEDIUM) executes with SUCCESS', async () => {
    const ctx = await createContext();
    const rule = await createRule(ctx, {
      name: 'Case A',
      triggerType: 'TASK_CREATED',
      conditions: [],
      actions: [{ type: 'SET_PRIORITY', config: { priority: 'MEDIUM' } }],
    });

    const taskRes = await authed(ctx).post('/tasks').send({
      projectId: ctx.projectId,
      title: 'case-a-task',
      priority: 'LOW',
      sectionId: ctx.backlogSectionId,
    });
    expect(taskRes.status).toBe(201);
    const taskId = taskRes.body.id as string;

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(updated.priority).toBe('MEDIUM');

    const execution = await latestExecution(rule.id);
    expect(execution?.status).toBe('SUCCESS');
    expect(execution?.eventType).toBe('TASK_CREATED');
  });

  it('CASE B: TASK_SECTION_CHANGED + Review -> ASSIGN_USER executes with SUCCESS', async () => {
    const ctx = await createContext();
    const target = await createMemberInOrg(ctx.orgId);
    const rule = await createRule(ctx, {
      name: 'Case B',
      triggerType: 'TASK_SECTION_CHANGED',
      conditions: [
        { field: 'task.sectionId', operator: 'equals', value: ctx.reviewSectionId },
      ],
      actions: [{ type: 'ASSIGN_USER', config: { userId: target.userId } }],
    });

    const task = await createTask(ctx, 'case-b-task');
    await authed(ctx).patch(`/tasks/${task.id}`).send({ sectionId: ctx.reviewSectionId }).expect(200);

    const assignee = await prisma.taskMembership.findFirst({
      where: { taskId: task.id, role: TaskMemberRole.ASSIGNEE },
    });
    expect(assignee?.userId).toBe(target.userId);

    const execution = await latestExecution(rule.id);
    expect(execution?.status).toBe('SUCCESS');
  });

  it('CASE C: TASK_SECTION_CHANGED + Review -> SET_REVIEWER executes with SUCCESS', async () => {
    const ctx = await createContext();
    const target = await createMemberInOrg(ctx.orgId);
    const rule = await createRule(ctx, {
      name: 'Case C',
      triggerType: 'TASK_SECTION_CHANGED',
      conditions: [
        { field: 'task.sectionId', operator: 'equals', value: ctx.reviewSectionId },
      ],
      actions: [{ type: 'SET_REVIEWER', config: { userId: target.userId } }],
    });

    const task = await createTask(ctx, 'case-c-task');
    await authed(ctx).patch(`/tasks/${task.id}`).send({ sectionId: ctx.reviewSectionId }).expect(200);

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.reviewerId).toBe(target.userId);

    const execution = await latestExecution(rule.id);
    expect(execution?.status).toBe('SUCCESS');
  });

  it('CASE G: TASK_SECTION_CHANGED -> SET_REVIEWER(actor) + NOTIFY(REVIEWER) with notifyActor notifies actor', async () => {
    const ctx = await createContext();
    const rule = await createRule(ctx, {
      name: 'Case G reviewer is actor',
      triggerType: 'TASK_SECTION_CHANGED',
      conditions: [
        { field: 'task.sectionId', operator: 'equals', value: ctx.reviewSectionId },
      ],
      actions: [
        { type: 'SET_REVIEWER', config: { userId: ctx.userId } },
        {
          type: 'SEND_NOTIFICATION',
          config: { target: 'REVIEWER', notifyActor: true },
        },
      ],
    });

    const task = await createTask(ctx, 'case-g-task');
    await authed(ctx).patch(`/tasks/${task.id}`).send({ sectionId: ctx.reviewSectionId }).expect(200);

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.reviewerId).toBe(ctx.userId);

    const notification = await prisma.notification.findFirst({
      where: { orgId: ctx.orgId, taskId: task.id, userId: ctx.userId, type: 'AUTOMATION' },
    });
    expect(notification).toBeTruthy();

    const listRes = await authed(ctx).get('/notifications').expect(200);
    const list = listRes.body as Array<{ type: string; taskId: string; commentBody: string }>;
    expect(list.some((n) => n.type === 'AUTOMATION' && n.taskId === task.id)).toBe(true);
    const found = list.find((n) => n.type === 'AUTOMATION' && n.taskId === task.id);
    expect(found?.commentBody.toLowerCase()).toContain('reviewer');

    const unreadRes = await authed(ctx).get('/notifications/unread-count').expect(200);
    expect((unreadRes.body as any).unreadCount).toBeGreaterThan(0);

    const execution = await latestExecution(rule.id);
    expect(execution?.status).toBe('SUCCESS');
  });

  it('CASE G2: same flow without notifyActor skips notification when reviewer is actor', async () => {
    const ctx = await createContext();
    const rule = await createRule(ctx, {
      name: 'Case G2 reviewer is actor default',
      triggerType: 'TASK_SECTION_CHANGED',
      conditions: [
        { field: 'task.sectionId', operator: 'equals', value: ctx.reviewSectionId },
      ],
      actions: [
        { type: 'SET_REVIEWER', config: { userId: ctx.userId } },
        { type: 'SEND_NOTIFICATION', config: { target: 'REVIEWER' } },
      ],
    });

    const task = await createTask(ctx, 'case-g2-task');
    await authed(ctx).patch(`/tasks/${task.id}`).send({ sectionId: ctx.reviewSectionId }).expect(200);

    const notification = await prisma.notification.findFirst({
      where: { orgId: ctx.orgId, taskId: task.id, userId: ctx.userId, type: 'AUTOMATION' },
    });
    expect(notification).toBeNull();

    const listRes = await authed(ctx).get('/notifications').expect(200);
    const list = listRes.body as Array<{ type: string; taskId: string; commentBody: string }>;
    expect(list.some((n) => n.type === 'AUTOMATION' && n.taskId === task.id)).toBe(false);

    const unreadRes = await authed(ctx).get('/notifications/unread-count').expect(200);
    expect((unreadRes.body as any).unreadCount).toBe(0);

    const execution = await latestExecution(rule.id);
    expect(execution?.status).toBe('SKIPPED');
  });

  it('CASE D: TASK_ASSIGNED -> SEND_NOTIFICATION(ASSIGNEE) executes with SUCCESS', async () => {
    const ctx = await createContext();
    const target = await createMemberInOrg(ctx.orgId);
    const rule = await createRule(ctx, {
      name: 'Case D',
      triggerType: 'TASK_ASSIGNED',
      conditions: [],
      actions: [{ type: 'SEND_NOTIFICATION', config: { target: 'ASSIGNEE' } }],
    });

    const task = await createTask(ctx, 'case-d-task');
    await authed(ctx).patch(`/tasks/${task.id}`).send({ assigneeUserId: target.userId }).expect(200);

    const notification = await prisma.notification.findFirst({
      where: { orgId: ctx.orgId, taskId: task.id, userId: target.userId, type: 'AUTOMATION' },
    });
    expect(notification).toBeTruthy();

    const execution = await latestExecution(rule.id);
    expect(execution?.status).toBe('SUCCESS');
  });

  it('CASE E: edited rule applies new behavior on subsequent events', async () => {
    const ctx = await createContext();
    const rule = await createRule(ctx, {
      name: 'Case E',
      triggerType: 'TASK_CREATED',
      conditions: [],
      actions: [{ type: 'SET_PRIORITY', config: { priority: 'HIGH' } }],
    });

    const first = await createTask(ctx, 'case-e-first');
    const firstAfter = await prisma.task.findUniqueOrThrow({ where: { id: first.id } });
    expect(firstAfter.priority).toBe('HIGH');

    await authed(ctx)
      .patch(`/automations/${rule.id}`)
      .send({
        actions: [{ type: 'SET_PRIORITY', config: { priority: 'LOW' } }],
      })
      .expect(200);

    const second = await createTask(ctx, 'case-e-second');
    const secondAfter = await prisma.task.findUniqueOrThrow({ where: { id: second.id } });
    expect(secondAfter.priority).toBe('LOW');
  });

  it('CASE F: disabled/deleted rule does not execute after trigger', async () => {
    const ctx = await createContext();
    const disabledRule = await createRule(ctx, {
      name: 'Case F disabled',
      triggerType: 'TASK_CREATED',
      conditions: [],
      actions: [{ type: 'SET_PRIORITY', config: { priority: 'HIGH' } }],
    });
    const deletedRule = await createRule(ctx, {
      name: 'Case F deleted',
      triggerType: 'TASK_CREATED',
      conditions: [],
      actions: [{ type: 'SET_PRIORITY', config: { priority: 'URGENT' } }],
    });

    await authed(ctx)
      .post(`/automations/${disabledRule.id}/toggle`)
      .send({ isActive: false })
      .expect(201);
    await authed(ctx).delete(`/automations/${deletedRule.id}`).expect(200);

    await authed(ctx).post('/tasks').send({
      projectId: ctx.projectId,
      title: 'case-f-task',
      priority: 'LOW',
      sectionId: ctx.backlogSectionId,
    });

    const disabledExecCount = await prisma.automationExecution.count({
      where: { ruleId: disabledRule.id },
    });
    const deletedExecCount = await prisma.automationExecution.count({
      where: { ruleId: deletedRule.id },
    });

    expect(disabledExecCount).toBe(0);
    expect(deletedExecCount).toBe(0);
  });

  it('SKIPPED: no-op notification action logs SKIPPED', async () => {
    const ctx = await createContext();
    const rule = await createRule(ctx, {
      name: 'Skip notification no recipient',
      triggerType: 'TASK_ASSIGNED',
      conditions: [],
      actions: [{ type: 'SEND_NOTIFICATION', config: { target: 'ASSIGNEE' } }],
    });

    const user = await createMemberInOrg(ctx.orgId);
    const task = await createTask(ctx, 'skip-task');
    await authed(ctx).patch(`/tasks/${task.id}`).send({ assigneeUserId: user.userId }).expect(200);
    await authed(ctx).patch(`/tasks/${task.id}`).send({ assigneeUserId: '' }).expect(200);

    const execution = await latestExecution(rule.id);
    expect(execution?.status).toBe('SKIPPED');
  });

  it('FAILED: unexpected executor error logs FAILED and task update still succeeds', async () => {
    const ctx = await createContext();
    const target = await createMemberInOrg(ctx.orgId);
    const task = await createTask(ctx, 'failed-task');

    await prisma.taskMembership.create({
      data: {
        orgId: ctx.orgId,
        taskId: task.id,
        userId: target.userId,
        role: TaskMemberRole.WATCHER,
      },
    });

    const rule = await prisma.automationRule.create({
      data: {
        orgId: ctx.orgId,
        projectId: ctx.projectId,
        createdByUserId: ctx.userId,
        name: 'Force unexpected executor error',
        triggerType: 'TASK_SECTION_CHANGED',
        conditions: [],
        actions: [{ type: 'ASSIGN_USER', config: { userId: target.userId } }],
        isActive: true,
      },
    });

    const patchRes = await authed(ctx)
      .patch(`/tasks/${task.id}`)
      .send({ sectionId: ctx.reviewSectionId });
    expect(patchRes.status).toBe(200);

    const execution = await latestExecution(rule.id);
    expect(execution?.status).toBe('FAILED');

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.sectionId).toBe(ctx.reviewSectionId);
  });

  it('CASE H: TASK_CREATED -> MOVE_TO_SECTION executes with SUCCESS', async () => {
    const ctx = await createContext();
    const rule = await createRule(ctx, {
      name: 'Case H',
      triggerType: 'TASK_CREATED',
      conditions: [],
      actions: [{ type: 'MOVE_TO_SECTION', config: { sectionId: ctx.reviewSectionId } }],
    });

    const task = await createTask(ctx, 'case-h-task');

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.sectionId).toBe(ctx.reviewSectionId);

    const execution = await latestExecution(rule.id);
    expect(execution?.status).toBe('SUCCESS');
    expect(execution?.eventType).toBe('TASK_CREATED');
  });

  it('SKIPPED: MOVE_TO_SECTION already in target section logs SKIPPED', async () => {
    const ctx = await createContext();
    const rule = await createRule(ctx, {
      name: 'Skip move no-op',
      triggerType: 'TASK_CREATED',
      conditions: [],
      actions: [{ type: 'MOVE_TO_SECTION', config: { sectionId: ctx.reviewSectionId } }],
    });

    const task = await createTask(ctx, 'case-h-skip-task', {
      sectionId: ctx.reviewSectionId,
    });

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.sectionId).toBe(ctx.reviewSectionId);

    const execution = await latestExecution(rule.id);
    expect(execution?.status).toBe('SKIPPED');
  });

  it('CASE I: TASK_SECTION_CHANGED condition task.priority equals LOW executes with SUCCESS', async () => {
    const ctx = await createContext();
    const target = await createMemberInOrg(ctx.orgId);

    const rule = await createRule(ctx, {
      name: 'Case I priority condition',
      triggerType: 'TASK_SECTION_CHANGED',
      conditions: [{ field: 'task.priority', operator: 'equals', value: 'LOW' }],
      actions: [{ type: 'SET_REVIEWER', config: { userId: target.userId } }],
    });

    const task = await createTask(ctx, 'case-i-task');
    await authed(ctx)
      .patch(`/tasks/${task.id}`)
      .send({ sectionId: ctx.reviewSectionId })
      .expect(200);

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.reviewerId).toBe(target.userId);

    const execution = await latestExecution(rule.id);
    expect(execution?.status).toBe('SUCCESS');
  });

  it('CASE J: TASK_SECTION_CHANGED condition task.assigneeId equals user executes with SUCCESS', async () => {
    const ctx = await createContext();
    const assignee = await createMemberInOrg(ctx.orgId);

    const task = await createTask(ctx, 'case-j-task');
    await authed(ctx).patch(`/tasks/${task.id}`).send({ assigneeUserId: assignee.userId }).expect(200);

    const rule = await createRule(ctx, {
      name: 'Case J assignee condition',
      triggerType: 'TASK_SECTION_CHANGED',
      conditions: [{ field: 'task.assigneeId', operator: 'equals', value: assignee.userId }],
      actions: [{ type: 'SET_PRIORITY', config: { priority: 'HIGH' } }],
    });

    await authed(ctx)
      .patch(`/tasks/${task.id}`)
      .send({ sectionId: ctx.reviewSectionId })
      .expect(200);

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.priority).toBe('HIGH');

    const execution = await latestExecution(rule.id);
    expect(execution?.status).toBe('SUCCESS');
  });

  it('CASE T: TASK_SECTION_CHANGED condition after.sectionId executes with SUCCESS', async () => {
    const ctx = await createContext();
    const rule = await createRule(ctx, {
      name: 'Case T after.sectionId',
      triggerType: 'TASK_SECTION_CHANGED',
      conditions: [
        { field: 'after.sectionId', operator: 'equals', value: ctx.reviewSectionId },
      ],
      actions: [{ type: 'SET_PRIORITY', config: { priority: 'URGENT' } }],
    });

    const task = await createTask(ctx, 'case-t-task');
    await authed(ctx).patch(`/tasks/${task.id}`).send({ sectionId: ctx.reviewSectionId }).expect(200);

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.priority).toBe('URGENT');

    const execution = await latestExecution(rule.id);
    expect(execution?.status).toBe('SUCCESS');
  });

  it('CASE U: TASK_SECTION_CHANGED condition before.sectionId executes with SUCCESS', async () => {
    const ctx = await createContext();
    const rule = await createRule(ctx, {
      name: 'Case U before.sectionId',
      triggerType: 'TASK_SECTION_CHANGED',
      conditions: [
        { field: 'before.sectionId', operator: 'equals', value: ctx.backlogSectionId },
      ],
      actions: [{ type: 'SET_PRIORITY', config: { priority: 'HIGH' } }],
    });

    const task = await createTask(ctx, 'case-u-task');
    await authed(ctx).patch(`/tasks/${task.id}`).send({ sectionId: ctx.reviewSectionId }).expect(200);

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.priority).toBe('HIGH');

    const execution = await latestExecution(rule.id);
    expect(execution?.status).toBe('SUCCESS');
  });

  it('CASE U2: TASK_SECTION_CHANGED condition after.sectionId not_equals skips when landing in excluded section', async () => {
    const ctx = await createContext();
    const rule = await createRule(ctx, {
      name: 'Case U2 not_equals after.sectionId',
      triggerType: 'TASK_SECTION_CHANGED',
      conditions: [
        { field: 'after.sectionId', operator: 'not_equals', value: ctx.backlogSectionId },
      ],
      actions: [{ type: 'SET_PRIORITY', config: { priority: 'HIGH' } }],
    });

    const task = await createTask(ctx, 'case-u2-task');
    await authed(ctx).patch(`/tasks/${task.id}`).send({ sectionId: ctx.reviewSectionId }).expect(200);

    const updatedToReview = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updatedToReview.priority).toBe('HIGH');

    const executionSuccess = await latestExecution(rule.id);
    expect(executionSuccess?.status).toBe('SUCCESS');

    await authed(ctx)
      .patch(`/tasks/${task.id}`)
      .send({ sectionId: ctx.backlogSectionId })
      .expect(200);

    const updatedToBacklog = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updatedToBacklog.priority).toBe('HIGH');

    const executions = await prisma.automationExecution.findMany({
      where: { ruleId: rule.id },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    expect(executions[0]?.status).toBe('SKIPPED');
  });

  it('CASE K: task.projectId condition works across projects (org-wide rule)', async () => {
    const ctx = await createContext();
    const projectB = await createProjectWithSections(ctx, `B-${Date.now()}`);

    const rule = await createRule(
      ctx,
      {
        name: 'Case K projectId condition',
        triggerType: 'TASK_CREATED',
        conditions: [{ field: 'task.projectId', operator: 'equals', value: projectB.projectId }],
        actions: [{ type: 'SET_PRIORITY', config: { priority: 'HIGH' } }],
      },
      null, // org-wide
    );

    const taskA = await createTask(ctx, 'case-k-task-a');
    const updatedA = await prisma.task.findUniqueOrThrow({ where: { id: taskA.id } });
    expect(updatedA.priority).toBe('LOW');

    const executionAfterA = await latestExecution(rule.id);
    expect(executionAfterA?.status).toBe('SKIPPED');

    const taskB = await createTask(ctx, 'case-k-task-b', {
      projectId: projectB.projectId,
      sectionId: projectB.backlogSectionId,
      priority: 'LOW',
    });

    const updatedB = await prisma.task.findUniqueOrThrow({ where: { id: taskB.id } });
    expect(updatedB.priority).toBe('HIGH');

    const executionAfterB = await latestExecution(rule.id);
    expect(executionAfterB?.status).toBe('SUCCESS');
    expect(executionAfterB?.eventType).toBe('TASK_CREATED');
  });

  it('CASE L: project-scoped rule does not execute in other project', async () => {
    const ctx = await createContext();
    const projectB = await createProjectWithSections(ctx, `B2-${Date.now()}`);

    const rule = await createRule(ctx, {
      name: 'Case L project scoping',
      triggerType: 'TASK_CREATED',
      conditions: [],
      actions: [{ type: 'SET_PRIORITY', config: { priority: 'URGENT' } }],
    });

    const taskB = await createTask(ctx, 'case-l-task-b', {
      projectId: projectB.projectId,
      sectionId: projectB.backlogSectionId,
      priority: 'LOW',
    });

    const updatedB = await prisma.task.findUniqueOrThrow({ where: { id: taskB.id } });
    expect(updatedB.priority).toBe('LOW');

    const execCount = await prisma.automationExecution.count({ where: { ruleId: rule.id } });
    expect(execCount).toBe(0);
  });

  it('CASE M: TASK_ASSIGNED -> ASSIGN_USER executes with SUCCESS', async () => {
    const ctx = await createContext();
    const userA = await createMemberInOrg(ctx.orgId);
    const userB = await createMemberInOrg(ctx.orgId);

    const rule = await createRule(ctx, {
      name: 'Case M assign after TASK_ASSIGNED',
      triggerType: 'TASK_ASSIGNED',
      conditions: [],
      actions: [{ type: 'ASSIGN_USER', config: { userId: userB.userId } }],
    });

    const task = await createTask(ctx, 'case-m-task');
    await authed(ctx)
      .patch(`/tasks/${task.id}`)
      .send({ assigneeUserId: userA.userId })
      .expect(200);

    const assignee = await prisma.taskMembership.findFirst({
      where: { taskId: task.id, role: TaskMemberRole.ASSIGNEE },
    });
    expect(assignee?.userId).toBe(userB.userId);

    const execution = await latestExecution(rule.id);
    expect(execution?.status).toBe('SUCCESS');
  });

  it('CASE N: TASK_SECTION_CHANGED -> ASSIGN_USER + SET_PRIORITY executes with SUCCESS', async () => {
    const ctx = await createContext();
    const assignee = await createMemberInOrg(ctx.orgId);

    const rule = await createRule(ctx, {
      name: 'Case N assign + priority',
      triggerType: 'TASK_SECTION_CHANGED',
      conditions: [{ field: 'task.sectionId', operator: 'equals', value: ctx.reviewSectionId }],
      actions: [
        { type: 'ASSIGN_USER', config: { userId: assignee.userId } },
        { type: 'SET_PRIORITY', config: { priority: 'URGENT' } },
      ],
    });

    const task = await createTask(ctx, 'case-n-task');
    await authed(ctx)
      .patch(`/tasks/${task.id}`)
      .send({ sectionId: ctx.reviewSectionId })
      .expect(200);

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.priority).toBe('URGENT');

    const membership = await prisma.taskMembership.findFirst({
      where: { taskId: task.id, role: TaskMemberRole.ASSIGNEE },
    });
    expect(membership?.userId).toBe(assignee.userId);

    const execution = await latestExecution(rule.id);
    expect(execution?.status).toBe('SUCCESS');
  });

  it('CASE O: TASK_CREATED -> MOVE_TO_SECTION + SET_PRIORITY executes with SUCCESS', async () => {
    const ctx = await createContext();

    const rule = await createRule(ctx, {
      name: 'Case O move + set priority',
      triggerType: 'TASK_CREATED',
      conditions: [],
      actions: [
        { type: 'MOVE_TO_SECTION', config: { sectionId: ctx.reviewSectionId } },
        { type: 'SET_PRIORITY', config: { priority: 'HIGH' } },
      ],
    });

    const task = await createTask(ctx, 'case-o-task');

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.sectionId).toBe(ctx.reviewSectionId);
    expect(updated.priority).toBe('HIGH');

    const execution = await latestExecution(rule.id);
    expect(execution?.status).toBe('SUCCESS');
  });

  it('CASE P: SET_REVIEWER does not change assignee membership', async () => {
    const ctx = await createContext();
    const assignee = await createMemberInOrg(ctx.orgId);
    const reviewer = await createMemberInOrg(ctx.orgId);

    const task = await createTask(ctx, 'case-p-task');
    await authed(ctx)
      .patch(`/tasks/${task.id}`)
      .send({ assigneeUserId: assignee.userId })
      .expect(200);

    const rule = await createRule(ctx, {
      name: 'Case P set reviewer only',
      triggerType: 'TASK_SECTION_CHANGED',
      conditions: [{ field: 'task.sectionId', operator: 'equals', value: ctx.reviewSectionId }],
      actions: [{ type: 'SET_REVIEWER', config: { userId: reviewer.userId } }],
    });

    await authed(ctx)
      .patch(`/tasks/${task.id}`)
      .send({ sectionId: ctx.reviewSectionId })
      .expect(200);

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.reviewerId).toBe(reviewer.userId);

    const getTaskRes = await authed(ctx).get(`/tasks/${task.id}`).expect(200);
    expect((getTaskRes.body as any).reviewerId).toBe(reviewer.userId);

    const membership = await prisma.taskMembership.findFirst({
      where: { taskId: task.id, role: TaskMemberRole.ASSIGNEE },
    });
    expect(membership?.userId).toBe(assignee.userId);

    const execution = await latestExecution(rule.id);
    expect(execution?.status).toBe('SUCCESS');
  });

  it('CASE Q: SEND_NOTIFICATION(USER) creates Notification rows and appears in UI', async () => {
    const ctx = await createContext();
    const target = await createMemberInOrg(ctx.orgId);

    const rule = await createRule(ctx, {
      name: 'Case Q notify specific user',
      triggerType: 'TASK_CREATED',
      conditions: [],
      actions: [{ type: 'SEND_NOTIFICATION', config: { target: 'USER', userId: target.userId } }],
    });

    const task = await createTask(ctx, 'case-q-task');

    const notification = await prisma.notification.findFirst({
      where: { orgId: ctx.orgId, taskId: task.id, userId: target.userId, type: 'AUTOMATION' },
    });
    expect(notification).toBeTruthy();

    const listRes = await authed({ token: target.token, orgId: ctx.orgId }).get('/notifications').expect(200);
    const list = listRes.body as Array<{ type: string; taskId: string; commentBody: string }>;
    expect(list.some((n) => n.type === 'AUTOMATION' && n.taskId === task.id)).toBe(true);

    const found = list.find((n) => n.type === 'AUTOMATION' && n.taskId === task.id);
    expect(found?.commentBody.toLowerCase()).toContain('priority');

    const unreadRes = await authed({ token: target.token, orgId: ctx.orgId }).get('/notifications/unread-count').expect(200);
    expect((unreadRes.body as any).unreadCount).toBeGreaterThan(0);

    const execution = await latestExecution(rule.id);
    expect(execution?.status).toBe('SUCCESS');
  });

  it('CASE R: SEND_NOTIFICATION(ASSIGNEE) creates notifications and updates unread count', async () => {
    const ctx = await createContext();
    const assignee = await createMemberInOrg(ctx.orgId);

    const rule = await createRule(ctx, {
      name: 'Case R notify assignee',
      triggerType: 'TASK_ASSIGNED',
      conditions: [],
      actions: [{ type: 'SEND_NOTIFICATION', config: { target: 'ASSIGNEE' } }],
    });

    const task = await createTask(ctx, 'case-r-task');

    const unreadBefore = await authed({ token: assignee.token, orgId: ctx.orgId })
      .get('/notifications/unread-count')
      .expect(200);

    await authed(ctx)
      .patch(`/tasks/${task.id}`)
      .send({ assigneeUserId: assignee.userId })
      .expect(200);

    const notification = await prisma.notification.findFirst({
      where: { orgId: ctx.orgId, taskId: task.id, userId: assignee.userId, type: 'AUTOMATION' },
    });
    expect(notification).toBeTruthy();

    const unreadAfter = await authed({ token: assignee.token, orgId: ctx.orgId })
      .get('/notifications/unread-count')
      .expect(200);
    expect((unreadAfter.body as any).unreadCount).toBeGreaterThan((unreadBefore.body as any).unreadCount);

    const execution = await latestExecution(rule.id);
    expect(execution?.status).toBe('SUCCESS');
  });

  it('CASE S: COMMENT_CREATED -> SET_PRIORITY executes with SUCCESS', async () => {
    const ctx = await createContext();

    const rule = await createRule(ctx, {
      name: 'Case S comment triggers priority update',
      triggerType: 'COMMENT_CREATED',
      conditions: [{ field: 'task.sectionId', operator: 'equals', value: ctx.backlogSectionId }],
      actions: [{ type: 'SET_PRIORITY', config: { priority: 'HIGH' } }],
    });

    const task = await createTask(ctx, 'case-s-task');
    await authed(ctx)
      .post(`/tasks/${task.id}/comments`)
      .send({ body: 'Automation test comment' })
      .expect(201);

    const updated = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.priority).toBe('HIGH');

    const execution = await latestExecution(rule.id);
    expect(execution?.status).toBe('SUCCESS');
    expect(execution?.eventType).toBe('COMMENT_CREATED');
  });

  it('FAILED (comment): COMMENT_CREATED automation failure logs FAILED but comment succeeds', async () => {
    const ctx = await createContext();
    const target = await createMemberInOrg(ctx.orgId);

    const task = await createTask(ctx, 'case-t-task');

    // Watcher membership forces an unexpected executor error when ASSIGN_USER tries to create
    // ASSIGNEE membership for the same user (unique taskId+userId constraint).
    await prisma.taskMembership.create({
      data: {
        orgId: ctx.orgId,
        taskId: task.id,
        userId: target.userId,
        role: TaskMemberRole.WATCHER,
      },
    });

    const rule = await createRule(ctx, {
      name: 'Case T comment failure',
      triggerType: 'COMMENT_CREATED',
      conditions: [],
      actions: [{ type: 'ASSIGN_USER', config: { userId: target.userId } }],
    });

    const patchRes = await authed(ctx)
      .post(`/tasks/${task.id}/comments`)
      .send({ body: 'Trigger executor failure' })
      .expect(201);
    expect(patchRes.status).toBe(201);

    const execution = await latestExecution(rule.id);
    expect(execution?.status).toBe('FAILED');
  });

  function authed(ctx: Pick<AuthContext, 'token' | 'orgId'>) {
    const withHeaders = (req: any) =>
      req.set('Authorization', `Bearer ${ctx.token}`).set('x-org-id', ctx.orgId);
    return {
      get: (path: string) => withHeaders(request(app.getHttpServer()).get(path)),
      post: (path: string) => withHeaders(request(app.getHttpServer()).post(path)),
      patch: (path: string) => withHeaders(request(app.getHttpServer()).patch(path)),
      delete: (path: string) => withHeaders(request(app.getHttpServer()).delete(path)),
    };
  }

  async function createContext(): Promise<AuthContext> {
    const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `auto.v1.${seed}@example.com`;
    const password = 'Password123!';

    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, firstName: 'Auto', lastName: 'V1' })
      .expect(201);
    const token = registerRes.body.access_token as string;
    const userId = registerRes.body.user.id as string;

    const orgRes = await request(app.getHttpServer())
      .post('/orgs')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `AUTOMATION_TEST_${seed}` })
      .expect(201);
    const orgId = orgRes.body.id as string;

    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${token}`)
      .set('x-org-id', orgId)
      .send({
        name: `Project ${seed}`,
        sections: [{ name: 'Backlog' }, { name: 'Review' }, { name: 'Done' }],
      })
      .expect(201);

    const projectId = projectRes.body.id as string;
    const sections = projectRes.body.sections as Array<{ id: string; name: string }>;
    const reviewSectionId = sections.find((s) => s.name === 'Review')?.id as string;
    const backlogSectionId = sections.find((s) => s.name === 'Backlog')?.id as string;

    return {
      token,
      userId,
      orgId,
      projectId,
      reviewSectionId,
      backlogSectionId,
    };
  }

  async function createProjectWithSections(
    ctx: AuthContext,
    seedSuffix: string,
  ): Promise<{
    projectId: string;
    reviewSectionId: string;
    backlogSectionId: string;
  }> {
    const projectRes = await request(app.getHttpServer())
      .post('/projects')
      .set('Authorization', `Bearer ${ctx.token}`)
      .set('x-org-id', ctx.orgId)
      .send({
        name: `Project ${seedSuffix}`,
        sections: [{ name: 'Backlog' }, { name: 'Review' }, { name: 'Done' }],
      })
      .expect(201);

    const projectId = projectRes.body.id as string;
    const sections = projectRes.body.sections as Array<{ id: string; name: string }>;
    const reviewSectionId = sections.find((s) => s.name === 'Review')?.id as string;
    const backlogSectionId = sections.find((s) => s.name === 'Backlog')?.id as string;

    return { projectId, reviewSectionId, backlogSectionId };
  }

  async function createMemberInOrg(orgId: string): Promise<{ userId: string; token: string }> {
    const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `member.${seed}@example.com`;
    const password = 'Password123!';

    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, firstName: 'Member', lastName: seed })
      .expect(201);
    const userId = registerRes.body.user.id as string;
    const token = registerRes.body.access_token as string;

    await prisma.orgMember.create({
      data: { orgId, userId, role: 'MEMBER' },
    });

    return { userId, token };
  }

  async function createTask(
    ctx: AuthContext,
    title: string,
    opts?: { projectId?: string; sectionId?: string; priority?: string },
  ) {
    const res = await request(app.getHttpServer())
      .post('/tasks')
      .set('Authorization', `Bearer ${ctx.token}`)
      .set('x-org-id', ctx.orgId)
      .send({
        projectId: opts?.projectId ?? ctx.projectId,
        title,
        priority: opts?.priority ?? 'LOW',
        sectionId: opts?.sectionId ?? ctx.backlogSectionId,
      })
      .expect(201);
    return res.body as { id: string };
  }

  async function createRule(
    ctx: AuthContext,
    body: {
      name: string;
      triggerType: string;
      conditions: Array<{ field: string; operator: string; value: string | null }>;
      actions: Array<{
        type: string;
        config: Record<string, string | number | boolean | null>;
      }>;
    },
    projectIdOverride?: string | null,
  ) {
    const res = await request(app.getHttpServer())
      .post('/automations')
      .set('Authorization', `Bearer ${ctx.token}`)
      .set('x-org-id', ctx.orgId)
      .send({
        ...body,
        projectId:
          projectIdOverride !== undefined ? projectIdOverride : ctx.projectId,
      })
      .expect(201);
    return res.body as { id: string; isActive: boolean };
  }

  async function latestExecution(ruleId: string) {
    return prisma.automationExecution.findFirst({
      where: { ruleId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async function cleanupTestData() {
    const orgs = await prisma.organization.findMany({
      where: { name: { startsWith: 'AUTOMATION_TEST_' } },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length === 0) return;

    await prisma.organization.deleteMany({
      where: { id: { in: orgIds } },
    });
  }
});

