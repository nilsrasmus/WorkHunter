const SLOT_ATTR = "data-wh-slot";

let slotCounter = 0;

function nextSlotId(prefix = "slot"): string {
  slotCounter += 1;
  return `${prefix}-${slotCounter}`;
}

function parseHtml(html: string): Document {
  const parser = new DOMParser();
  return parser.parseFromString(html || "<p></p>", "text/html");
}

function serializeHtml(doc: Document): string {
  return doc.body.innerHTML.trim();
}

/** Assign slot IDs to block-level elements that lack one. */
export function ensureSlotIds(html: string): string {
  const doc = parseHtml(html);
  const blocks = doc.body.querySelectorAll(
    "p, h1, h2, h3, h4, li, blockquote, div[data-wh-slot]",
  );
  blocks.forEach((el, index) => {
    if (!el.hasAttribute(SLOT_ATTR) && el.textContent?.trim()) {
      el.setAttribute(SLOT_ATTR, nextSlotId(`auto-${index + 1}`));
    }
  });
  return serializeHtml(doc);
}

/** Extract plain text for each content slot. */
export function extractContentSlots(html: string): Record<string, string> {
  const doc = parseHtml(html);
  const slots: Record<string, string> = {};
  doc.body.querySelectorAll(`[${SLOT_ATTR}]`).forEach((el) => {
    const id = el.getAttribute(SLOT_ATTR);
    if (!id) return;
    slots[id] = (el.textContent ?? "").trim();
  });
  return slots;
}

function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]+>/g, "").trim();
}

function applyInlineBold(text: string, container: Element) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  container.replaceChildren();
  for (const part of parts) {
    if (!part) continue;
    const boldMatch = part.match(/^\*\*(.+)\*\*$/);
    if (boldMatch) {
      const strong = container.ownerDocument.createElement("strong");
      strong.textContent = boldMatch[1];
      container.appendChild(strong);
    } else {
      container.appendChild(container.ownerDocument.createTextNode(part));
    }
  }
}

/** Replace slot inner content while preserving styled shells. */
export function mergeContentSlots(
  html: string,
  slots: Record<string, string>,
): string {
  const doc = parseHtml(html);
  const existing = extractContentSlots(html);
  const existingKeys = Object.keys(existing).sort();
  const incomingKeys = Object.keys(slots).sort();
  if (existingKeys.join("|") !== incomingKeys.join("|")) {
    throw new Error(
      `AI returned mismatched slot keys. Expected [${existingKeys.join(", ")}], got [${incomingKeys.join(", ")}]`,
    );
  }

  for (const [id, text] of Object.entries(slots)) {
    const el = doc.body.querySelector(`[${SLOT_ATTR}="${CSS.escape(id)}"]`);
    if (!el) continue;
    const clean = stripHtmlTags(text);
    const tag = el.tagName.toLowerCase();
    if (tag === "div" || tag === "blockquote") {
      el.replaceChildren();
      const p = doc.createElement("p");
      applyInlineBold(clean, p);
      el.appendChild(p);
    } else {
      applyInlineBold(clean, el);
    }
  }
  return serializeHtml(doc);
}

/** Convert markdown blocks to virtual slots for legacy tailoring. */
export function markdownBlocksToSlots(markdown: string): Record<string, string> {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  const slots: Record<string, string> = {};
  blocks.forEach((block, index) => {
    slots[`md-${index + 1}`] = block.replace(/^#+\s*/, "");
  });
  return slots;
}

export function mergeMarkdownSlots(
  markdown: string,
  slots: Record<string, string>,
): string {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  const keys = blocks.map((_, i) => `md-${i + 1}`);
  return keys.map((key) => slots[key] ?? "").filter(Boolean).join("\n\n");
}

export function slotsToPlainDocument(slots: Record<string, string>): string {
  return Object.entries(slots)
    .map(([, text]) => text.trim())
    .filter(Boolean)
    .join("\n\n");
}

export { SLOT_ATTR };
