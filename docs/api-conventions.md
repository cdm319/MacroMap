# API conventions

Status: Phase 3 in progress

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
editable cuisine/protein/flavour tags, and optional per-serving kcal, protein,
carbohydrate, and fat. Responses include nullable `nutritionProvenance` and a
nullable signed `photoUrl`. Provenance distinguishes confirmed manual values,
reviewed Schema.org values, and CoFID estimates with their dataset version,
confidence, converted mass, and selected ingredient matches.

When nutrition is omitted, saving tries the bundled CoFID 2021 dataset using
exact or explicit alias matches. Nutrition-relevant qualifiers such as fresh,
dried, and cooked are not discarded. Direct weights, common household measures,
and a small set of explicit item weights are supported. The response records
every converted or assumed weight; bounded negligible seasonings may be omitted
and are recorded too. A complete estimate is stored with the recipe. Otherwise
nutrition stays absent and the recipe remains unavailable to the future
planner. Confirmed manual or valid imported nutrition is retained. Missing
instructions remain valid for storage, planning, and cooking. The editor and
recipe detail show every unmatched ingredient or unsupported measure when an
estimate cannot be completed.

Recipe edits are whole-document, last-write-wins operations for the single-login
MVP. The Cognito `sub` determines ownership; recipe requests never accept a
household identifier.

Photo operations first verify that the recipe belongs to the authenticated
household. Signed URLs expire after five minutes. The browser uploads directly
to the private bucket, but the staged object is not displayed until the API has
validated its actual bytes. Unfinished staging objects expire after one day.

## Recipe import endpoints

- `POST /v1/recipe-imports/preview` accepts either bounded Schema.org Recipe
  JSON/JSON-LD or an HTTP(S) recipe URL. URL imports fetch the page on the
  server, extract its JSON-LD, and copy only the first usable photo into
  temporary private storage. When a document contains multiple recipes, the
  endpoint returns candidate titles and requires the user to choose one before
  creating a preview.
- A preview may contain incomplete fields and review warnings. It is not a
  recipe and cannot appear in planning or the recipe library.
- `POST /v1/recipe-imports/{importId}/save` accepts the complete, corrected
  recipe. The import UUID becomes the recipe UUID, making retries idempotent.
  Only a preview owned by the authenticated household can be saved.
- The supplied or extracted JSON, extracted draft, warnings, and reviewed
  recipe link are retained. Reusing an import for another recipe returns `409`.

Direct JSON importing performs no network or AI call. Valid supplied nutrition
is retained; otherwise a structurally complete recipe receives the same CoFID
attempt and review warnings before saving. Direct JSON previews identify a
primary photo but do not copy it. URL imports are limited to public IPv4 HTTP(S)
targets on standard ports, five redirects, eight seconds, and 1 MiB. Every
redirect is resolved and checked again. Photos are limited to 5 MiB and JPEG,
PNG, or WebP content whose bytes match its declared type. Imported photos are
published only when the reviewed recipe is saved.
