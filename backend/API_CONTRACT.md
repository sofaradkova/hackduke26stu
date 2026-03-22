# API contract (MVP)

Base URL: `http://localhost:3001` (configurable via `PORT`).

All successful AI-backed responses are **JSON** validated with **zod** on the server. Multipart endpoints expect field name **`image`** (file).

---

## `POST /health`

**Response 200**

```json
{
  "ok": true,
  "service": "hackduke-ai-backend"
}
```

---

## `POST /api/sessions`

**Content-Type:** `multipart/form-data`

| Part | Required | Description |
|------|----------|-------------|
| `image` | yes | PNG, JPEG, WebP, or GIF |
| `studentId` | no | opaque string |
| `classId` | no | opaque string |

**Response 201**

```json
{
  "sessionId": "uuid",
  "sourceOfTruth": {
    "problemType": "algebra | geometry | calculus | other",
    "problemText": "string",
    "finalAnswer": "string",
    "steps": [
      {
        "stepId": "string",
        "title": "string",
        "expectedWork": "string",
        "acceptableForms": ["string"],
        "commonErrors": ["string"]
      }
    ],
    "hintPolicy": {
      "maxDirectness": "low | medium | high",
      "doNotRevealFinalAnswerEarly": true
    }
  },
  "status": "active"
}
```

---

## `GET /api/sessions/:sessionId`

**Response 200** — full session state (evaluations embedded).

```json
{
  "id": "uuid",
  "studentId": "string | null",
  "classId": "string | null",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "status": "active | stuck | complete",
  "sourceOfTruth": { },
  "latestProgressPercent": null,
  "latestReason": null,
  "latestCategory": null,
  "latestConfidenceScore": null,
  "latestConfusionHighlights": null,
  "evaluations": [
    {
      "id": "uuid",
      "sessionId": "uuid",
      "screenshotPath": "absolute or relative path on server",
      "timestamp": "ISO-8601",
      "evaluationResult": {
        "progressPercent": 0,
        "reason": "string",
        "category": "wrong-approach | stuck | off-topic | calc-error | unsure",
        "confidenceScore": 0,
        "confusionHighlights": ["string"]
      }
    }
  ]
}
```

**Status semantics (MVP)**

- `stuck` — last evaluation had `category: "stuck"`.
- `complete` — last evaluation had `progressPercent >= 100`.
- `active` — otherwise.

`latest*` fields mirror the most recent screenshot evaluation (all `null` until the first `POST .../screenshots`).

---

## `POST /api/sessions/:sessionId/screenshots`

**Content-Type:** `multipart/form-data`

| Part | Required | Description |
|------|----------|-------------|
| `image` | yes | student work photo |

**Response 200** — same shape as each `evaluationResult` above:

```json
{
  "progressPercent": 72,
  "reason": "string",
  "category": "calc-error",
  "confidenceScore": 0.65,
  "confusionHighlights": ["sign error on line 2", "unclear final answer"]
}
```

---

## `GET /api/sessions/:sessionId/evaluations`

**Response 200** — JSON **array** of evaluation records (same shape as each element of `evaluations` on the session GET).

```json
[
  {
    "id": "uuid",
    "sessionId": "uuid",
    "screenshotPath": "string",
    "timestamp": "ISO-8601",
    "evaluationResult": { }
  }
]
```

---

## Error shape (typical)

```json
{
  "error": "human-readable message",
  "details": {}
}
```

- **400** — bad multipart / invalid image type.
- **404** — unknown `sessionId`.
- **502** — OpenAI failure or JSON that fails zod validation (`details` may contain zod `flatten()` output).
