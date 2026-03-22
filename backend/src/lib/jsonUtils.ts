/** Strip ```json fences if the model returns markdown despite JSON mode. */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(trimmed);
  const body = fence ? fence[1]!.trim() : trimmed;
  return JSON.parse(body);
}
