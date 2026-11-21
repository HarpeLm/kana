/** Fenêtre de contexte connue par famille de modèle ; la première règle qui correspond l'emporte. */
const RULES: Array<[RegExp, number]> = [
  [/\[1m\]|-1m\b|1m-context/i, 1_000_000],
  [/gemini/i, 1_000_000],
  [/gpt-4\.1|gpt-5\.1-codex-max/i, 1_000_000],
  [/gpt-5|codex|o3|o4/i, 400_000],
  [/gpt-4o|gpt-4-turbo/i, 128_000],
  [/deepseek|qwen|kimi|glm|llama|mistral|grok/i, 128_000],
  [/claude|sonnet|opus|haiku/i, 200_000],
];

export const DEFAULT_CONTEXT_WINDOW = 200_000;

/** La fenêtre de contexte d'un modèle d'après son identifiant (200 k si on ne le connaît pas). */
export function contextWindowFor(modelId?: string, agentId?: string): number {
  const key = `${modelId ?? ""} ${agentId === "gemini" ? "gemini" : ""}`;
  for (const [pattern, size] of RULES) if (pattern.test(key)) return size;
  return DEFAULT_CONTEXT_WINDOW;
}
