import type { FastifyPluginAsync } from "fastify"
import type { SessionStore } from "../services/session/sessionStore.js"
import type { GhostStudentService } from "../services/demo/ghostStudents.js"

export interface DemoRoutesDeps {
  store: SessionStore
  ghostService: GhostStudentService
}

const FLAGGED_CATEGORIES = new Set(["wrong-approach", "stuck", "off-topic", "calc-error"])

export const demoRoutes: FastifyPluginAsync<DemoRoutesDeps> = async (app, opts) => {
  app.get("/students", async (_request, reply) => {
    const ghostStudents = opts.ghostService.getAll().map((g) => ({
      id: g.id,
      name: g.name,
      status: g.status,
      progressPercent: g.progressPercent,
      flagReason: g.flagReason,
      flagCategory: g.flagCategory,
      confusionHighlights: g.confusionHighlights,
      lastCheckedAt: g.lastCheckedAt.toISOString(),
      thumbnailUrl: null,
    }))

    const realSessions = opts.store.listAllSessions().map((session) => {
      const isFlagged =
        session.latestCategory !== null &&
        FLAGGED_CATEGORIES.has(session.latestCategory) &&
        session.latestProgressPercent !== null

      return {
        id: session.id,
        name: session.studentId ?? `Student-${session.id.slice(0, 6)}`,
        status: (isFlagged ? "flagged" : "ok") as "ok" | "flagged",
        progressPercent: session.latestProgressPercent ?? 0,
        flagReason: isFlagged ? session.latestReason : null,
        flagCategory: isFlagged ? session.latestCategory : null,
        confusionHighlights: session.latestConfusionHighlights ?? [],
        lastCheckedAt: session.updatedAt.toISOString(),
        thumbnailUrl: null,
      }
    })

    return reply.send({
      classId: "demo-live",
      problemSetTitle: "Solve: 3x - 5 = 16",
      updatedAt: new Date().toISOString(),
      students: [...ghostStudents, ...realSessions],
    })
  })
}
