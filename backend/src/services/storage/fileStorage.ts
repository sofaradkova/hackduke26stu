import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

export function assertImageMime(mime: string): void {
  const normalized = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!ALLOWED_MIME.has(normalized)) {
    const err = new Error(
      `Invalid image type: ${mime}. Allowed: ${[...ALLOWED_MIME].join(", ")}`,
    );
    (err as NodeJS.ErrnoException).code = "INVALID_IMAGE";
    throw err;
  }
}

export function extensionForMime(mime: string): string {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  switch (base) {
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return "bin";
  }
}

/**
 * Persists an uploaded buffer under `{storageDir}/{sessionId}/{filename}`.
 * Creates directories as needed.
 */
export async function saveSessionFile(
  storageDir: string,
  sessionId: string,
  filename: string,
  data: Buffer,
): Promise<string> {
  const dir = path.join(storageDir, sessionId);
  await mkdir(dir, { recursive: true });
  const full = path.join(dir, filename);
  await writeFile(full, data);
  return full;
}
