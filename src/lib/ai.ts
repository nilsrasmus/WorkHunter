import type { AiProvider, ProfileSettings } from "../types";
import {
  extractContentSlots,
  ensureSlotIds,
  markdownBlocksToSlots,
  mergeContentSlots,
  mergeMarkdownSlots,
} from "./contentSlots";
import { markdownToHtml } from "./documentUtils";

/** Always appended to tailoring system prompts — cannot be removed via Settings. */
const TAILOR_FACTUAL_GUARDRAILS = `CRITICAL — Factual accuracy (non-negotiable):
- Never invent, add, or change any fact, employer, job title, degree, date, certification, skill, or achievement.
- Never change numbers: years of experience, counts, percentages, team sizes, budgets, or tenure must match the base documents exactly.
- Never inflate, exaggerate, round up, or boast. If the base says 10 years, the output must say 10 years — not 20, not "two decades", not "extensive experience" unless that exact wording appears in the base documents.
- Every quantitative claim must be copied faithfully from the base resume or base personal letter.`;

/** Balanced creativity vs. factual adherence for generation calls. */
const AI_TEMPERATURE = 0.5;

interface AiGenerateRequest {
  settings: ProfileSettings;
  /** Instructions / rules — sent as system prompt. */
  systemPrompt: string;
  /** Job data and documents — sent as user message only. */
  userPrompt: string;
  /** When true: Gemini sets responseMimeType to application/json. */
  responseJson?: boolean;
}

interface GeminiCacheEntry {
  name: string;
  expiresAt: number;
}

const geminiCacheStore = new Map<string, GeminiCacheEntry>();

function normalizeGeminiModelId(model: string): string {
  return model.startsWith("models/") ? model.slice("models/".length) : model;
}

function geminiCacheKey(model: string, systemPrompt: string): string {
  return `${model}::${systemPrompt}`;
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

function geminiGenerationConfig(responseJson: boolean | undefined) {
  return {
    temperature: AI_TEMPERATURE,
    ...(responseJson ? { responseMimeType: "application/json" as const } : {}),
  };
}

async function getOrCreateGeminiCache(
  apiKey: string,
  model: string,
  systemPrompt: string,
): Promise<string | null> {
  const key = geminiCacheKey(model, systemPrompt);
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
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: "(cached system instructions)" }] }],
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
  systemPrompt,
  userPrompt,
  responseJson,
}: AiGenerateRequest): Promise<string> {
  const apiKey = settings.gemini_api_key;
  const model = normalizeGeminiModelId(settings.gemini_model);
  const generationConfig = geminiGenerationConfig(responseJson);
  const cacheName = await getOrCreateGeminiCache(apiKey, model, systemPrompt);

  if (cacheName) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cachedContent: cacheName,
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig,
        }),
      },
    );
    if (res.ok) {
      return extractGeminiText(await res.json());
    }
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig,
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
  systemPrompt,
  userPrompt,
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
      temperature: AI_TEMPERATURE,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
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

const TAILOR_SLOT_RULES = `CONTENT SLOT RULES (mandatory):
- You receive content slots as plain text keyed by ID.
- Return the exact same keys — do not add, remove, or rename slots.
- Return plain text only inside each slot — no HTML, no markdown headers (#), no code fences.
- Inline emphasis with **bold** is allowed within a slot.
- Do not modify anything outside the slots (you cannot see styling/layout).`;

function buildTailorJsonSchema(
  options: Pick<TailorOptions, "tailorResume" | "tailorLetter">,
): string {
  if (options.tailorResume && options.tailorLetter) {
    return 'Expected JSON shape: {"resume": {"slot-id": "plain text", ...}, "letter": {"slot-id": "plain text", ...}}';
  }
  if (options.tailorResume) {
    return 'Expected JSON shape: {"resume": {"slot-id": "plain text", ...}}. Do not include a letter key.';
  }
  if (options.tailorLetter) {
    return 'Expected JSON shape: {"letter": {"slot-id": "plain text", ...}}. Do not include a resume key — the resume is a fixed attachment.';
  }
  throw new Error("Nothing to tailor");
}

function parseSlotMap(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, slotValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof slotValue === "string") {
      out[key] = slotValue;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseTailorSlotResponse(
  text: string,
  options: Pick<TailorOptions, "tailorResume" | "tailorLetter">,
  providerLabel: string,
): { resume?: Record<string, string>; letter?: Record<string, string> } {
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`${providerLabel} did not return valid JSON`);
  }

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  const resume = parseSlotMap(parsed.resume ?? parsed.cv);
  const letter = parseSlotMap(parsed.letter ?? parsed.personal_letter ?? parsed.cover_letter);

  if (options.tailorResume && !resume) {
    throw new Error(`${providerLabel} response missing tailored resume slots`);
  }
  if (options.tailorLetter && !letter) {
    throw new Error(`${providerLabel} response missing tailored letter slots`);
  }

  return { resume, letter };
}

function buildClaudeJsonOutputRules(
  options: Pick<TailorOptions, "tailorResume" | "tailorLetter">,
): string {
  return `OUTPUT FORMAT (mandatory):
- Respond with a single valid JSON object only.
- Do not include any preamble, explanation, apology, or markdown code fences (no \`\`\`json).
- Do not write phrases like "Here is your JSON:" before the object.
- ${buildTailorJsonSchema(options)}`;
}

