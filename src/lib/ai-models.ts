export interface AiModelOption {
  id: string;
  label: string;
}

function normalizeGeminiModelId(name: string): string {
  return name.startsWith("models/") ? name.slice("models/".length) : name;
}

export async function listGeminiModels(apiKey: string): Promise<AiModelOption[]> {
  const trimmed = apiKey.trim();
  if (!trimmed) return [];

  const models: AiModelOption[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
    url.searchParams.set("key", trimmed);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini models API error (${res.status}): ${err}`);
    }

    const data = (await res.json()) as {
      models?: {
        name: string;
        displayName?: string;
        supportedGenerationMethods?: string[];
      }[];
      nextPageToken?: string;
    };

    for (const model of data.models ?? []) {
      const id = normalizeGeminiModelId(model.name);
      if (!id.startsWith("gemini")) continue;
      if (!model.supportedGenerationMethods?.includes("generateContent")) continue;
      models.push({
        id,
        label: model.displayName?.trim() || id,
      });
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return models.sort((a, b) => a.label.localeCompare(b.label));
}

export async function listAnthropicModels(apiKey: string): Promise<AiModelOption[]> {
  const trimmed = apiKey.trim();
  if (!trimmed) return [];

  const models: AiModelOption[] = [];
  let afterId: string | undefined;

  do {
    const url = new URL("https://api.anthropic.com/v1/models");
    url.searchParams.set("limit", "100");
    if (afterId) url.searchParams.set("after_id", afterId);

    const res = await fetch(url, {
      headers: {
        "x-api-key": trimmed,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic models API error (${res.status}): ${err}`);
    }

    const data = (await res.json()) as {
      data?: { id: string; display_name?: string }[];
      has_more?: boolean;
      last_id?: string;
    };

    for (const model of data.data ?? []) {
      models.push({
        id: model.id,
        label: model.display_name?.trim() || model.id,
      });
    }

    afterId = data.has_more ? data.last_id : undefined;
  } while (afterId);

  return models;
}

export function pickDefaultModel(
  models: AiModelOption[],
  current: string,
): string {
  if (current && models.some((m) => m.id === current)) return current;
  return models[0]?.id ?? current;
}
