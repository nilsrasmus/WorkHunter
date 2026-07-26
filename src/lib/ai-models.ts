import { invoke } from "@tauri-apps/api/core";

export interface AiModelOption {
  id: string;
  label: string;
}

export async function listAiModels(
  profileId: number,
  provider: "gemini" | "anthropic",
): Promise<AiModelOption[]> {
  return invoke<AiModelOption[]>("ai_list_models", {
    profileId,
    provider,
  });
}

export function pickDefaultModel(
  models: AiModelOption[],
  current: string,
): string {
  if (current && models.some((m) => m.id === current)) return current;
  return models[0]?.id ?? current;
}
