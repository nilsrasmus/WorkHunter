import { ensureSlotIds } from "./contentSlots";

export type DocumentTemplateId = "modern-resume" | "clean-letter" | "minimal-resume";

export interface DocumentTemplate {
  id: DocumentTemplateId;
  labelKey: string;
  docType: "resume" | "letter";
  html: string;
}

const modernResume = ensureSlotIds(`
<div style="border-bottom: 2px solid var(--accent, #1B6E4C); padding-bottom: 12px; margin-bottom: 16px;">
  <h1 data-wh-slot="name" style="color: var(--accent, #1B6E4C); font-family: Georgia, serif; margin: 0;">Your Name</h1>
  <p data-wh-slot="title" style="color: #596570; margin: 4px 0 0;">Professional title</p>
</div>
<h2 style="color: var(--accent, #1B6E4C); font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase;">Summary</h2>
<p data-wh-slot="summary">Brief professional summary tailored to your target roles.</p>
<h2 style="color: var(--accent, #1B6E4C); font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase;">Experience</h2>
<div data-wh-slot="experience-1">
  <p><strong>Company Name</strong> · Role · 2020–2024</p>
  <p>Describe your impact and responsibilities.</p>
</div>
<h2 style="color: var(--accent, #1B6E4C); font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase;">Skills</h2>
<p data-wh-slot="skills">List your most relevant skills.</p>
`);

const cleanLetter = ensureSlotIds(`
<p data-wh-slot="date" style="text-align: right; color: #596570;">2026-01-01</p>
<p data-wh-slot="salutation">Dear Hiring Manager,</p>
<p data-wh-slot="opening">I am writing to express my interest in the role.</p>
<p data-wh-slot="body">Explain why you are a strong match for this position.</p>
<p data-wh-slot="closing">Thank you for your consideration.</p>
<p data-wh-slot="signoff">Kind regards,<br>Your Name</p>
`);

const minimalResume = ensureSlotIds(`
<h1 data-wh-slot="name">Your Name</h1>
<p data-wh-slot="contact">City · email@example.com · +46 70 000 00 00</p>
<hr />
<p data-wh-slot="summary">Concise summary of your professional profile.</p>
<div data-wh-slot="experience-1">
  <p><strong>Most recent role</strong></p>
  <p>Key achievements and responsibilities.</p>
</div>
<p data-wh-slot="skills">Skills and tools relevant to the role.</p>
`);

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  { id: "modern-resume", labelKey: "templates.modernResume", docType: "resume", html: modernResume },
  { id: "clean-letter", labelKey: "templates.cleanLetter", docType: "letter", html: cleanLetter },
  { id: "minimal-resume", labelKey: "templates.minimalResume", docType: "resume", html: minimalResume },
];

export function getTemplate(id: DocumentTemplateId): DocumentTemplate | undefined {
  return DOCUMENT_TEMPLATES.find((t) => t.id === id);
}

export function templatesForDocType(docType: "resume" | "letter"): DocumentTemplate[] {
  return DOCUMENT_TEMPLATES.filter((t) => t.docType === docType);
}
