import type { FastifyPluginAsync } from "fastify";

/** POST /health — lightweight probe for load balancers and teammates. */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/health",
    {
      schema: {
        response: {
          200: {
            type: "object",
            properties: {
              ok: { type: "boolean" },
              service: { type: "string" },
            },
          },
        },
      },
    },
    async () => ({
      ok: true,
      service: "hackduke-ai-backend",
    }),
  );
};
