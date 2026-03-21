/**
 * HackDuke AI backend (Fastify). In dev, Vite proxies /api and /health to the backend.
 * Set VITE_API_URL in production (e.g. https://api.example.com) — no trailing slash.
 */
export function getApiBase() {
  const raw = import.meta.env.VITE_API_URL;
  if (raw === undefined || raw === "") return "";
  return String(raw).replace(/\/$/, "");
}

export async function createAiSession(imageBlob, studentId, classId) {
  const fd = new FormData();
  fd.append("image", imageBlob, "frame.jpg");
  fd.append("studentId", studentId);
  fd.append("classId", classId);
  const base = getApiBase();
  const res = await fetch(`${base}/api/sessions`, { method: "POST", body: fd });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function postAiScreenshot(sessionId, imageBlob) {
  const fd = new FormData();
  fd.append("image", imageBlob, "frame.jpg");
  const base = getApiBase();
  const res = await fetch(`${base}/api/sessions/${sessionId}/screenshots`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
  return res.json();
}

/** Full session + embedded evaluations (GET /api/sessions/:sessionId). */
export async function fetchAiSession(sessionId) {
  const base = getApiBase();
  const res = await fetch(`${base}/api/sessions/${sessionId}`);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
  return res.json();
}
