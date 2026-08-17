# MacroMap MVP delivery plan

Status: Approved implementation sequence; Phase 2 complete
Last reviewed: 2026-08-18

## Delivery principles

MacroMap is delivered as small authenticated vertical slices. Each phase ends
with working behaviour, automated tests, updated documentation, and a reviewable
diff. Production is never deployed from a developer machine.

The order below is intentional: later work depends on stable recipe, nutrition,
and snapshot contracts. A human-approved merge authorises its automatic
production deployment.

Current progress:

- Phase 0 is complete and merged.
- Phase 1 is deployed in production. Database initialization, household login,
  private-session smoke testing, and Aurora pause/resume verification completed
  on 17 August 2026.
- Phase 2 is complete. Macro targets, snack reserve settings, the manual recipe
  library, private photos, and cooking mode are implemented. Imports and
  nutrition estimation remain Phase 3 work.
- Phases 3-6 have not started.

## Phase 0: Repository and contracts

Deliverables:

- npm workspace and shared TypeScript configuration;
- formatting, linting, type checking, unit tests, and build commands;
- package boundaries described by the technical architecture;
- initial API error and identifier conventions;
- local PostgreSQL development setup;
- pull-request CI with dependency install, lint, type check, tests, build, CDK
  assertions, and CDK synthesis; and
- committed lockfile and dependency policy.

Exit criteria:

- a clean checkout can run all validation with documented commands;
- tests and builds do not contact AWS, OpenAI, or USDA; and
- architectural and cost controls are represented by tests where practical.

## Phase 1: Deployable authenticated vertical slice

Deliverables:

- static Next.js application with responsive shell;
- Cognito managed login and logout;
- authenticated `/v1/session` endpoint;
- initial household and Chris/Alex profiles;
- Aurora Serverless v2, Data API, Drizzle schema, and initial schema SQL;
- CloudFront, private S3 origin, and `macromap.chrismatthews.me`;
- documented least-privilege requirements for an owner-created GitHub OIDC role;
- automatic production deployment after a reviewed merge to `main`;
- completed owner-run first-release database initialization;
- USD 8 and USD 15 budget notifications; and
- a waking-database state in the web application.

The existing account-level GitHub OIDC provider is reused. One dedicated
MacroMap deployment role is required. The human owner creates this account
prerequisite manually; no repository workflow provisions it. Application
deployment remains CI-only. Its ARN is the only repository variable; the budget
notification email remains an environment secret.

The static application receives generated non-secret environment identifiers
through a deployment-time `/config.json`. During the first release, the human
owner applied the committed initial SQL and bound the first Cognito `sub` in one
transaction. The one-time runner was then removed. Browser-supplied household
ownership remains prohibited.

Exit criteria:

- an unauthenticated caller cannot read application data;
- the one household login can load both planning profiles;
- the database pauses to zero and successfully resumes;
- no resource outside the approved architecture appears in CDK diff; and
- only a protected merge to `main` or an explicit human retry can start the
  production workflow.

## Phase 2: Profiles and recipe library

Deliverables:

- editable per-person kcal, protein, carbohydrate, and fat targets;
- snack reserve configuration defaulted to 15%;
- recipe list, detail, create, edit, and archive flows;
- structured ingredients and instructions;
- explicit meal-type and editable inferred tags;
- optional private recipe-photo upload; and
- mobile-friendly cooking mode without timers or offline support.

Exit criteria:

- a complete recipe can be created manually and cooked at a selected scale;
- recipes missing a usable yield or quantities cannot enter automatic planning;
- authoritative nutrition survives ingredient edits until the user explicitly
  chooses re-estimation; and
- all household-owned resources enforce authorisation in repository queries.

## Phase 3: Import and nutrition estimation

Deliverables:

- direct Schema.org `Recipe` JSON/JSON-LD import;
- URL fetching with Schema.org extraction first;
- bounded AI fallback extraction;
- mandatory import-review screen;
- versioned CoFID ingestion;
- cached USDA FoodData Central fallback;
- ingredient matching, confidence, provenance, and review warnings; and
- deterministic recipe nutrition calculation.

Exit criteria:

- imports never save without human review;
- fixtures cover malformed JSON-LD, multiple recipe nodes, missing yields,
  ambiguous quantities, prompt-injection text, redirect loops, private-network
  targets, oversized responses, invalid image data, and inaccessible URLs;
- estimated nutrition is reproducible from stored matches and quantities; and
- OpenAI failure or the AI budget ceiling does not block manual or valid
  Schema.org imports.

## Phase 4: Weekly planner and grocery list

Deliverables:

