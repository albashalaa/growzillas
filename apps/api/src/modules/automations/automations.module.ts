import { Module } from '@nestjs/common';

import { AutomationEngineService } from './automation-engine.service';
import { AutomationsController } from './automations.controller';
import { AutomationsService } from './automations.service';
import { AutomationsRepository } from './automations.repository';
import { ConditionEvaluatorService } from './condition-evaluator.service';
import {
  ACTION_EXECUTORS,
  BaseActionExecutor,
} from './executors/base-action-executor';
import { AssignUserExecutor } from './executors/assign-user.executor';
import { MoveToSectionExecutor } from './executors/move-to-section.executor';
import { NotifyExecutor } from './executors/notify.executor';
import { SetPriorityExecutor } from './executors/set-priority.executor';
import { SetReviewerExecutor } from './executors/set-reviewer.executor';

const ACTION_EXECUTOR_PROVIDERS = [
  AssignUserExecutor,
  MoveToSectionExecutor,
  SetPriorityExecutor,
  NotifyExecutor,
  SetReviewerExecutor,
] as const;

@Module({
  controllers: [AutomationsController],
  providers: [
    AutomationsService,
    AutomationsRepository,
    ConditionEvaluatorService,
    AutomationEngineService,
    ...ACTION_EXECUTOR_PROVIDERS,
    {
      provide: ACTION_EXECUTORS,
      useFactory: (
        assignUser: AssignUserExecutor,
        moveToSection: MoveToSectionExecutor,
        setPriority: SetPriorityExecutor,
        notify: NotifyExecutor,
        setReviewer: SetReviewerExecutor,
      ): BaseActionExecutor[] => [
        assignUser,
        moveToSection,
        setPriority,
        notify,
        setReviewer,
      ],
      inject: [
        AssignUserExecutor,
        MoveToSectionExecutor,
        SetPriorityExecutor,
        NotifyExecutor,
        SetReviewerExecutor,
      ],
    },
  ],
  exports: [
    AutomationsRepository,
    AutomationsService,
    AutomationEngineService,
    ConditionEvaluatorService,
  ],
})
export class AutomationsModule {}
