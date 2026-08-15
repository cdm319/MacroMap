# API conventions

Status: Phase 0 baseline

## Resource and transport conventions

- All application endpoints use HTTPS and live below `/v1`.
- JSON keys use `camelCase`; URL path segments use lower-case plural nouns.
- Request and response bodies are validated by schemas in `packages/contracts`.
- Content types must be explicit. Successful JSON responses use
  `application/json`.
- Timestamps are UTC RFC 3339 strings. Meal and week dates are local ISO
  `YYYY-MM-DD` values interpreted in `Europe/London`.
- Resource identifiers are opaque UUIDs. Clients must not infer ordering,
  ownership, or resource type from an identifier.
- The authenticated Cognito JWT `sub`, not a request field, determines the
  account identity.

## Errors

Errors use one envelope:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "The request could not be validated.",
    "requestId": "request-123",
    "details": {}
  }
}
```

- `code` is a stable `UPPER_SNAKE_CASE` application code.
- `message` is safe to show to the user and must not expose implementation or
  security details.
- `requestId` correlates safe structured logs and is omitted only when no
  request context exists.
- `details` is optional structured information defined by the specific error.
- Stack traces, SQL errors, upstream response bodies, and secrets never cross
  the API boundary.

Common status mapping:

| HTTP status | Meaning                                                |
| ----------- | ------------------------------------------------------ |
| 400         | Malformed request or failed validation                 |
| 401         | Missing or invalid authentication                      |
| 403         | Authenticated but not permitted                        |
| 404         | Resource absent within the authenticated household     |
| 409         | Version, idempotency, or state conflict                |
| 422         | Structurally valid request that violates a domain rule |
| 429         | Bounded rate or usage limit reached                    |
| 500         | Unexpected internal failure                            |
| 503         | Temporary dependency wake-up or availability failure   |

## Mutations and retries

- Retriable create/generate operations accept an idempotency key.
- Mutable aggregate responses include a monotonically increasing `version`.
- Updates include the last observed version; a mismatch returns `409` without
  partially applying changes.
- Scheduled work uses a natural uniqueness key, such as household plus week
  start, in addition to an invocation idempotency key.
- Mutations are transactional at the domain aggregate boundary.

## Lists

- Small bounded child collections may be returned inline.
- Potentially unbounded top-level lists use opaque cursor pagination.
- Sorting is explicit and stable, with the resource identifier as a final
  tie-breaker.
- Filtering values are validated and unknown filters are rejected rather than
  ignored.

Detailed endpoint schemas are introduced with their owning product slice. This
document defines shared behaviour, not permission to invent endpoints ahead of
requirements.
