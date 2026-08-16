# Dependency policy

Status: Phase 1 baseline

## Runtime and package manager

- Development and CI use Node.js 24 LTS and npm 11.
- npm workspaces and the root `package-lock.json` are authoritative.
- CI uses `npm ci`; it must never resolve a fresh dependency graph.
- Package manifests describe compatible versions; the lockfile pins the exact
  installed graph.
- Runtime upgrades are deliberate changes with clean-checkout validation.

## Approved baseline

The Phase 1 baseline is deliberately small:

- Next.js and React for the statically exported web application;
- Zod for external and shared contract validation;
- Drizzle ORM and `pg` for the schema, local PostgreSQL adapter, and tests;
- the AWS RDS Data API client for the production repository and one-time
  database bootstrap;
- AWS Lambda TypeScript definitions for handler boundaries;
- AWS CDK and Constructs for production infrastructure and assertions;
- TypeScript, ESLint, and Prettier for static quality checks;
- Vitest for unit, contract, integration, and CDK assertion tests; and
- Playwright for critical browser journeys.

`pg` supports local development and integration tests only. Production uses the
Aurora Data API and must not add a persistent Lambda connection pool. The
initial schema is explicit reviewed SQL applied once by the human owner; no
migration-generator dependency is approved.

No UI framework, state manager, HTTP client, date library, decimal library,
planner solver, analytics SDK, monitoring agent, or paid-service SDK is approved
yet. Add one only when an implemented requirement cannot be met clearly with
the platform or existing dependencies.

## Adding or updating dependencies

Before adding a major runtime dependency or changing the dependency policy:

1. explain the concrete requirement;
2. compare the standard library and existing dependencies;
3. review maintenance activity, licence, bundle/runtime cost, install scripts,
   known vulnerabilities, and transitive dependency size;
4. state infrastructure or paid-service cost impact under `docs/cost-model.md`;
5. obtain human approval; and
6. update this document and the lockfile in the same change.

Do not use unpinned Git URLs, local machine paths, or arbitrary remote scripts
as package dependencies. Keep one root lockfile and do not commit nested
lockfiles.

## Review and maintenance

- Run `npm audit` as evidence, while recognising that an audit result is not a
  complete security review.
- Prefer focused, individually reviewable upgrades over broad version churn.
- Major framework, runtime, ORM, infrastructure-library, or test-runner upgrades
  need explicit approval and full validation.
- Remove unused dependencies promptly.
- GitHub Actions are dependencies. Use official actions, minimal permissions,
  and reviewed major-version tags; move to immutable commit pins when the
  repository establishes an automated update path for them.
- Never claim zero vulnerabilities solely because `npm audit` passes.
