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
  "latestScore": null,
  "latestHint": null,
  "latestMisconception": null,
  "latestStepId": null,
  "evaluations": [
    {
      "id": "uuid",
      "sessionId": "uuid",
      "screenshotPath": "absolute or relative path on server",
      "timestamp": "ISO-8601",
      "evaluationResult": {
        "currentStepId": "string | null",
        "workSummary": "string",
        "subscores": {
          "correctness": 0,
          "progress": 0,
          "alignment": 0,
          "confidence": 0
        },
        "score": 0,
        "isStuck": false,
        "misconception": "string | null",
        "hint": "string"
      }
    }
  ]
}
```

**Status semantics (MVP)**

- `stuck` — last evaluation had `isStuck: true`.
- `complete` — last evaluation had `score >= 10` (heuristic “fully correct”).
- `active` — otherwise.

---

## `POST /api/sessions/:sessionId/screenshots`

**Content-Type:** `multipart/form-data`

| Part | Required | Description |
|------|----------|-------------|
| `image` | yes | student work photo |

**Response 200**

```json
{
  "score": 7,
  "hint": "string",
  "isStuck": false,
  "misconception": null,
  "currentStepId": "s2",
  "workSummary": "string"
}
```

**Score rubric (0–10 integers)**

- 0–2 off track  
- 3–4 major issues  
- 5–6 partially correct  
- 7–8 mostly on track  
- 9–10 very on track  

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
- **404** — unknown session.  
- **502** — Gemini or schema validation failure (`details` may contain zod flatten data).  
