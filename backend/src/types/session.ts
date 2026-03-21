import type { EvaluationResult, SourceOfTruth } from "../schemas/ai.js";

export type SessionStatus = "active" | "stuck" | "complete";

export interface ProblemSession {
  id: string;
  studentId: string | null;
  classId: string | null;
  createdAt: Date;
  updatedAt: Date;
  initialScreenshotPath: string;
  sourceOfTruth: SourceOfTruth;
  latestScore: number | null;
  latestHint: string | null;
  latestMisconception: string | null;
  latestStepId: string | null;
  status: SessionStatus;
}

export interface ScreenshotEvaluation {
  id: string;
  sessionId: string;
  screenshotPath: string;
  timestamp: Date;
  evaluationResult: EvaluationResult;
}
