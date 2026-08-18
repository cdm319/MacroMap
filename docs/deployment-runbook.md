# MacroMap production deployment runbook

Status: Phase 2 live
Last reviewed: 2026-08-18

## Boundaries

Application and infrastructure deployments run automatically after a reviewed
pull request is merged to `main`. The merge is the human deployment approval.
Agents may prepare or repair the workflow through pull requests, but must never
push or merge to `main` or dispatch a retry without an explicit human request.

Production contains real data. The first-release database initialization is
complete and its executable has been removed. Never apply the initial schema SQL
to production. Future schema or data operations need a reviewed, forward-only
plan and explicit approval.

## Phase 2 schema update record

The owner applied and verified
`packages/database/sql/updates/001-person-macro-targets.sql` in production on 17
August 2026. It added four nullable columns and validation constraints to
`person` without transforming existing data. Do not reapply it to production.

The owner applied and verified
`packages/database/sql/updates/002-recipe-library.sql` in production on 17
August 2026. It created four empty recipe tables and their supporting index
without transforming existing data. Do not reapply it to production.

The owner applied and verified the recipe photo schema update in production on
18 August 2026. The source-controlled update is
`packages/database/sql/updates/003-recipe-photos.sql`. It added one nullable
timestamp to `recipe` without transforming the two existing recipes. Do not
reapply it to production.

## Pending Phase 3 schema update

`packages/database/sql/updates/004-recipe-imports.sql` must be applied once by
the owner before the first Phase 3 import code is merged. It adds two nullable
source-attribution columns to `recipe` and creates an empty `recipe_import`
preview table. It does not transform any existing recipe data. Do not mark this
update as applied or reapply it until the owner has run and verified it.

The expected USD 2-6 monthly cost envelope is now live. The
database-not-pausing failure case remains approximately USD 51 per month. Check
current official prices and the PR's cost classification before merging. The
deployment workflow records a CDK diff immediately before deploying the same
cloud assembly.

## Production configuration

The `production` environment is restricted to deployments from `main`. It does
not require a reviewer because reviewed merges deploy automatically. The
repository has one deployment variable:

| Name                  | Purpose                                  |
| --------------------- | ---------------------------------------- |
| `AWS_DEPLOY_ROLE_ARN` | Owner-created production deployment role |

`MACROMAP_BUDGET_EMAIL` is an environment secret for the USD 8 and USD 15 budget
notifications. Never store its value in the repository.

The account-level GitHub OIDC provider for `token.actions.githubusercontent.com`
and CDK bootstrap stacks in `eu-west-2` and `us-east-1` must already exist. The
human owner creates the dedicated MacroMap role manually; no repository
workflow creates it.

The deployment role trusts only
`repo:cdm319@2217666/MacroMap@1335442523:environment:production` and may assume
the CDK bootstrap roles required to look up, publish, and deploy assets in both
regions. Pull-request workflows receive no AWS credentials.

The `chrismatthews.me` hosted-zone identifier is non-secret configuration in
`infra/src/config.ts`. CDK resolves the account from the authenticated role, so
neither value requires another GitHub variable.

The `Application` user-defined cost-allocation tag is active. During the normal
billing-data delay, use direct account billing review as the authoritative cost
check.

## First release record

- Pull request #2 merged as commit `783986a` on 17 August 2026.
- The automatic deployment workflow completed successfully.
- `MacroMapEdge` and `MacroMapProduction` reached `CREATE_COMPLETE`.
- The initial schema, Chris and Alex profiles, Cognito user, and immutable
  identity binding were created successfully.
- The owner confirmed the managed login and private household view at
  `https://macromap.chrismatthews.me`.
- Aurora auto-pause and resume were observed during initialization.
- The `Application` cost-allocation tag is active; USD 8 and USD 15 budgets each
  have actual and forecast notifications.

## Phase 2 release record

- Pull request #6 merged as commit `8b6d1c1` on 18 August 2026.
- The automatic production deployment completed successfully.
- The owner confirmed recipe photos can be added, displayed in the recipe
  library and cooking mode, replaced, and removed.

## Smoke and cost checks

For later releases, verify the changed production surface and continue to
monitor:

- an unauthenticated `/v1/session` request is rejected;
- the household login reaches the private view and shows Chris and Alex;
- signing out returns to the private sign-in screen;
- the USD 8 and USD 15 budget subscriptions are confirmed;
- the production stack has one Aurora writer, zero readers, and a 0-1 ACU
  range; and
- after at least five idle minutes, Aurora reaches 0 ACUs, then the next visit
  shows the waking state and successfully recovers.

Actual monthly spend is not yet available. The first monthly review must compare
tagged Cost Explorer data with the cost model, and budget-email delivery can
only be confirmed when a notification is emitted.

Live checks are not satisfied by local tests or CDK synthesis and must be
recorded after deployment.

## Later releases and rollback

For ordinary changes, merge to `main` after review and successful validation;
deployment then starts automatically. Use manual dispatch only to retry a failed
run. Before any later schema change, agree and document a forward-only update
plan suitable for real data.

To roll back application or infrastructure code, revert the responsible commit
through another reviewed pull request. Merging the revert deploys it. Retained
S3 buckets, Cognito users, database deletion protection, and final snapshots
prevent an ordinary rollback from silently deleting user data.
