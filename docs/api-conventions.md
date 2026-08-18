# API conventions

Status: Phase 2 complete

## Phase 1 session endpoint

`GET /v1/session` is the first authenticated endpoint. API Gateway validates
the Cognito token and the handler uses only its `sub` claim to locate the
household. A successful response is strictly validated as:

```json
{
  "household": {
    "displayName": "Chris & Alex",
    "id": "00000000-0000-4000-8000-000000000001",
    "snackReserve": 0.15
  },
  "people": [
    {
      "displayName": "Chris",
      "id": "00000000-0000-4000-8000-000000000101",
      "macroTargets": {
        "carbsGrams": 300,
        "fatGrams": 80,
        "kcal": 2500,
        "proteinGrams": 180
      },
      "slug": "chris"
    }
  ]
}
```

The real household returns both active profiles in display order. Missing JWT
identity returns `401`; a valid but unbound Cognito identity returns `403`; and
a database resume or temporary Data API failure returns `503` with code
`DATABASE_WAKING`. The web app treats that last response as a retryable waking
state.

## Household settings

`PUT /v1/household-settings` replaces the complete planning settings for the
authenticated household. The request contains `snackReserve` as a fraction and
one complete set of daily targets for every active person:

```json
{
  "people": [
    {
      "id": "00000000-0000-4000-8000-000000000101",
      "macroTargets": {
        "carbsGrams": 300,
        "fatGrams": 80,
        "kcal": 2500,
        "proteinGrams": 180
      }
    }
  ],
  "snackReserve": 0.15
}
```

The Cognito `sub` determines the household. Every supplied person identifier
must belong to that household, and every active person must appear exactly
once. The household reserve and all targets are saved in one transaction. A
successful response is the updated session shape above.

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
- Aggregates with realistic concurrent editors use a monotonically increasing
  version and reject stale updates with `409`.
- Household settings are whole-form, last-write-wins in the single-login MVP.
  Add versioning only if concurrent household editing becomes a real need.
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

## Recipe library endpoints

- `GET /v1/recipes` returns active recipe summaries in descending update order.
  An optional opaque `cursor` continues the list.
- `GET /v1/recipes/{recipeId}` returns the complete editable recipe.
- `PUT /v1/recipes/{recipeId}` creates or replaces that recipe as one
  transaction. The client supplies the UUID, so retrying the same request does
  not create a duplicate.
- `DELETE /v1/recipes/{recipeId}` archives the recipe and returns `204`.
- `POST /v1/recipes/{recipeId}/photos` validates the declared JPEG, PNG, or WebP
  type and maximum 5 MiB size, then returns a short-lived staged upload.
- `PUT /v1/recipes/{recipeId}/photos/{uploadId}` verifies the staged object's
  size and file signature, publishes it, and returns its short-lived view URL.
- `DELETE /v1/recipes/{recipeId}/photos` removes the current photo and returns
  `204`.

A recipe document contains its title, description, serving count, ordered
structured ingredients, zero or more ordered instructions, explicit meal types,
editable cuisine/protein/flavour tags, and optional authoritative per-serving
kcal, protein, carbohydrate, and fat. Responses include a nullable signed
`photoUrl`. Missing instructions are valid for storage, planning, and cooking.
Missing nutrition is valid for storage and cooking but marks the recipe as
unavailable to the future planner.

Recipe edits are whole-document, last-write-wins operations for the single-login
MVP. The Cognito `sub` determines ownership; recipe requests never accept a
household identifier.

Photo operations first verify that the recipe belongs to the authenticated
household. Signed URLs expire after five minutes. The browser uploads directly
to the private bucket, but the staged object is not displayed until the API has
validated its actual bytes. Unfinished staging objects expire after one day.
