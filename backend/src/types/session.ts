import type {
  EvaluationCategory,
  EvaluationResult,
  SourceOfTruth,
} from "../schemas/ai.js";

export type SessionStatus = "active" | "stuck" | "complete";

export interface ProblemSession {
  id: string;
  studentId: string | null;
  studentName: string | null;
  classId: string | null;
  createdAt: Date;
  updatedAt: Date;
  initialScreenshotPath: string;
  sourceOfTruth: SourceOfTruth;
  latestProgressPercent: number | null;
  latestReason: string | null;
  latestCategory: EvaluationCategory | null;
  latestConfidenceScore: number | null;
  latestConfusionHighlights: string[] | null;
  status: SessionStatus;
}

export interface ScreenshotEvaluation {
  id: string;
  sessionId: string;
  screenshotPath: string;
  timestamp: Date;
  evaluationResult: EvaluationResult;
}
