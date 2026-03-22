# Simple API templates

**Base:** `http://localhost:3001` (change in production)

**Rule:** File uploads use **`multipart/form-data`** with the file in a field named **`image`**.

---

## POST — start session (first screenshot)

```http
POST /api/sessions
Content-Type: multipart/form-data
```

**Fields:** `image` (file), optional `studentId`, `classId`

```js
const fd = new FormData();
fd.append("image", file);

fetch("http://localhost:3001/api/sessions", { method: "POST", body: fd })
  .then((r) => r.json())
  .then((data) => {
    // use data.sessionId for all later calls
  });
```

---

## POST — another screenshot (same student / same problem)

```http
POST /api/sessions/{sessionId}/screenshots
Content-Type: multipart/form-data
```

**Fields:** `image` (file)  
**Replace** `{sessionId}` with the id from the first POST.

```js
const fd = new FormData();
fd.append("image", file);

fetch(`http://localhost:3001/api/sessions/${sessionId}/screenshots`, {
  method: "POST",
  body: fd,
})
  .then((r) => r.json())
  .then((data) => {
    // data.progressPercent, data.reason, data.category, ...
  });
```

---

## GET — full session (optional)

```http
GET /api/sessions/{sessionId}
```

```js
fetch(`http://localhost:3001/api/sessions/${sessionId}`).then((r) => r.json());
```

---

## GET — list evaluations only (optional)

```http
GET /api/sessions/{sessionId}/evaluations
```

```js
fetch(
  `http://localhost:3001/api/sessions/${sessionId}/evaluations`,
).then((r) => r.json());
```

---

## POST — health check (optional)

```http
POST /health
```

```js
fetch("http://localhost:3001/health", { method: "POST" }).then((r) => r.json());
```
