# V1 Automations — E2E test matrix

Run: `pnpm test:e2e -- automations-v1` from `apps/api`.

Last verified: 27 tests, all **PASS** (see suite `automations-v1.e2e-spec.ts`).

## 1. Triggers

| ID | Case | Jest `it(...)` | Status |
|----|------|----------------|--------|
| TR-1 | TASK_CREATED fires + execution SUCCESS | CASE A, CASE H, CASE O, CASE E (partial), rule CRUD | PASS |
| TR-2 | TASK_SECTION_CHANGED fires | CASE B, C, G, G2, I, J, T, U, N, FAILED (section) | PASS |
| TR-3 | TASK_ASSIGNED fires | CASE D, M, R, SKIPPED notification | PASS |
| TR-4 | COMMENT_CREATED fires | CASE S, FAILED (comment) | PASS |

## 2. Condition fields (`equals` / `not_equals`)

| ID | Field | Jest `it(...)` | Status |
|----|-------|----------------|--------|
| CF-1 | `task.sectionId` | CASE B, C, G, G2, S | PASS |
| CF-2 | `task.priority` | CASE I | PASS |
| CF-3 | `task.assigneeId` | CASE J | PASS |
| CF-4 | `task.projectId` | CASE K, CASE L | PASS |
| CF-5 | `after.sectionId` | CASE T | PASS |
| CF-6 | `before.sectionId` | CASE U | PASS |

## 3. Actions

| ID | Action | Jest `it(...)` | Status |
|----|--------|----------------|--------|
| AC-1 | ASSIGN_USER | CASE B, M, N, FAILED paths | PASS |
| AC-2 | MOVE_TO_SECTION | CASE H, O, SKIPPED move noop | PASS |
| AC-3 | SET_PRIORITY | CASE A, I, J, K, L, N, O, S, T, U | PASS |
| AC-4 | SEND_NOTIFICATION (`USER`, `ASSIGNEE`, `REVIEWER`) | CASE Q, R, D, G, G2 | PASS |
| AC-5 | SET_REVIEWER | CASE C, G, G2, I, P | PASS |

## 4. CRUD + toggle

| ID | Behavior | Jest `it(...)` | Status |
|----|----------|----------------|--------|
| CR-1 | Create rule (POST) | rule CRUD, all cases using `createRule` | PASS |
| CR-2 | Read / 404 after delete | rule CRUD | PASS |
| CR-3 | Update rule (PATCH) | rule CRUD, CASE E | PASS |
| CR-4 | Toggle off: no execution, no executions row | rule CRUD | PASS |
| CR-5 | Toggle on: rule runs again | rule CRUD | PASS |
| CR-6 | Delete rule | rule CRUD, CASE F (deleted rule) | PASS |

## 5. Notifications

| ID | Behavior | Jest `it(...)` | Status |
|----|----------|----------------|--------|
| NT-1 | AUTOMATION notification row (`USER`) | CASE Q | PASS |
| NT-2 | List API includes automation | CASE Q, G | PASS |
| NT-3 | Unread count increments | CASE G, R | PASS |
| NT-4 | `ASSIGNEE` target | CASE D, R | PASS |
| NT-5 | `REVIEWER` + `notifyActor` | CASE G | PASS |
| NT-6 | `REVIEWER` without `notifyActor` when actor is reviewer | CASE G2 (no noise) | PASS |

## 6. Reviewer flow

| ID | Behavior | Jest `it(...)` | Status |
|----|----------|----------------|--------|
| RV-1 | SET_REVIEWER persists `reviewerId` | CASE C, G | PASS |
| RV-2 | SET_REVIEWER does not replace assignee membership | CASE P | PASS |
| RV-3 | NOTIFY(REVIEWER) semantics with actor | CASE G, G2 | PASS |

## 7. Execution outcomes (automation run status)

| ID | Status | Scenario | Jest `it(...)` | Status |
|----|--------|----------|----------------|--------|
| EX-1 | SUCCESS | Actions applied | CASE A–S, T, U, etc. | PASS |
| EX-2 | SKIPPED | Conditions not met (e.g. projectId) | CASE K (task A), CASE L | PASS |
| EX-3 | SKIPPED | Action no-op (MOVE_TO_SECTION same section) | SKIPPED move | PASS |
| EX-4 | SKIPPED | Action no-op (notify no recipient / policy) | SKIPPED notify, CASE G2 | PASS |
| EX-5 | FAILED | Executor error; primary HTTP still OK | FAILED (section), FAILED (comment) | PASS |

## 8. Cross-cutting

| ID | Behavior | Jest `it(...)` | Status |
|----|----------|----------------|--------|
| XC-1 | Multi-action chain | CASE N, O, G | PASS |
| XC-2 | Org-wide vs project-scoped rule | CASE K, L | PASS |
| XC-3 | Disabled rule does not run | CASE F | PASS |

## Notes

- Operators **equals** and **not_equals** are supported (`AUTOMATION_CONDITION_OPERATORS`); UI labels: “is” / “is not”.
- UI/board flows are not exercised here; this matrix tracks **API e2e** coverage only.
- Jest may print “did not exit” (open handles); does not change PASS/FAIL of cases.
