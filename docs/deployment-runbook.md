# MacroMap production deployment runbook

Status: Phase 1 implementation; no production deployment performed
Last reviewed: 2026-08-16

## Boundaries

MacroMap application deployments and migrations run only from committed `main`
through GitHub Actions. Every mutating job uses the protected `production`
environment and requires a human approval. Agents may prepare or repair the
workflows but must not dispatch or approve them without an explicit human
request.

The first deployment begins the expected USD 2-6 monthly cost envelope. The
database-not-pausing failure case remains approximately USD 51 per month. Check
current official prices and review the CDK diff before approving the first run.

## Required GitHub configuration

Create a `production` environment with required reviewers and prevent
self-review where the repository plan supports it. Add these repository or
environment variables:

| Name                             | Purpose                                                  |
| -------------------------------- | -------------------------------------------------------- |
| `AWS_ACCOUNT_ID`                 | Target AWS account                                       |
| `AWS_ACCOUNT_BOOTSTRAP_ROLE_ARN` | Existing approved role used once to create project roles |
| `AWS_DEPLOY_ROLE_ARN`            | Output of `MacroMapGitHubBootstrap`                      |
| `AWS_READ_ONLY_ROLE_ARN`         | Output of `MacroMapGitHubBootstrap`                      |
| `AWS_MIGRATION_ROLE_ARN`         | Output of `MacroMapProduction` after first deployment    |
| `MACROMAP_HOSTED_ZONE_ID`        | Existing `chrismatthews.me` public hosted-zone ID        |

Add these environment secrets. Store only their values in GitHub, never in the
repository:

| Name                    | Purpose                                      |
| ----------------------- | -------------------------------------------- |
| `MACROMAP_BUDGET_EMAIL` | Recipient for USD 8 and USD 15 notifications |
| `MACROMAP_LOGIN_EMAIL`  | Email address for the one household login    |

The account-level GitHub OIDC provider for `token.actions.githubusercontent.com`
and CDK bootstrap stacks in `eu-west-2` and `us-east-1` must already exist. If
the account has no initial OIDC-trusted role capable of deploying IAM, a human
administrator must establish that root of trust first; the project cannot
safely bootstrap its own first credential.

Activate the `Application` user-defined cost allocation tag in the AWS billing
account before relying on the project-filtered budgets. Until activation and
the usual billing-data delay have passed, treat direct account billing review
as the authoritative cost check.

## First release

1. Merge the reviewed Phase 1 pull request to `main` after CI passes.
2. Dispatch **Bootstrap GitHub roles** from `main`. Review and approve its
   `production` environment gate. This creates free IAM roles only.
3. Copy the `DeployRoleArn` and `DiffRoleArn` stack outputs into
   `AWS_DEPLOY_ROLE_ARN` and `AWS_READ_ONLY_ROLE_ARN`.
4. Dispatch **Deploy production** from `main`. Inspect the read-only diff before
   approving the deploy job. The approved cloud assembly, not a rebuilt one, is
   deployed.
5. Copy the `MigrationRoleArn` output from `MacroMapProduction` into
   `AWS_MIGRATION_ROLE_ARN`.
6. Dispatch **Migrate production database** with
   `bootstrap_household_login=true`. Review the printed migration list and
   approve the protected job. It applies pending SQL, creates the Cognito login
   if absent, and idempotently binds its `sub` to the seeded household.
7. Use Cognito's invitation and temporary-password flow to sign in at
   `https://macromap.chrismatthews.me`.

No local CDK deploy, direct production SQL, or locally issued Cognito admin
command is part of this procedure.

## Smoke and cost checks

After the approved release, verify:

- an unauthenticated `/v1/session` request is rejected;
- the household login reaches the private view and shows Chris and Alex;
- signing out returns to the private sign-in screen;
- the USD 8 and USD 15 budget subscriptions are confirmed by the recipient;
- the production stack has one Aurora writer, zero readers, and a 0-1 ACU
  range; and
- after at least five idle minutes, Aurora reaches 0 ACUs, then the next visit
  shows the waking state and successfully recovers.

These live checks are not satisfied by local tests or CDK synthesis and must be
recorded after deployment.

## Later releases and rollback

For ordinary changes, merge to `main`, dispatch **Deploy production**, inspect
the plan, and approve the protected job. Run **Migrate production database**
only when reviewed migration files are pending. Contracting or destructive SQL
requires a separate backup and rollback decision.

To roll back application or infrastructure code, revert the responsible commit
on `main`, review the new CDK diff, and run the protected deployment workflow.
SQL migrations are forward-only: repair them with a new reviewed migration
rather than deleting migration history. Retained S3 buckets, Cognito users,
database deletion protection, and final snapshots prevent an ordinary rollback
from silently deleting user data.
