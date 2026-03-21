import type { ZodError } from "zod";

export class AiValidationError extends Error {
  constructor(
    message: string,
    public readonly zodError?: ZodError,
  ) {
    super(message);
    this.name = "AiValidationError";
  }
}
