import Fastify from "fastify";
import multipart from "@fastify/multipart";
import cors from "@fastify/cors";
import { env, useMockAi } from "./env.js";
import { healthRoutes } from "../routes/health.js";
import { sessionRoutes } from "../routes/sessions.js";
import { demoRoutes } from "../routes/demo.js";
import { SessionStore } from "../services/session/sessionStore.js";
import { GhostStudentService } from "../services/demo/ghostStudents.js";
import { LiveOpenAiJsonGenerator } from "../services/ai/openaiClient.js";
import { createProblemSolverService } from "../services/ai/problemSolver.js";
import { createProgressEvaluatorService } from "../services/ai/progressEvaluator.js";

export async function buildServer() {
  const store = new SessionStore();
  const ghostService = new GhostStudentService();
  const openai =
    useMockAi || !env.openaiApiKey
      ? null
      : new LiveOpenAiJsonGenerator(env.openaiApiKey);

  const problemSolver = createProblemSolverService({
    openai,
    useMock: useMockAi,
  });
  const progressEvaluator = createProgressEvaluatorService({
    openai,
    useMock: useMockAi,
  });

  const app = Fastify({
    logger: true,
  });

  await app.register(cors, { origin: true });

  await app.register(multipart, {
    limits: {
      fileSize: 12 * 1024 * 1024,
    },
  });

  await app.register(healthRoutes);
  await app.register(demoRoutes, {
    prefix: "/api/demo",
    store,
    ghostService,
  });
  await app.register(sessionRoutes, {
    prefix: "/api/sessions",
    store,
    storageDir: env.storageDir,
    problemSolver,
    progressEvaluator,
  });

  app.addHook('onClose', async () => ghostService.destroy())

  app.setErrorHandler((err, request, reply) => {
    request.log.error(err);
    if (reply.sent) return;
    reply.status(500).send({ error: "Internal server error" });
  });

  return app;
}
