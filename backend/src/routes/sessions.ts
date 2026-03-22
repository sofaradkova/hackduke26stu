import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import {
  createSessionResponseSchema,
  screenshotEvalResponseSchema,
} from "../schemas/api.js";
import type { SessionStore } from "../services/session/sessionStore.js";
import type { ProblemSolverService } from "../services/ai/problemSolver.js";
import type { ProgressEvaluatorService } from "../services/ai/progressEvaluator.js";
import {
  assertImageMime,
  extensionForMime,
  saveSessionFile,
} from "../services/storage/fileStorage.js";
import { AiValidationError } from "../lib/aiErrors.js";

export interface SessionRoutesDeps {
  store: SessionStore;
  storageDir: string;
  problemSolver: ProblemSolverService;
  progressEvaluator: ProgressEvaluatorService;
}

async function collectMultipart(
  parts: AsyncIterable<unknown>,
): Promise<{ image: Buffer; mime: string; fields: Record<string, string> }> {
  let image: Buffer | undefined;
  let mime = "";
  const fields: Record<string, string> = {};

  for await (const raw of parts) {
    const part = raw as {
      type: "file" | "field";
      fieldname: string;
      mimetype?: string;
      toBuffer?: () => Promise<Buffer>;
      value?: unknown;
    };
    if (part.type === "file" && part.fieldname === "image") {
      if (!part.toBuffer) {
        throw new Error("Multipart file part missing toBuffer");
      }
      image = await part.toBuffer();
      mime = part.mimetype ?? "application/octet-stream";
    } else if (part.type === "field") {
      fields[part.fieldname] =
        typeof part.value === "string" ? part.value : String(part.value ?? "");
    }
  }

  if (!image?.length) {
    const err = new Error('Missing multipart file field "image"');
    (err as NodeJS.ErrnoException).code = "MISSING_IMAGE";
    throw err;
  }
  assertImageMime(mime);
  return { image, mime, fields };
}

function sessionToDetail(sessionId: string, store: SessionStore) {
  const session = store.getSession(sessionId);
  if (!session) return null;
  const evaluations = store.listEvaluations(sessionId).map((e) => ({
    id: e.id,
    sessionId: e.sessionId,
    screenshotPath: e.screenshotPath,
    timestamp: e.timestamp.toISOString(),
    evaluationResult: e.evaluationResult,
  }));

  return {
    id: session.id,
    studentId: session.studentId,
    classId: session.classId,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    status: session.status,
    sourceOfTruth: session.sourceOfTruth,
    latestProgressPercent: session.latestProgressPercent,
    latestReason: session.latestReason,
    latestCategory: session.latestCategory,
    latestConfidenceScore: session.latestConfidenceScore,
    latestConfusionHighlights: session.latestConfusionHighlights,
    evaluations,
  };
}

export const sessionRoutes: FastifyPluginAsync<SessionRoutesDeps> = async (
  app,
  opts,
) => {
  const { store, storageDir, problemSolver, progressEvaluator } = opts;

  app.post("/", async (request, reply) => {
    let image: Buffer;
    let mime: string;
    let fields: Record<string, string>;
    try {
      const collected = await collectMultipart(request.parts());
      image = collected.image;
      mime = collected.mime;
      fields = collected.fields;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "INVALID_IMAGE" || code === "MISSING_IMAGE") {
        return reply.status(400).send({ error: (e as Error).message });
      }
      throw e;
    }

    const studentId = fields.studentId?.trim() || null;
    const classId = fields.classId?.trim() || null;

    let sourceOfTruth;
    try {
      sourceOfTruth = await problemSolver.solveFromImage({
        buffer: image,
        mimeType: mime,
      });
    } catch (e) {
      if (e instanceof AiValidationError) {
        request.log.error(e.zodError ?? e);
        return reply.status(502).send({
          error: "AI solver returned invalid JSON",
          details: e.zodError?.flatten(),
        });
      }
      request.log.error(e);
      return reply.status(502).send({ error: "AI solver failed" });
    }

    const sessionId = randomUUID();
    const ext = extensionForMime(mime);
    const filename = `initial-${randomUUID()}.${ext}`;
    let pathSaved: string;
    try {
      pathSaved = await saveSessionFile(storageDir, sessionId, filename, image);
    } catch (e) {
      request.log.error(e);
      return reply.status(500).send({ error: "Failed to save upload" });
    }

    const session = store.createSession({
      id: sessionId,
      studentId,
      classId,
      initialScreenshotPath: pathSaved,
      sourceOfTruth,
    });

    const body = {
      sessionId: session.id,
      sourceOfTruth: session.sourceOfTruth,
      status: session.status,
    };
    createSessionResponseSchema.parse(body);
    return reply.status(201).send(body);
  });

  app.post("/:sessionId/screenshots", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = store.getSession(sessionId);
    if (!session) {
      return reply.status(404).send({ error: "Session not found" });
    }

    let image: Buffer;
    let mime: string;
    try {
      const collected = await collectMultipart(request.parts());
      image = collected.image;
      mime = collected.mime;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "INVALID_IMAGE" || code === "MISSING_IMAGE") {
        return reply.status(400).send({ error: (e as Error).message });
      }
      throw e;
    }

    const ext = extensionForMime(mime);
    const filename = `progress-${Date.now()}-${randomUUID()}.${ext}`;
    let pathSaved: string;
    try {
      pathSaved = await saveSessionFile(storageDir, sessionId, filename, image);
    } catch (e) {
      request.log.error(e);
      return reply.status(500).send({ error: "Failed to save upload" });
    }

    const previous = store.getPreviousEvaluation(sessionId)?.evaluationResult;
    const evaluationIndex = store.evaluationCount(sessionId);

    let evaluationResult;
    try {
      evaluationResult = await progressEvaluator.evaluate({
        image: { buffer: image, mimeType: mime },
        sourceOfTruth: session.sourceOfTruth,
        previousEvaluation: previous,
        evaluationIndex,
      });
    } catch (e) {
      if (e instanceof AiValidationError) {
        request.log.error(e.zodError ?? e);
        return reply.status(502).send({
          error: "AI evaluator returned invalid JSON",
          details: e.zodError?.flatten(),
        });
      }
      request.log.error(e);
      return reply.status(502).send({ error: "AI evaluator failed" });
    }

    store.appendEvaluation({
      sessionId,
      screenshotPath: pathSaved,
      evaluationResult,
    });

    const body = screenshotEvalResponseSchema.parse(evaluationResult);
    return reply.send(body);
  });

  app.get("/:sessionId/evaluations", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    if (!store.getSession(sessionId)) {
      return reply.status(404).send({ error: "Session not found" });
    }
    const list = store.listEvaluations(sessionId).map((e) => ({
      id: e.id,
      sessionId: e.sessionId,
      screenshotPath: e.screenshotPath,
      timestamp: e.timestamp.toISOString(),
      evaluationResult: e.evaluationResult,
    }));
    return reply.send(list);
  });

  app.get("/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const detail = sessionToDetail(sessionId, store);
    if (!detail) {
      return reply.status(404).send({ error: "Session not found" });
    }
    return reply.send(detail);
  });
};
