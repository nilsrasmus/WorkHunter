import type { AiProvider, ProfileSettings } from "../types";

/** Always appended to tailoring requests — cannot be removed via Settings. */
const TAILOR_FACTUAL_GUARDRAILS = `CRITICAL — Factual accuracy (non-negotiable):
- Never invent, add, or change any fact, employer, job title, degree, date, certification, skill, or achievement.
- Never change numbers: years of experience, counts, percentages, team sizes, budgets, or tenure must match the base documents exactly.
- Never inflate, exaggerate, round up, or boast. If the base says 10 years, the output must say 10 years — not 20, not "two decades", not "extensive experience" unless that exact wording appears in the base documents.
- Every quantitative claim must be copied faithfully from the base resume or base personal letter.`;

interface AiGenerateRequest {
  settings: ProfileSettings;
  staticPrompt: string;
  dynamicContent: string;
}

interface GeminiCacheEntry {
  name: string;
  expiresAt: number;
}

const geminiCacheStore = new Map<string, GeminiCacheEntry>();

function normalizeGeminiModelId(model: string): string {
  return model.startsWith("models/") ? model.slice("models/".length) : model;
}

function geminiCacheKey(model: string, staticPrompt: string): string {
  return `${model}::${staticPrompt}`;
}

function getProvider(settings: ProfileSettings): AiProvider {
  return settings.ai_provider === "anthropic" ? "anthropic" : "gemini";
}

export function hasAiApiKey(settings: ProfileSettings): boolean {
  if (getProvider(settings) === "anthropic") {
    return settings.anthropic_api_key.trim().length > 0;
  }
  return settings.gemini_api_key.trim().length > 0;
}

export function getAiProviderLabel(settings: ProfileSettings): string {
  return getProvider(settings) === "anthropic" ? "Anthropic" : "Gemini";
}

function extractGeminiText(data: {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}): string {
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini did not return text content");
  return text.trim();
}

async function getOrCreateGeminiCache(
  apiKey: string,
  model: string,
  staticPrompt: string,
): Promise<string | null> {
  const key = geminiCacheKey(model, staticPrompt);
  const existing = geminiCacheStore.get(key);
  if (existing && existing.expiresAt > Date.now() + 60_000) {
    return existing.name;
  }

  const modelResource = `models/${normalizeGeminiModelId(model)}`;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelResource,
          contents: [{ role: "user", parts: [{ text: staticPrompt }] }],
          ttl: "3600s",
        }),
      },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as { name?: string };
    if (!data.name) return null;

    geminiCacheStore.set(key, {
      name: data.name,
      expiresAt: Date.now() + 50 * 60 * 1000,
    });
    return data.name;
  } catch {
    return null;
  }
}

async function generateWithGemini({
  settings,
  staticPrompt,
  dynamicContent,
}: AiGenerateRequest): Promise<string> {
  const apiKey = settings.gemini_api_key;
  const model = normalizeGeminiModelId(settings.gemini_model);
  const cacheName = await getOrCreateGeminiCache(apiKey, model, staticPrompt);

  if (cacheName) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cachedContent: cacheName,
          contents: [
            { role: "user", parts: [{ text: dynamicContent }] },
          ],
        }),
      },
    );
    if (res.ok) {
      return extractGeminiText(await res.json());
    }
  }

  // Fallback: static-first prompt for implicit caching on Gemini 2.5+
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${staticPrompt}\n\n---\n\n${dynamicContent}` }],
          },
        ],
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${err}`);
  }
  return extractGeminiText(await res.json());
}

