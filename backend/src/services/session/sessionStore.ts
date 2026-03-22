import { randomUUID } from "node:crypto";
import type { EvaluationResult, SourceOfTruth } from "../../schemas/ai.js";
import type { ProblemSession, ScreenshotEvaluation } from "../../types/session.js";

function deriveStatusFromEvaluation(result: EvaluationResult): ProblemSession["status"] {
  if (result.progressPercent >= 100) return "complete";
  if (result.category === "stuck") return "stuck";
  return "active";
}

export class SessionStore {
  private sessions = new Map<string, ProblemSession>();
  private evaluations = new Map<string, ScreenshotEvaluation[]>();

  createSession(input: {
    /** When set, folder names and API id match the saved upload path. */
    id?: string;
    studentId: string | null;
    classId: string | null;
    initialScreenshotPath: string;
    sourceOfTruth: SourceOfTruth;
  }): ProblemSession {
    const id = input.id ?? randomUUID();
    const now = new Date();
    const session: ProblemSession = {
      id,
      studentId: input.studentId,
      classId: input.classId,
      createdAt: now,
      updatedAt: now,
      initialScreenshotPath: input.initialScreenshotPath,
      sourceOfTruth: input.sourceOfTruth,
      latestProgressPercent: null,
      latestReason: null,
      latestCategory: null,
      latestConfidenceScore: null,
      latestConfusionHighlights: null,
      status: "active",
    };
    this.sessions.set(id, session);
    this.evaluations.set(id, []);
    return session;
  }

  getSession(id: string): ProblemSession | undefined {
    return this.sessions.get(id);
  }

  listEvaluations(sessionId: string): ScreenshotEvaluation[] {
    return [...(this.evaluations.get(sessionId) ?? [])];
  }

  getPreviousEvaluation(sessionId: string): ScreenshotEvaluation | undefined {
    const list = this.evaluations.get(sessionId) ?? [];
    return list[list.length - 1];
  }

  evaluationCount(sessionId: string): number {
    return this.evaluations.get(sessionId)?.length ?? 0;
  }

  listAllSessions(): ProblemSession[] {
    return [...this.sessions.values()];
  }

  appendEvaluation(input: {
    sessionId: string;
    screenshotPath: string;
    evaluationResult: EvaluationResult;
  }): ScreenshotEvaluation {
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    const record: ScreenshotEvaluation = {
      id: randomUUID(),
      sessionId: input.sessionId,
      screenshotPath: input.screenshotPath,
      timestamp: new Date(),
      evaluationResult: input.evaluationResult,
    };
    const list = this.evaluations.get(input.sessionId) ?? [];
    list.push(record);
    this.evaluations.set(input.sessionId, list);

    const ev = input.evaluationResult;
    session.latestProgressPercent = ev.progressPercent;
    session.latestReason = ev.reason;
    session.latestCategory = ev.category;
    session.latestConfidenceScore = ev.confidenceScore;
    session.latestConfusionHighlights = ev.confusionHighlights;
    session.status = deriveStatusFromEvaluation(ev);
    session.updatedAt = new Date();
    this.sessions.set(input.sessionId, session);

    return record;
  }
}
