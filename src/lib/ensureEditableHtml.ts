import { readFile, readTextFile } from "@tauri-apps/plugin-fs";
import { api } from "./api";
import { isBinaryLegacyFormat } from "./files";
import { documentHtmlFromVersion, markdownToHtml } from "./documentUtils";
import { base64ToBytes, bytesToHtml, detectImportKind } from "./importDocument";
import type { RoleDocumentVersion } from "../types";

/** Ensure a role document version is editable HTML (converts legacy binary/markdown in place). */
export async function ensureVersionHtml(
  version: RoleDocumentVersion,
): Promise<{ version: RoleDocumentVersion; html: string }> {
  if (version.format === "html" && version.content_html.trim()) {
    return { version, html: version.content_html };
  }

  if (version.format === "html" || version.format === "markdown") {
    const html = documentHtmlFromVersion(version);
    if (version.format === "markdown" || !version.content_html.trim()) {
      const updated = await api.updateRoleDocumentHtml(version.id, html);
      return { version: updated, html };
    }
    return { version, html };
  }

  if (!isBinaryLegacyFormat(version.format)) {
    throw new Error(`Unsupported document format: ${version.format}`);
  }

  const payload = await api.getRoleDocumentFileBase64(version.id);
  const kind =
    detectImportKind(payload.file_name ?? `file.${version.format}`)
    ?? (version.format === "pdf" ? "pdf" : "docx");
  const html = await bytesToHtml(base64ToBytes(payload.data_base64), kind);
  const updated = await api.convertRoleDocumentToHtml(version.id, html);
  return { version: updated, html };
}

export async function importPathToHtml(filePath: string): Promise<string> {
  const kind = detectImportKind(filePath);
  if (!kind) throw new Error("Unsupported file type");
  if (kind === "markdown" || kind === "txt") {
    return markdownToHtml(await readTextFile(filePath));
  }
  return bytesToHtml(await readFile(filePath), kind);
}