async function generateWithAnthropic({
  settings,
  staticPrompt,
  dynamicContent,
}: AiGenerateRequest): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": settings.anthropic_api_key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: settings.anthropic_model,
      max_tokens: 16384,
      system: [
        {
          type: "text",
          text: staticPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: dynamicContent }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${err}`);
  }
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const block = data.content?.find((b) => b.type === "text");
  if (!block?.text) {
    throw new Error("Anthropic did not return text content");
  }
  return block.text.trim();
}

async function generateText(request: AiGenerateRequest): Promise<string> {
  if (getProvider(request.settings) === "anthropic") {
    if (!request.settings.anthropic_api_key.trim()) {
      throw new Error("Anthropic API key not configured. Open Settings to add it.");
    }
    return generateWithAnthropic(request);
  }
  if (!request.settings.gemini_api_key.trim()) {
    throw new Error("Gemini API key not configured. Open Settings to add it.");
  }
  return generateWithGemini(request);
}

interface TailorOptions {
  tailorResume: boolean;
  tailorLetter: boolean;
  resumeFormat?: string;
  letterFormat?: string;
}

function isTextFormat(format: string | undefined): boolean {
  return !format || format === "markdown";
}

/** Include a document in the prompt only if it is being tailored or has text useful as context. */
function includeDocInPrompt(
  tailoring: boolean,
  format: string | undefined,
  content: string,
): boolean {
  if (tailoring) return true;
  if (!isTextFormat(format)) return false;
  return content.trim().length > 0;
}

function buildTailorOutputInstructions(options: Pick<TailorOptions, "tailorResume" | "tailorLetter">): string {
  if (options.tailorResume && options.tailorLetter) {
    return 'Respond with JSON only (no markdown fences): {"resume": "...markdown...", "letter": "...markdown..."}';
  }
  if (options.tailorResume) {
    return 'Respond with JSON only (no markdown fences): {"resume": "...markdown..."}. Do not include a letter.';
  }
  if (options.tailorLetter) {
    return 'Respond with JSON only (no markdown fences): {"letter": "...markdown..."}. Do not include a resume — the resume is a fixed attachment.';
  }
  throw new Error("Nothing to tailor");
}

function parseTailorResponse(
  text: string,
  options: Pick<TailorOptions, "tailorResume" | "tailorLetter">,
  providerLabel: string,
): { resume?: string; letter?: string } {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`${providerLabel} did not return valid JSON`);
  }

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  const resume = typeof parsed.resume === "string"
    ? parsed.resume
    : typeof parsed.cv === "string"
      ? parsed.cv
      : undefined;
  const letter = typeof parsed.letter === "string"
    ? parsed.letter
    : typeof parsed.personal_letter === "string"
      ? parsed.personal_letter
      : typeof parsed.cover_letter === "string"
        ? parsed.cover_letter
        : undefined;

  if (options.tailorResume && !resume?.trim()) {
    throw new Error(`${providerLabel} response missing tailored resume`);
  }
  if (options.tailorLetter && !letter?.trim()) {
    throw new Error(`${providerLabel} response missing tailored letter`);
  }

  return { resume, letter };
}

function buildTailorDynamic(
  roleName: string,
  baseResume: string,
  baseLetter: string,
  adJson: string,
  options: TailorOptions,
): string {
  const includeResume = includeDocInPrompt(
    options.tailorResume,
    options.resumeFormat,
    baseResume,
  );
  const includeLetter = includeDocInPrompt(
    options.tailorLetter,
    options.letterFormat,
    baseLetter,
  );

  const lines: string[] = [];
  if (options.tailorResume && options.tailorLetter) {
    lines.push("Tailor both the resume and personal letter.");
  } else if (options.tailorResume) {
    lines.push("Tailor only the resume.");
    if (!includeLetter) lines.push("The personal letter will be attached unchanged.");
  } else {
    lines.push("Tailor only the personal letter.");
    if (!includeResume) lines.push("The resume will be attached unchanged.");
  }

  lines.push("", `Role name: ${roleName}`);

  if (includeResume) {
    lines.push("", "Base resume:", baseResume);
  }
  if (includeLetter) {
    lines.push("", "Base personal letter:", baseLetter);
  }

  lines.push("", "Job ad (JSON):", adJson);
  return lines.join("\n");
}

function buildEmailDynamic(
  filledTemplate: string,
  adJson: string,
  company: string,
  contactName: string,
  jobTitle: string,
): string {
  return `Use the following inputs for the placeholders in your instructions.

Email template (filled):
${filledTemplate}

Company: ${company}
Contact person: ${contactName || "(not specified)"}
Job title: ${jobTitle}

Job ad context (JSON):
${adJson}`;
}

export function resolveTailorPrompt(
  settings: ProfileSettings,
  rolePrompt: string | null | undefined,
): string {
  const custom = rolePrompt?.trim();
  if (custom) return custom;
  return settings.prompt_tailor_docs;
}

export async function tailorDocuments(
  settings: ProfileSettings,
  roleName: string,
  baseResume: string,
  baseLetter: string,
  adJson: string,
  options: TailorOptions,
  roleTailorPrompt?: string | null,
): Promise<{ resume?: string; letter?: string }> {
  if (!options.tailorResume && !options.tailorLetter) {
    throw new Error("Nothing to tailor");
  }

  const providerLabel = getAiProviderLabel(settings);
  const outputInstructions = buildTailorOutputInstructions(options);
  const tailorPrompt = resolveTailorPrompt(settings, roleTailorPrompt);
  const text = await generateText({
    settings,
    staticPrompt: `${tailorPrompt}\n\n${TAILOR_FACTUAL_GUARDRAILS}\n\n${outputInstructions}`,
    dynamicContent: buildTailorDynamic(roleName, baseResume, baseLetter, adJson, options),
  });

  return parseTailorResponse(text, options, providerLabel);
}

export async function generateEmailBody(
  settings: ProfileSettings,
  adJson: string,
  company: string,
  contactName: string,
  jobTitle: string,
): Promise<string> {
  const contactGreeting = contactName ? ` ${contactName}` : "";
  const filledTemplate = fillTemplate(settings.email_body_template, {
    company,
    contact_name: contactGreeting,
    job_title: jobTitle,
    your_name: settings.your_name,
  });

  return generateText({
    settings,
    staticPrompt: settings.prompt_email_note,
    dynamicContent: buildEmailDynamic(
      filledTemplate,
      adJson,
      company,
      contactName,
      jobTitle,
    ),
  });
}

function fillTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(`{{${key}}}`).join(value);
  }
  return result;
}

export function buildEmailSubject(jobTitle: string, company: string): string {
  return `Ansökan: ${jobTitle}${company ? ` – ${company}` : ""}`;
}

/** Clear in-memory Gemini caches when prompt templates change. */
export function clearGeminiPromptCache(): void {
  geminiCacheStore.clear();
}
