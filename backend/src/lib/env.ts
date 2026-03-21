import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  STORAGE_DIR: z.string().min(1).default("./uploads"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_SOLVER_MODEL: z.string().min(1).default("gemini-2.0-flash"),
  GEMINI_EVALUATOR_MODEL: z.string().min(1).default("gemini-2.0-flash-lite"),
  USE_MOCK_AI: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const raw = parsed.data;

/** True when mock AI should run: explicit USE_MOCK_AI=true or missing API key. */
export const useMockAi =
  raw.USE_MOCK_AI === true || !raw.GEMINI_API_KEY?.trim();

export const env = {
  port: raw.PORT,
  storageDir: raw.STORAGE_DIR,
  geminiApiKey: raw.GEMINI_API_KEY?.trim() ?? "",
  geminiSolverModel: raw.GEMINI_SOLVER_MODEL,
  geminiEvaluatorModel: raw.GEMINI_EVALUATOR_MODEL,
  useMockAi,
};