function prepareHtmlForTailoring(format: string | undefined, html: string, markdown: string): string {
  if (format === "html") {
    const prepared = html.trim() ? ensureSlotIds(html) : markdownToHtml(markdown);
    return ensureSlotIds(prepared);
  }
  if (markdown.trim()) {
    return markdownToHtml(markdown);
  }
  return ensureSlotIds(html);
}

function buildTailorUserPrompt(
  roleName: string,
  resumeSlots: Record<string, string>,
  letterSlots: Record<string, string>,
  adJson: string,
  options: TailorOptions,
): string {
  const includeResume = options.tailorResume || Object.keys(resumeSlots).length > 0;
  const includeLetter = options.tailorLetter || Object.keys(letterSlots).length > 0;

  const lines: string[] = [
    "Here is the job ad and my base document content slots. Tailor the slot text according to your system instructions and return the JSON.",
    "",
    `Role name: ${roleName}`,
  ];

  if (options.tailorResume && !options.tailorLetter) {
    lines.push("", "Scope: tailor only the resume slots.");
    if (!options.tailorLetter) lines.push("The personal letter will be attached unchanged.");
  } else if (options.tailorLetter && !options.tailorResume) {
    lines.push("", "Scope: tailor only the personal letter slots.");
    if (!options.tailorResume) lines.push("The resume will be attached unchanged.");
  }

  lines.push("", "Job ad (JSON):", adJson);

  if (includeResume && Object.keys(resumeSlots).length > 0) {
    lines.push("", "Base resume slots (JSON):", JSON.stringify(resumeSlots, null, 2));
  }
  if (includeLetter && Object.keys(letterSlots).length > 0) {
    lines.push("", "Base personal letter slots (JSON):", JSON.stringify(letterSlots, null, 2));
  }

  return lines.join("\n");
}

function buildEmailUserPrompt(
  filledTemplate: string,
  adJson: string,
  company: string,
  contactName: string,
  jobTitle: string,
): string {
  return `Here is the email template and job context. Write the email body according to your system instructions.

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
  baseResumeHtml: string,
  baseLetterHtml: string,
  adJson: string,
  options: TailorOptions,
  roleTailorPrompt?: string | null,
  legacy?: { resumeMd?: string; letterMd?: string },
): Promise<{ resumeHtml?: string; letterHtml?: string }> {
  if (!options.tailorResume && !options.tailorLetter) {
    throw new Error("Nothing to tailor");
  }

  const providerLabel = getAiProviderLabel(settings);
  const provider = getProvider(settings);
  const tailorPrompt = resolveTailorPrompt(settings, roleTailorPrompt);

  const resumeShell = prepareHtmlForTailoring(
    options.resumeFormat,
    baseResumeHtml,
    legacy?.resumeMd ?? "",
  );
  const letterShell = prepareHtmlForTailoring(
    options.letterFormat,
    baseLetterHtml,
    legacy?.letterMd ?? "",
  );

  let resumeSlots = extractContentSlots(resumeShell);
  let letterSlots = extractContentSlots(letterShell);

  if (options.tailorResume && Object.keys(resumeSlots).length === 0 && legacy?.resumeMd?.trim()) {
    resumeSlots = markdownBlocksToSlots(legacy.resumeMd);
  }
  if (options.tailorLetter && Object.keys(letterSlots).length === 0 && legacy?.letterMd?.trim()) {
    letterSlots = markdownBlocksToSlots(legacy.letterMd);
  }

  const outputRules = provider === "anthropic"
    ? buildClaudeJsonOutputRules(options)
    : buildTailorJsonSchema(options);

  const text = await generateText({
    settings,
    systemPrompt: `${tailorPrompt}\n\n${TAILOR_FACTUAL_GUARDRAILS}\n\n${TAILOR_SLOT_RULES}\n\n${outputRules}`,
    userPrompt: buildTailorUserPrompt(roleName, resumeSlots, letterSlots, adJson, options),
    responseJson: true,
  });

  const parsed = parseTailorSlotResponse(text, options, providerLabel);

  const result: { resumeHtml?: string; letterHtml?: string } = {};

  if (options.tailorResume && parsed.resume) {
    if (Object.keys(extractContentSlots(resumeShell)).length > 0) {
      result.resumeHtml = mergeContentSlots(resumeShell, parsed.resume);
    } else if (legacy?.resumeMd) {
      const mergedMd = mergeMarkdownSlots(legacy.resumeMd, parsed.resume);
      result.resumeHtml = markdownToHtml(mergedMd);
    } else {
      result.resumeHtml = markdownToHtml(Object.values(parsed.resume).join("\n\n"));
    }
  }

  if (options.tailorLetter && parsed.letter) {
    if (Object.keys(extractContentSlots(letterShell)).length > 0) {
      result.letterHtml = mergeContentSlots(letterShell, parsed.letter);
    } else if (legacy?.letterMd) {
      const mergedMd = mergeMarkdownSlots(legacy.letterMd, parsed.letter);
      result.letterHtml = markdownToHtml(mergedMd);
    } else {
      result.letterHtml = markdownToHtml(Object.values(parsed.letter).join("\n\n"));
    }
  }

  return result;
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
    systemPrompt: settings.prompt_email_note,
    userPrompt: buildEmailUserPrompt(
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
