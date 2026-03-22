import {
  evaluationResultSchema,
  type EvaluationResult,
  type SourceOfTruth,
} from "../../schemas/ai.js";
import { env } from "../../lib/env.js";
import type { OpenAiJsonGenerator } from "./openaiClient.js";
import { mockEvaluationResult } from "./mockAi.js";
import { AiValidationError } from "../../lib/aiErrors.js";

const EVAL_SYSTEM = `You are a math progress checker. You compare a photo of student work to a canonical solution plan. Output ONLY JSON matching the schema. Be conservative: if handwriting is unclear, lower confidenceScore and progressPercent.

Category labels (pick exactly one; do not use "stuck" for mere incorrectness):
- wrong-approach: The student is working on the problem but the method, setup, or strategy is wrong (wrong formula, wrong equation, misread the task, fundamentally misunderstanding how to solve it). Use when the mistake is conceptual or strategic, not a slip in an otherwise valid plan.
- calc-error: The approach or line of reasoning is mostly reasonable, but there is a mistake in execution—arithmetic, algebra, sign error, copying, or a numerical slip.
- stuck: The student is not making forward progress—blank work, repeating the same failed step without new ideas, visibly blocked, or no meaningful new work toward the solution. Do NOT choose stuck when the student is actively writing wrong steps; that is wrong-approach or calc-error.
- off-topic: Work is unrelated to the assigned problem.
- unsure: The image is unreadable, too ambiguous, or you cannot tell what the student is doing.`;

function buildEvaluatorPrompt(
  sourceOfTruth: SourceOfTruth,
  previous: EvaluationResult | undefined,
): string {
  const prev = previous
    ? `\nPrevious evaluation JSON (for continuity):\n${JSON.stringify(previous)}\n`
    : "";

  return `SOURCE_OF_TRUTH (canonical):\n${JSON.stringify(sourceOfTruth)}\n${prev}
Attached: latest student work screenshot.

Return ONLY valid JSON with this exact shape:
{
  "progressPercent": number,
  "reason": "string",
  "category": "wrong-approach" | "stuck" | "off-topic" | "calc-error" | "unsure",
  "confidenceScore": number,
  "confusionHighlights": ["string"]
}

Rules:
- progressPercent: 0-100 (how close the visible work is to finishing correctly on the intended path).
- reason: one short paragraph (2-4 sentences max) explaining the judgment; the reason must match the category (e.g. if you say they used the wrong method, category must be wrong-approach, not stuck).
- category: pick the single best label using the definitions above. If the student is incorrect but still attempting steps, prefer wrong-approach or calc-error over stuck.
- confidenceScore: 0-1 how sure you are given image quality and clarity.
- confusionHighlights: 0-5 short phrases pointing at what is ambiguous or wrong (empty array if none).`;
}

export interface ProgressEvaluatorService {
  evaluate(input: {
    image: { buffer: Buffer; mimeType: string };
    sourceOfTruth: SourceOfTruth;
    previousEvaluation?: EvaluationResult;
    /** Used by mock backend to simulate progression. */
    evaluationIndex: number;
  }): Promise<EvaluationResult>;
}

export function createProgressEvaluatorService(deps: {
  openai: OpenAiJsonGenerator | null;
  useMock: boolean;
}): ProgressEvaluatorService {
  return {
    async evaluate(input): Promise<EvaluationResult> {
      if (deps.useMock || !deps.openai) {
        return mockEvaluationResult(input.evaluationIndex);
      }

      const raw = await deps.openai.generate({
        model: env.openaiModel,
        systemInstruction: EVAL_SYSTEM,
        userPrompt: buildEvaluatorPrompt(
          input.sourceOfTruth,
          input.previousEvaluation,
        ),
        image: input.image,
      });

      const parsed = evaluationResultSchema.safeParse(raw);
      if (!parsed.success) {
        throw new AiValidationError(
          "Evaluator response failed schema validation",
          parsed.error,
        );
      }
      return parsed.data;
    },
  };
}
