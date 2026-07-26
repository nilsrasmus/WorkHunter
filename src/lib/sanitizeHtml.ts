import DOMPurify from "isomorphic-dompurify";

const EDITOR_TAGS = [
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
];

const EDITOR_ATTR = [
  "align",
  "class",
  "colspan",
  "data-wh-slot",
  "href",
  "rowspan",
  "style",
  "target",
  "rel",
];

/** Sanitize HTML for the rich document editor / stored documents. */
export function sanitizeDocumentHtml(html: string): string {
  const clean = DOMPurify.sanitize(html || "<p></p>", {
    ALLOWED_TAGS: EDITOR_TAGS,
    ALLOWED_ATTR: EDITOR_ATTR,
    ADD_ATTR: ["data-wh-slot"],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
  return clean.trim() || "<p></p>";
}
