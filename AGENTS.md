# MacroMap agent instructions

These instructions apply to the entire repository.

## Authoritative documents

Read these before planning or changing implementation:

1. `docs/product-requirements.md` — required product behaviour and exclusions.
2. `docs/technical-architecture.md` — approved components and system boundaries.
3. `docs/cost-model.md` — budget, capacity limits, and cost approval rules.
4. `docs/delivery-plan.md` — phase dependencies, CI, deployment, and validation.
5. `docs/api-conventions.md` — shared identifiers, transport, errors, and retries.
6. `docs/dependency-policy.md` — approved packages and dependency-change rules.

Do not silently reinterpret conflicts. Stop, identify the smallest conflicting
decision, and ask the human owner to resolve it. Update the authoritative
document in the same change as an approved contract change.

## Before making changes

- Inspect the current branch, worktree status, relevant implementation,
  contracts, migrations, and tests.
- Preserve unrelated and uncommitted user work.
- Keep work ticket- or task-scoped. Use an isolated branch/worktree for parallel
  work and do not merge it yourself.
- State a short implementation and validation plan before sensitive work.
- Obtain explicit approval before changing architecture, authentication,
  database contracts, migrations, dependency policy, infrastructure, AI
  prompts/schemas/models, or cost-sensitive configuration.
- Do not expand the MVP into an explicitly out-of-scope feature without a
  product decision.

Routine implementation inside an already approved contract may proceed without
another design decision.

## Cost gate

Cost is a first-class acceptance criterion. For every infrastructure, AI,
external-service, scheduling, logging, retention, or scaling change, declare the
impact as `none`, `decrease`, or `increase/uncertain` using
`docs/cost-model.md`.

For `increase/uncertain`, stop before editing and present the before/after
monthly estimate, usage-sensitive maximum, cheaper options, and rollback route.
Human approval to code the change does not authorise deployment.

Never change these values incidentally:

- Aurora minimum 0 ACUs, maximum 1 ACU, five-minute auto-pause;
- one writer and no replicas;
- API Lambda reserved concurrency 4;
- planner Lambda reserved concurrency 1;
- API throttle 5 requests/second with burst 10;
- fourteen-day application log retention;
- one production environment and one weekly scheduler;
- OpenAI model, token caps, one-retry limit, or approved application ceiling;
- USD 8 warning and USD 15 urgent AWS budget alerts; or
- reuse of the existing `chrismatthews.me` hosted zone.

Do not add a NAT Gateway, load balancer, containers, RDS Proxy, always-on
database, replica, second hosted zone, cloud staging environment, paid
observability service, or another paid provider without explicit architecture
and cost approval.

## AWS, deployment, and migrations

- Define AWS resources only through the TypeScript CDK application.
- Do not run local `cdk deploy`, mutate AWS, invoke production functions, change
  DNS, or trigger paid OpenAI calls.
- Production deployment happens only from committed `main` through the manually
  approved GitHub Actions production workflow.
- Every production deployment requires human approval, including app-only
  releases.
- Never trigger a deployment unless the human explicitly requests it. Never
  approve an environment gate on the human's behalf.
- Use the existing account GitHub OIDC provider with a dedicated least-privilege
  MacroMap role. Never create or commit long-lived AWS credentials.
- Run migrations only through the separate protected CI workflow. Migrations
  must be reviewed, forward-only, and expand-then-contract.
- Destructive data changes, backfills, restores, and production diagnostics need
  a specific plan and approval. Prefer read-only evidence.
- Treat CDK diff as required evidence, not permission to deploy.

## Implementation boundaries

- Keep one TypeScript modular monolith with pure domain packages and thin web,
  HTTP, persistence, AI, and AWS adapters.
- Prefer direct, readable code and explicit names over premature abstraction or
  configurable machinery.
- TypeScript is strict. Avoid `any`; validate all external data with versioned
  Zod schemas.
- The authenticated Cognito `sub` is the identity boundary. Never trust a
  browser-supplied household or account identifier.
- Use decimal-safe calculations and explicit units for nutrition and quantities.
- Retain original imported text and provenance alongside normalised data.
- Keep planning, nutrition arithmetic, portion scaling, and grocery aggregation
  deterministic. AI must not replace these rules.
- AI output is untrusted input: schema-validate it, deterministically check it,
  allow at most one bounded retry, and require review where specified.
- Never invent a recipe or silently save imported/inferred content.
- Use `Europe/London` for week boundaries and scheduling; store timestamps as
  UTC instants and meal dates as explicit local dates.
- Make scheduled generation and mutation retries idempotent.
- Preserve approved recipe snapshots so library edits cannot rewrite history.

## Tests and validation

For the changed surface, run the narrowest relevant tests first, then every
available repository check before handoff:

- formatting and lint;
- TypeScript type checking;
- unit and PostgreSQL integration tests;
- API/AI contract tests;
- Playwright journeys when UI behaviour changes;
- production build;
- CDK assertion tests and synthesis for infrastructure changes; and
- `git diff --check`.

Tests must not depend on live AWS, OpenAI, USDA, or recipe websites. Use local
fixtures, mocks, and ephemeral PostgreSQL. If a check cannot run, say exactly
why and do not claim the affected behaviour is verified.

Add regression coverage for every bug fix. Planner changes require deterministic
fixtures covering objective priority and diagnostics, not only snapshot tests.

## Dependencies and generated files

- Use the root lockfile and the repository package manager.
- Add a runtime dependency only when the standard library or an existing
  dependency cannot reasonably meet the requirement.
- Explain maintenance, bundle, security, and cost consequences before adding a
  major dependency or service SDK.
- Do not hand-edit generated migrations, build output, or dependency artifacts
  unless the tool's documented workflow requires it.
- Do not commit build output, secrets, local databases, environment files, or
  captured private recipe content.

## Handoff

Report:

- behaviour and files changed;
- cost classification and whether approval was required;
- validation completed and its results;
- deployment, migration, AWS, and live OpenAI actions explicitly not performed;
  and
- remaining risks, decisions, or follow-up work.

Leave merging, production approval, deployment, and material contract decisions
to the human owner.