- Monday-to-Sunday meal slots and per-person attendance;
- quarter-serving portion allocation and sensible batch rounding;
- deterministic bounded planner with shortfall diagnostics;
- five-distinct-dinner target and two-week history penalty;
- per-person daily macro summaries with partial-day handling;
- provisional and approved grocery lists;
- compatible-unit and canonical-ingredient consolidation;
- immutable approved recipe snapshots; and
- idempotent Friday 17:00 `Europe/London` draft generation.

Exit criteria:

- golden tests cover the full priority order, dinner repetition, attendance,
  partial days, impossible targets, deterministic tie-breaking, and DST;
- the scheduler cannot create duplicate weekly drafts;
- grocery totals exactly reconcile to planned recipe snapshots; and
- no AI call occurs during ordinary plan generation.

## Phase 5: Review, conversational revision, and active week

Deliverables:

- direct attendance, portion, and recipe replacement controls;
- structured interpretation of conversational revisions;
- minimal-change re-planning and a consequential-change summary;
- draft approval and active grocery list;
- preservation of grocery additions, overrides, deletions, and checked state;
- past-meal freezing with current/future edits; and
- approved-plan history.

Exit criteria:

- explicit changes remain local when the resulting plan is acceptable;
- re-planning expands to the smallest viable set of substitutions;
- later recipe edits do not alter approved snapshots; and
- conversational text cannot bypass planner constraints or execute arbitrary
  application operations.

## Phase 6: Release hardening

Deliverables:

- accessibility and mobile interaction review;
- cold-start, timeout, retry, and failure-state testing;
- production backup/restore runbook;
- cost-tag, budget, log-retention, concurrency, and auto-pause verification;
- dependency and security review;
- seeded demonstration data or an onboarding path; and
- final MVP acceptance checklist against every product requirement and explicit
  exclusion.

Exit criteria:

- all validation passes from a clean checkout;
- infrastructure matches the approved CDK diff;
- actual post-deployment idle behaviour is measured;
- remaining limitations are documented without being disguised as completed;
  and
- the human owner explicitly accepts the MVP.

## CI and deployment workflows

### Pull-request validation

The pull-request workflow is read-only with respect to production. It runs:

1. lockfile-based dependency installation;
2. formatting and lint checks;
3. TypeScript type checking;
4. unit and PostgreSQL integration tests;
5. critical Playwright journeys against local fixtures;
6. production builds;
7. CDK assertion tests and synthesis; and
8. a cost-impact summary for infrastructure changes.

No PR workflow calls OpenAI, mutates AWS, applies production schema updates, or
deploys.

### Production deployment

Production deployment:

- runs only from committed `main` through GitHub Actions;
- starts automatically after a merge, with manual dispatch available for retry;
- uses GitHub OIDC rather than stored AWS credentials;
- uses one owner-created deployment role;
- produces a CDK diff before deploying the same cloud assembly;
- treats the human merge decision as deployment approval;
- uses concurrency control to prevent overlapping deployments; and
- records the deployed commit and stack outputs.

Agents may build or repair this workflow only through pull requests. They must
never push or merge to `main`, and must not manually dispatch a retry unless the
human explicitly asks.

### Database initialization and later schema changes

The zero-data first release used one committed initial SQL file. The human owner
completed that operation on 17 August 2026, and the executable runner has been
removed. The SQL remains the historical baseline and a local integration-test
fixture; it must never be reapplied to production.

Schema changes use reviewed, forward-only SQL files applied manually by the
human owner. Destructive or contracting changes require a backup decision and
explicit approval. Use expand-and-contract releases:

1. apply an additive, backward-compatible schema update;
2. backfill through a bounded, resumable operation only if existing rows need
   new values;
3. deploy code using the new shape; and
4. remove the old shape only in a later approved release.

## Validation strategy

- Pure domain tests exercise macros, portions, unit conversion, planning score,
  minimal revisions, and grocery reconciliation.
- Repository integration tests run against real ephemeral PostgreSQL.
- Contract tests validate every API and AI schema.
- Import tests use captured local fixtures, never live recipe websites.
- OpenAI tests use recorded synthetic responses and failure cases, never paid
  calls.
- CDK assertions enforce cost limits such as zero-minimum/one-maximum Aurora,
  no NAT Gateway, one scheduler, finite retention, and bounded concurrency.
- Playwright covers login hand-off through a local auth seam, recipe review,
  draft review, grocery edits, and cooking mode.

Production smoke checks are documented separately and run only after an
approved deployment. Passing local or CI tests must not be described as proof
that production is healthy.

## Definition of done for every slice

A slice is complete only when:

- acceptance behaviour is implemented;
- relevant unit, integration, contract, and browser tests pass;
- lint, type check, build, CDK synth, and diff checks pass where applicable;
- security and cost impacts are stated;
- requirements and architecture documents remain accurate;
- no unrelated user changes are included; and
- deployment, production schema/data, and live-call actions taken or
  deliberately not taken are reported plainly.
