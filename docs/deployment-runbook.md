# MacroMap production deployment runbook

Status: Phase 1 implementation; no production deployment performed
Last reviewed: 2026-08-16

## Boundaries

Application and infrastructure deployments run only from committed `main`
through the protected GitHub Actions workflow. Every deployment requires human
approval. Agents may prepare or repair the workflow but must not dispatch or
approve it without an explicit human request.

The only exception is the one-time bootstrap of the first empty database. The
human owner runs the commands below from their developer machine after the first
deployment. This mutates production, is not a migration process, and must never
be run by an agent.

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
| `AWS_DEPLOY_ROLE_ARN`            | Deploy-role output of the GitHub roles stack             |
| `AWS_READ_ONLY_ROLE_ARN`         | Diff-role output of the GitHub roles stack               |
| `MACROMAP_HOSTED_ZONE_ID`        | Existing `chrismatthews.me` public hosted-zone ID        |

Add `MACROMAP_BUDGET_EMAIL` as an environment secret for the USD 8 and USD 15
budget notifications. Never store its value in the repository.

The account-level GitHub OIDC provider for `token.actions.githubusercontent.com`
and CDK bootstrap stacks in `eu-west-2` and `us-east-1` must already exist. If
the account has no initial OIDC-trusted role capable of deploying IAM, a human
administrator must establish that root of trust first.

Activate the `Application` user-defined cost allocation tag before relying on
the project-filtered budgets. Until activation and the normal billing-data delay
have passed, use direct account billing review as the authoritative cost check.

## First release

1. Merge the reviewed Phase 1 pull request to `main` after CI passes.
2. Dispatch **Provision GitHub roles** from `main` and approve its `production`
   environment gate. This creates free IAM roles only.
3. Copy the `DeployRoleArn` and `DiffRoleArn` outputs into
   `AWS_DEPLOY_ROLE_ARN` and `AWS_READ_ONLY_ROLE_ARN`.
4. Dispatch **Deploy production** from `main`. Inspect the read-only diff before
   approving the deploy job. The reviewed cloud assembly is deployed unchanged.
5. Bootstrap the empty database and household login using the next section.
6. Use Cognito's invitation and temporary-password flow to sign in at
   `https://macromap.chrismatthews.me`.

## One-time database bootstrap

Run this section only for a newly deployed, empty MacroMap database. It requires
local AWS credentials that can describe the stack, administer its Cognito user
pool, use the cluster Data API, and read the cluster secret.

First confirm the intended AWS identity, then load the deployed identifiers:

```sh
aws sts get-caller-identity

export AWS_REGION=eu-west-2
export DATABASE_NAME=$(aws cloudformation describe-stacks --stack-name MacroMapProduction --query "Stacks[0].Outputs[?OutputKey=='DatabaseName'].OutputValue" --output text)
export DATABASE_RESOURCE_ARN=$(aws cloudformation describe-stacks --stack-name MacroMapProduction --query "Stacks[0].Outputs[?OutputKey=='DatabaseResourceArn'].OutputValue" --output text)
export DATABASE_SECRET_ARN=$(aws cloudformation describe-stacks --stack-name MacroMapProduction --query "Stacks[0].Outputs[?OutputKey=='DatabaseSecretArn'].OutputValue" --output text)
export USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name MacroMapProduction --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)
export MACROMAP_LOGIN_EMAIL='replace-with-the-household-login-email'
```

Check that every value is non-empty before continuing. Create the Cognito user,
read its immutable `sub`, and apply the initial SQL plus identity binding in one
database transaction:

```sh
aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$MACROMAP_LOGIN_EMAIL" \
  --user-attributes \
    Name=email,Value="$MACROMAP_LOGIN_EMAIL" \
    Name=email_verified,Value=true

COGNITO_SUBJECT=$(aws cognito-idp admin-get-user \
  --user-pool-id "$USER_POOL_ID" \
  --username "$MACROMAP_LOGIN_EMAIL" \
  --query "UserAttributes[?Name=='sub'].Value | [0]" \
  --output text)

npm run db:bootstrap -- --subject "$COGNITO_SUBJECT"
```

Success prints `Created the initial schema, household, profiles, and login
link.` The SQL is intentionally not rerunnable: if any statement fails, the
transaction rolls back. Do not retry against a partly understood database;
inspect the error and the database state first.

Clear the shell values afterwards:

```sh
unset AWS_REGION DATABASE_NAME DATABASE_RESOURCE_ARN DATABASE_SECRET_ARN
unset USER_POOL_ID MACROMAP_LOGIN_EMAIL COGNITO_SUBJECT
```

## Smoke and cost checks

After the approved release, verify:

- an unauthenticated `/v1/session` request is rejected;
- the household login reaches the private view and shows Chris and Alex;
- signing out returns to the private sign-in screen;
- the USD 8 and USD 15 budget subscriptions are confirmed;
- the production stack has one Aurora writer, zero readers, and a 0-1 ACU
  range; and
- after at least five idle minutes, Aurora reaches 0 ACUs, then the next visit
  shows the waking state and successfully recovers.

These live checks are not satisfied by local tests or CDK synthesis and must be
recorded after deployment.

## Later releases and rollback

For ordinary changes, merge to `main`, dispatch **Deploy production**, inspect
the plan, and approve the protected job. Before any later schema change, agree
and document a forward-only migration strategy suitable for real data.

To roll back application or infrastructure code, revert the responsible commit
on `main`, review the new CDK diff, and run the protected deployment workflow.
Retained S3 buckets, Cognito users, database deletion protection, and final
snapshots prevent an ordinary rollback from silently deleting user data.
