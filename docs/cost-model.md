# MacroMap cost model and guardrails

Status: Approved for MVP implementation
Prices checked: 2026-08-15
AWS region: `eu-west-2` unless stated otherwise

## Cost objective

MacroMap is a personal project. Its normal monthly infrastructure and AI cost
should remain below USD 8, with an urgent alert at USD 15. Cost reduction takes
priority over eliminating accepted cold starts or adding operational
convenience.

These are alert thresholds, not a promise that AWS will automatically stop all
resources. Guardrails within the architecture limit the most plausible runaway
paths without risking automatic deletion of user data.

## Expected monthly cost

Aurora PostgreSQL is the material baseline cost. The current London public
price is approximately USD 0.14 per ACU-hour. At the 0.5 ACU active floor this
is about USD 0.07 per active hour.

| Assumption                                                   |           Approximate monthly cost |
| ------------------------------------------------------------ | ---------------------------------: |
| Aurora active 30 minutes/day                                 |                              $1.05 |
| Aurora active 1 hour/day                                     |                              $2.10 |
| Aurora active 2 hours/day                                    |                              $4.20 |
| Aurora accidentally active continuously                      |                             $51.10 |
| One Secrets Manager database secret                          |                              $0.40 |
| 1 GB Aurora storage                                          |                              $0.10 |
| Route 53 hosted zone                                         | $0 additional; reuse existing zone |
| Static web, API, auth, scheduler, and logs at personal usage |           Expected $0 to low cents |

The expected MVP total is roughly USD 2-6 per month, excluding the existing
domain registration and assuming the database pauses correctly. Shared AWS free
allowances may already be partly consumed by other projects, so the estimate
must not treat a free tier as a hard guarantee.

Reference pricing:

- [Aurora pricing](https://aws.amazon.com/rds/aurora/pricing/)
- [London RDS public price list](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/eu-west-2/index.json)
- [Lambda pricing](https://aws.amazon.com/lambda/pricing/)
- [API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/)
- [Cognito pricing](https://aws.amazon.com/cognito/pricing/)
- [EventBridge pricing](https://aws.amazon.com/eventbridge/pricing/)
- [Route 53 pricing](https://aws.amazon.com/route53/pricing/)

## AI budget

The default model is `gpt-5.6-luna`, subject to verification against current
official OpenAI documentation immediately before implementation or any model
change. At prices checked on 2026-08-15, 5,000 input tokens and 1,000 output
tokens cost approximately USD 0.0022. One hundred imports of that size would
cost approximately USD 0.22.

AI calls are limited by:

- a maximum input size for fetched recipe content;
- task-specific output token limits;
- exactly one validation retry;
- no higher-priced automatic fallback model;
- an application-level monthly AI ceiling approved before enabling live calls;
- a clear message when the optional AI ceiling is reached; and
- recorded model, token usage, prompt version, and estimated cost for each call.

Schema.org imports, manual entry, normal planning, grocery recalculation, and
nutrition calculation continue to work when AI is unavailable or capped.

The OpenAI project budget and application ceiling must be chosen together
before live AI is enabled. An agent must not invent or silently raise either
value.

Reference: [official OpenAI model documentation](https://developers.openai.com/api/docs/models).

## Enforced AWS guardrails

| Area                                | MVP limit                                         |
| ----------------------------------- | ------------------------------------------------- |
| Aurora capacity                     | Minimum 0 ACU, maximum 1 ACU                      |
| Aurora idle pause                   | Five minutes                                      |
| Aurora topology                     | One writer, no replicas, Standard storage         |
| API Lambda reserved concurrency     | 4                                                 |
| Planner Lambda reserved concurrency | 1                                                 |
| API throttle                        | 5 requests/second, burst 10                       |
| Lambda architecture                 | ARM64 where supported                             |
| Application log retention           | 14 days                                           |
| Scheduler                           | One weekly schedule                               |
| Cloud environments                  | Local and one production environment only         |
| Network                             | No NAT Gateway, load balancer, or RDS Proxy       |
| DNS                                 | Reuse the existing `chrismatthews.me` hosted zone |
| Paid external services              | OpenAI only                                       |

Every provisioned resource is tagged with at least `Application=MacroMap` and
`Environment=production`. Cost allocation tags must be activated where the AWS
account permits it.

AWS Budgets must provide:

- a warning notification at USD 8 forecast or actual monthly cost; and
- an urgent notification at USD 15 forecast or actual monthly cost.

The notification recipient is supplied as protected CI configuration rather
than committed to the repository. Budget filters should use MacroMap cost tags
where supported. Account-level alert limitations must be documented rather
than hidden.

## Cost-change approval protocol

Every infrastructure, AI, external-service, scheduling, retention, or scaling
change is classified in the work plan as:

- `none`: no plausible change in steady-state or usage cost;
- `decrease`: cost can only fall without weakening required behaviour; or
- `increase/uncertain`: cost may rise or cannot be bounded confidently.

Before implementing an `increase/uncertain` change, an agent must stop and
obtain explicit human approval. The request must state:

1. the current and proposed configuration;
2. expected steady-state monthly cost;
3. usage-sensitive or worst-plausible monthly cost;
4. cheaper alternatives and their trade-offs; and
5. the rollback route.

Approval to implement is not approval to deploy. Every production deployment
has a separate human approval gate in CI.

The following always require this review, even when described as a fix:

- increasing Aurora minimum or maximum capacity;
- preventing or delaying database auto-pause;
- adding a database instance, replica, proxy, or connection pooler;
- adding VPC networking, a NAT Gateway, endpoint, load balancer, container, or
  continuously running compute;
- increasing Lambda memory, timeout, concurrency, API throttle, log retention,
  or schedule frequency;
- creating another hosted zone or cloud environment;
- changing AI model, token limits, retries, fallback behaviour, or call
  frequency;
- adding a paid provider or dependency; and
- enabling paid monitoring, backups beyond the approved policy, or analytics.

## Cost verification

Cost assumptions are time-sensitive. Before the first production deployment
and before any approved cost-sensitive change:

1. check current official AWS and OpenAI prices;
2. run CDK synthesis and a read-only CDK diff in CI;
3. update this document if the expected band changes materially;
4. confirm the USD 8 and USD 15 budget notifications; and
5. verify after deployment that Aurora reaches zero ACUs when idle.

The first monthly review should compare tagged AWS Cost Explorer data, OpenAI
usage, and the estimates above. Do not claim the project is within budget until
actual billing data is available.
