# API contract

Every endpoint is under `/api`. Except `/health`, all endpoints require the trusted authenticated identity supplied by the hosting gateway. The production API does not accept arbitrary user IDs as authentication.

`X-Workspace: sandbox` selects an owner-scoped sample dataset. Optional `X-Persona` is `alex`, `maya`, `noor`, or `leo`. Omitting sandbox selects the live event. These headers do not select another person's live identity.

Writes require `Content-Type: application/json`. Except the naturally idempotent bootstrap, every write requires `Idempotency-Key` containing 16–100 URL-safe alphanumeric, dash, or underscore characters (UUIDs work). Retry the original request with the same key after an uncertain response. Reusing the key for different content returns 409.

| Method | Route | Body / purpose |
|---|---|---|
| GET | `/health` | Liveness, without identity |
| POST | `/bootstrap` | `{}` initializes the selected workspace |
| GET | `/me` | Current profile and membership |
| PATCH | `/profile` | `{name,bio,skills,utcOffset}` |
| GET | `/stats` | Builder, team, open-team counts and revision |
| GET | `/board` | `q`, `skill`, `open`, `limit` 1–50, opaque `cursor` |
| POST | `/teams` | `{name,pitch,skills,minSize,maxSize}` |
| GET | `/teams/:id` | Team, members; requests only for its leader |
| PATCH | `/teams/:id` | `{lookingFor:boolean}`, leader only |
| POST | `/teams/:id/invites` | `{hours:1..72}`, rotates a leader-only code |
| POST | `/join` | `{code}`, joins atomically if valid and a seat exists |
| POST | `/teams/:id/requests` | `{message}`, asks to join |
| GET | `/requests` | Your requests and status |
| PATCH | `/requests/:id` | `{decision:"accepted"|"declined"}`, leader only |
| POST | `/teams/:id/leave` | `{}`, transfers leadership or deletes empty team |
| DELETE | `/teams/:id/members/:personId` | `{}`, leader only; self uses leave |
| GET | `/teams/:id/suggestions` | Leader-only ranked candidates and explanations |
| GET | `/audit` | Your actions and current team's audit history |
| GET | `/events?after=:revision` | SSE `change` events with revision IDs |

Status semantics: 400 invalid input; 401 unauthenticated; 403 denied; 404 missing/expired resource; 409 invariant or concurrent-state conflict; 413 body too large; 415 wrong content type; 429 persistent rate limit with Retry-After; 500 unexpected failure, retry original key.

Responses expose `X-Request-ID` and `Server-Timing`. Replays include `Idempotency-Replayed: true`. Writes allow 120 attempts per actor/minute; code joins allow 10 per actor/minute and 150 per hashed source IP/minute. The shared-IP allowance supports campus networks while the per-account limit constrains guessing. Stale rate buckets are cleaned in bounded batches.

An invite's expiration is evaluated at request admission. Requests admitted before expiration may commit shortly afterward. Pausing recruitment hides a team from open results and stops new requests; a leader-issued valid code still grants direct admission. Rotating a code invalidates the old one atomically.

Search matches Unicode word prefixes across team name and pitch. Multiple tokens are combined with AND; punctuation is ignored. The API never interpolates the raw query into FTS syntax.
