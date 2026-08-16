# MacroMap

Automated weekly meal planning and shopping list generation to match
macronutrient requirements.

## Project documentation

- [Product requirements](docs/product-requirements.md)
- [Technical architecture](docs/technical-architecture.md)
- [Cost model and guardrails](docs/cost-model.md)
- [Delivery plan](docs/delivery-plan.md)
- [API conventions](docs/api-conventions.md)
- [Dependency policy](docs/dependency-policy.md)
- [Production deployment runbook](docs/deployment-runbook.md)

Repository-wide implementation and delivery rules are defined in
[`AGENTS.md`](AGENTS.md).

## Local development

Prerequisites:

- Node.js 24 LTS
- npm 11
- Docker with Docker Compose

Install dependencies and start the local PostgreSQL service:

```sh
npm install
npx playwright install chromium
docker compose up -d --wait postgres
```

Copy `.env.example` to `.env`, then run the complete local validation suite:

```sh
npm run validate
```

The main development commands are:

```sh
npm run dev
npm test
npm run test:e2e
npm run cdk:synth
```

Local development uses the non-secret `apps/web/public/config.json` seam and
shows the seeded Chris and Alex household without contacting Cognito or AWS.
Production replaces that file during deployment with generated Cognito and API
identifiers.

Do not deploy infrastructure or apply production migrations from a developer
machine. The protected GitHub Actions paths and required repository setup are
documented in the [production deployment runbook](docs/deployment-runbook.md).
