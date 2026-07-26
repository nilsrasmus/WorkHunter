import { invoke } from "@tauri-apps/api/core";
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

interface AiGenerateRequest {
  settings: ProfileSettings;
  profileId: number;
  /** Instructions / rules — sent as system prompt. */
  systemPrompt: string;
  /** Job data and documents — sent as user message only. */
  userPrompt: string;
  /** When true: Gemini sets responseMimeType to application/json. */
  responseJson?: boolean;
  /** Optional page screenshots for vision-based document reconstruction. */
  images?: VisionImage[];
  /** Cap for long HTML redesign responses (Gemini maxOutputTokens / Anthropic max_tokens). */
  maxOutputTokens?: number;
}

export interface VisionImage {
  mimeType: string;
  base64: string;
}

function getProvider(settings: ProfileSettings): AiProvider {
  return settings.ai_provider === "anthropic" ? "anthropic" : "gemini";
}

export function hasAiApiKey(settings: ProfileSettings): boolean {
  if (getProvider(settings) === "anthropic") {
    return settings.anthropic_api_key_set;
  }
  return settings.gemini_api_key_set;
}

export function getAiProviderLabel(settings: ProfileSettings): string {
  return getProvider(settings) === "anthropic" ? "Anthropic" : "Gemini";
}

async function generateText(request: AiGenerateRequest): Promise<string> {
  const provider = getProvider(request.settings);
  if (!hasAiApiKey(request.settings)) {
    throw new Error(
      `${getAiProviderLabel(request.settings)} API key not configured. Open Settings to add it.`,
    );
  }
  const model =
    provider === "anthropic"
      ? request.settings.anthropic_model
      : request.settings.gemini_model;
  const result = await invoke<{ text: string }>("ai_generate", {
    req: {
      profile_id: request.profileId,
      provider,
      model,
      system_prompt: request.systemPrompt,
      user_prompt: request.userPrompt,
      response_json: request.responseJson ?? false,
      images: (request.images ?? []).map((img) => ({
        mime_type: img.mimeType,
        base64: img.base64,
      })),
      max_output_tokens: request.maxOutputTokens ?? null,
    },
  });
  return result.text.trim();
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
  profileId: number,
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
    profileId,
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
  profileId: number,
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
    profileId,
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

const DOCUMENT_HTML_SYSTEM = `You are an expert resume/CV designer who converts scanned document images into
richly styled HTML for a TipTap rich-text editor and Chromium print-to-PDF.

PROCESS
1. Study the image(s) for: overall layout (single column vs. two-column/sidebar),
   font choices, heading sizes/weights, use of color, spacing between sections,
   alignment patterns (e.g. title left / date right), dividers or borders.
   - Note any text rendered in a color other than black/dark gray — a colored
     name, colored section headings, accent-colored labels, links, etc. Identify
     the approximate color (e.g. navy blue, burgundy, teal) for each.
2. Reproduce that specific design as closely as possible. Do not default to a
   generic plain layout if the source has clear formatting — match it.

OUTPUT RULES
- Return ONLY the HTML fragment. No <html>/<head>/<body>, no markdown, no
  code fences, no commentary before or after.
- Preserve all factual text exactly: names, dates, employers, titles, contact
  info, bullet wording.
- Use inline styles for every visual property: font-family, font-size (pt),
  font-weight, color, margin, padding, border, text-align.
- Layout tools are all allowed and often required — use flexbox freely for
  row alignment (e.g. job title left / date range right), and simple block
  divs for sections. Grid and position:absolute are the only things to avoid,
  since they're the least reliable across TipTap + print-to-PDF.
- Web-safe fonts (Georgia, Arial, "Times New Roman", system-ui) unless the
  image clearly shows a distinct typeface.
- White page background. Default body text is dark gray/black, but reproduce
  any colored text exactly as it appears in the source — colored name/header,
  colored section headings, accent-colored labels or links — using your best
  approximation of that color as a hex value. Do not flatten colored elements
  to black. Ignore uppercase/capitalization styling entirely; convert
  ALL-CAPS text to normal sentence case regardless of how it appears in the
  source.
- No scripts, iframes, external stylesheets, or images.

DEFAULT STYLE SPEC (use unless the image clearly shows something different)
- Name: 22–26pt, bold.
- Section headings: 11–13pt, bold, often with a bottom border.
- Body text: 10–11pt, line-height ~1.4.
- Job/education entries: a flex row with title+company bold on the left and
  the date range smaller/lighter on the right, bullets below in a normal
  <ul>.

EXAMPLE OF THE FIDELITY EXPECTED
If the source shows:
  Senior Developer — Acme Corp                    Jan 2020 – Present
  • Led a team of 5 engineers...

Produce something like:
<div style="margin-bottom:14px">
  <div style="display:flex;justify-content:space-between;align-items:baseline">
    <span style="font-size:11pt;font-weight:700">Senior Developer, Acme Corp</span>
    <span style="font-size:9pt;color:#555555">Jan 2020 – Present</span>
  </div>
  <ul style="margin:4px 0 0 18px;padding:0">
    <li style="font-size:10pt;margin-bottom:2px">Led a team of 5 engineers...</li>
  </ul>
</div>

NOT a bare <p>Senior Developer, Acme Corp — Jan 2020 – Present</p> with no
styling — that loses the alignment and hierarchy the source document has.`;

const DOCUMENT_SLOT_SYSTEM = `Add a data-wh-slot="descriptive-id" attribute to every element containing
editable resume content (name, title, summary, exp-1, exp-1-bullets, skills,
etc.). Leave purely decorative elements (dividers, spacers, icons) without
one. Return the full HTML with attributes added, structure and styling
otherwise unchanged.`;

function stripAiHtmlWrapper(text: string): string {
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();
  cleaned = cleaned.replace(/^<html[^>]*>/i, "").replace(/<\/html>$/i, "");
  cleaned = cleaned.replace(/^<body[^>]*>/i, "").replace(/<\/body>$/i, "");
  return cleaned.trim();
}

/** Second pass: add data-wh-slot attributes (text-only, no images). */
async function tagDocumentHtmlSlots(
  profileId: number,
  settings: ProfileSettings,
  html: string,
): Promise<string> {
  try {
    const raw = await generateText({
      settings,
      profileId,
      systemPrompt: DOCUMENT_SLOT_SYSTEM,
      userPrompt: html,
      maxOutputTokens: 16384,
    });
    const tagged = stripAiHtmlWrapper(raw);
    if (!tagged.replace(/<[^>]+>/g, "").trim()) {
      return ensureSlotIds(html);
    }
    return ensureSlotIds(tagged);
  } catch (e) {
    console.warn("AI slot tagging failed; using ensureSlotIds fallback", e);
    return ensureSlotIds(html);
  }
}

/** Rebuild a designed HTML document from PDF page screenshots via vision AI. */
export async function reconstructDocumentHtmlFromImages(
  profileId: number,
  settings: ProfileSettings,
  images: VisionImage[],
  docType: "resume" | "letter" = "resume",
): Promise<string> {
  if (images.length === 0) {
    throw new Error("No page images to reconstruct");
  }
  const kind = docType === "letter" ? "cover letter / personal letter" : "resume / CV";
  const raw = await generateText({
    settings,
    profileId,
    systemPrompt: DOCUMENT_HTML_SYSTEM,
    userPrompt: `These screenshot(s) show my ${kind} (page order is top to bottom).`,
    images,
    maxOutputTokens: 16384,
  });
  const html = stripAiHtmlWrapper(raw);
  if (!html.replace(/<[^>]+>/g, "").trim()) {
    throw new Error("AI returned empty document HTML");
  }
  return tagDocumentHtmlSlots(profileId, settings, html);
}

/** Restyle an already-extracted HTML document into a polished application layout. */
export async function polishDocumentHtml(
  profileId: number,
  settings: ProfileSettings,
  html: string,
  docType: "resume" | "letter" = "resume",
): Promise<string> {
  const kind = docType === "letter" ? "cover letter / personal letter" : "resume / CV";
  const raw = await generateText({
    settings,
    profileId,
    systemPrompt: DOCUMENT_HTML_SYSTEM,
    userPrompt: `Here is a rough HTML ${kind} imported from a file.

SOURCE HTML:
${html}`,
    maxOutputTokens: 16384,
  });
  const polished = stripAiHtmlWrapper(raw);
  if (!polished.replace(/<[^>]+>/g, "").trim()) {
    throw new Error("AI returned empty polished HTML");
  }
  return tagDocumentHtmlSlots(profileId, settings, polished);
}

/** Kept for SettingsPanel call sites; AI keys now live in the Rust keyring. */
export function clearGeminiPromptCache(): void {
  /* no-op: provider HTTP no longer runs in the renderer */
}
