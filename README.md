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

The CDK application is synthesis-only during Phase 0. Do not deploy it from a
developer machine.
