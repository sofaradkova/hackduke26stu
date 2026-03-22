import { readdir } from "node:fs/promises"
import { join } from "node:path"
import type { FastifyPluginAsync } from "fastify"
import type { SessionStore } from "../services/session/sessionStore.js"
import type { GhostStudentService } from "../services/demo/ghostStudents.js"

export interface DemoRoutesDeps {
  store: SessionStore
  ghostService: GhostStudentService
  storageDir: string
}

const FLAGGED_CATEGORIES = new Set(["wrong-approach", "stuck", "off-topic", "calc-error"])

export const demoRoutes: FastifyPluginAsync<DemoRoutesDeps> = async (app, opts) => {
  // Serve latest screenshot for a session
  app.get("/thumbnail/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const dir = join(opts.storageDir, sessionId)
    try {
      const files = await readdir(dir)
      const jpgs = files.filter(f => f.endsWith(".jpg")).sort()
      if (jpgs.length === 0) return reply.status(404).send({ error: "No screenshots" })
      const latest = jpgs[jpgs.length - 1]!
      return reply.type("image/jpeg").sendFile(latest, dir)
    } catch {
      return reply.status(404).send({ error: "Session not found" })
    }
  })

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
        name: session.studentName || session.studentId || `Student-${session.id.slice(0, 6)}`,
        status: (isFlagged ? "flagged" : "ok") as "ok" | "flagged",
        progressPercent: session.latestProgressPercent ?? 0,
        flagReason: isFlagged ? session.latestReason : null,
        flagCategory: isFlagged ? session.latestCategory : null,
        confusionHighlights: session.latestConfusionHighlights ?? [],
        lastCheckedAt: session.updatedAt.toISOString(),
        thumbnailUrl: `/api/demo/thumbnail/${session.id}?t=${Date.now()}`,
      }
    })

    return reply.send({
      classId: "class-demo",
      problemSetTitle: "Solve: 3x - 5 = 16",
      updatedAt: new Date().toISOString(),
      students: [...ghostStudents, ...realSessions],
    })
  })
}
