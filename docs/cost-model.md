# MacroMap cost model and guardrails

Status: Approved and deployed for MVP
Prices checked: 2026-08-18
AWS region: `eu-west-2` unless stated otherwise

Phase 1 was deployed on 17 August 2026. Both stacks completed successfully, the
`Application` cost-allocation tag is active, and the USD 8 and USD 15 budgets
each have actual and forecast notifications. Aurora auto-paused and resumed
during the initial database setup. Actual monthly spend remains unverified until
billing data is available.

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
| Up to 1,000 maximum-size recipe photos in S3                 |                        About $0.12 |
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
- [S3 pricing](https://aws.amazon.com/s3/pricing/)

### Recipe photo storage

The owner approved one private S3 Standard bucket on 18 August 2026 as an
`increase/uncertain` change. Each recipe has at most one current photo, each
photo is limited to 5 MiB, unfinished uploads expire after one day, and the cost
model assumes no more than 1,000 stored photos. That ceiling is about 4.9 GiB,
or approximately USD 0.12 per month at a conservative USD 0.025 per GiB-month.
Normal request charges are expected to remain below one cent.

Inbound transfer is free and AWS currently includes the first 100 GB per month
of internet transfer out across AWS services. That allowance is account-wide,
so it is not treated as a guarantee. If it is already exhausted, 10,000 views
of maximum-size photos would transfer about 49 GB and are conservatively sized
at roughly USD 5. The existing USD 8 and USD 15 budgets remain the guardrail.

## AI budget

The owner approved `gpt-5.6-luna` on 18 August 2026. Current official pricing
was checked that day at USD 0.20 per million input tokens and USD 1.20 per
million output tokens. At 5,000 input tokens and 1,000 output tokens, one call
costs approximately USD 0.0022. One hundred imports of that size cost
approximately USD 0.22 before any validation retries.

AI calls are limited by:

- a maximum input size for fetched recipe content;
- task-specific output token limits;
- exactly one validation retry;
- no higher-priced automatic fallback model;
- a USD 5 application-enforced monthly AI ceiling;
- a clear message when the optional AI ceiling is reached; and
- recorded model, token usage, prompt version, and estimated cost for each call.

Schema.org imports, manual entry, normal planning, grocery recalculation, and
nutrition calculation continue to work when AI is unavailable or capped.

The matching OpenAI project budget must be configured before live AI is
enabled. The application ceiling blocks further optional AI calls for the
month; it must never be silently raised.

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
| Recipe photos                       | One private bucket; 5 MiB per photo               |
| Paid external services              | OpenAI only                                       |

The scheduler and planner concurrency entries are maximums reserved for Phase
4; Phase 1 intentionally creates neither resource. Phase 1 creates one API
Lambda with reserved concurrency 4, one Aurora writer, and no NAT Gateway,
endpoint, load balancer, proxy, container service, or read replica.

The synthesised template also contains CDK-managed helper functions for static
asset deployment and the cross-region certificate reference. They run only
during a deployment, are not application services, and do not create an
always-on compute charge.

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

Approval to implement is not approval to merge. The human merge decision is the
cost and deployment gate because every merge to `main` deploys automatically.

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
