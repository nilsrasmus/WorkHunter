import { useCallback, useEffect, useRef, useState } from "react";
import { confirm, open } from "@tauri-apps/plugin-dialog";
import { readFile, readTextFile } from "@tauri-apps/plugin-fs";
import { RichDocumentEditor } from "./RichDocumentEditor";
import { api } from "../lib/api";
import { canTailorFormat, isBinaryLegacyFormat, isEditableTextFormat, versionDisplayName } from "../lib/files";
import { documentHtmlFromVersion, markdownToHtml } from "../lib/documentUtils";
import {
  base64ToBytes,
  bytesToHtml,
  detectImportKind,
} from "../lib/importDocument";
import { templatesForDocType, type DocumentTemplateId, getTemplate } from "../lib/documentTemplates";
import { useI18n } from "../lib/i18n";
import type { MessageKey } from "../lib/i18n";
import type { RoleDocumentVersion } from "../types";

export type RoleDocTab = "resume" | "letter";

interface Props {
  roleId: number;
  onChanged?: () => void;
}

export function RoleDocumentVersionsPanel({ roleId, onChanged }: Props) {
  const { t } = useI18n();
  const formatLabel = (format: string) => {
    const key = `format.${format}` as MessageKey;
    return t(key);
  };
  const [tab, setTab] = useState<RoleDocTab>("resume");
  const [versions, setVersions] = useState<RoleDocumentVersion[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [newVersionName, setNewVersionName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplateId>("modern-resume");
  const [error, setError] = useState("");
  const convertingRef = useRef<number | null>(null);

  const tabVersions = versions.filter((v) => v.doc_type === tab);
  const selected = tabVersions.find((v) => v.id === selectedId) ?? null;
  const tabTemplates = templatesForDocType(tab);

  const loadVersions = useCallback(async () => {
    const list = await api.listRoleDocumentVersions(roleId);
    setVersions(list);
    const forTab = list.filter((v) => v.doc_type === tab);
    setSelectedId((prev) => {
      if (prev && forTab.some((v) => v.id === prev)) return prev;
      return (forTab.find((v) => v.is_default) ?? forTab[0])?.id ?? null;
    });
  }, [roleId, tab]);

  useEffect(() => {
    loadVersions().catch((e) => setError(String(e)));
  }, [loadVersions]);

  useEffect(() => {
    setSelectedTemplate(tab === "resume" ? "modern-resume" : "clean-letter");
  }, [tab]);

  useEffect(() => {
    if (!selectedId) {
      setContent("");
      return;
    }
    const v = versions.find((x) => x.id === selectedId && x.doc_type === tab);
    if (!v) {
      // Versions list may not include the newly created id yet — don't wipe editor content.
      return;
    }

    if (isEditableTextFormat(v.format)) {
      const html = documentHtmlFromVersion(v);
      if (html.trim()) {
        setContent(html);
      }
      return;
    }

    if (!isBinaryLegacyFormat(v.format)) {
      setContent("");
      return;
    }

    if (convertingRef.current === v.id) return;
    convertingRef.current = v.id;
    setConverting(true);
    setError("");
    (async () => {
      try {
        const payload = await api.getRoleDocumentFileBase64(v.id);
        const kind = detectImportKind(payload.file_name ?? `file.${v.format}`)
          ?? (v.format === "pdf" ? "pdf" : "docx");
        const html = await bytesToHtml(base64ToBytes(payload.data_base64), kind);
        const updated = await api.convertRoleDocumentToHtml(v.id, html);
        setVersions((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
        setContent(html);
        onChanged?.();
      } catch (e) {
        setError(String(e));
        setContent("");
      } finally {
        convertingRef.current = null;
        setConverting(false);
      }
    })();
  }, [selectedId, tab, versions, onChanged]);

  const saveDocument = async () => {
    if (!selected || !isEditableTextFormat(selected.format)) return;
    setSaving(true);
    setError("");
    try {
      const updated = await api.updateRoleDocumentHtml(selected.id, content);
      setVersions((prev) => prev.map((v) => (v.id === selected.id ? updated : v)));
      onChanged?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const createHtmlVersion = async (templateId?: DocumentTemplateId) => {
    const name = newVersionName.trim() || `Version ${tabVersions.length + 1}`;
    const template = getTemplate(templateId ?? selectedTemplate);
    const html = template?.html ?? "<p></p>";
    setSaving(true);
    setError("");
    try {
      const v = await api.createRoleDocumentHtml(roleId, tab, name, html, false);
      setNewVersionName("");
      setSelectedId(v.id);
      setContent(html);
      await loadVersions();
      onChanged?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const uploadFile = async () => {
    const file = await open({
      multiple: false,
      filters: [
        { name: "Documents", extensions: ["pdf", "docx", "md", "txt"] },
      ],
    });
    if (!file || typeof file !== "string") return;

    const lower = file.toLowerCase();
    const kind = detectImportKind(lower);
    if (!kind) {
      setError("Unsupported file type");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const baseName =
        file.split(/[/\\]/).pop()?.replace(/\.(pdf|docx|md|txt)$/i, "") ?? "Imported";
      let html: string;
      if (kind === "markdown" || kind === "txt") {
        html = markdownToHtml(await readTextFile(file));
      } else {
        const bytes = await readFile(file);
        html = await bytesToHtml(Uint8Array.from(bytes), kind);
      }
      if (!html.replace(/<[^>]+>/g, "").trim()) {
        throw new Error("Conversion produced empty content");
      }
      const v = await api.createRoleDocumentHtml(roleId, tab, baseName, html, false);
      const savedHtml = v.content_html?.trim() ? v.content_html : html;
      setVersions((prev) => {
        const without = prev.filter((row) => row.id !== v.id);
        return [...without, { ...v, content_html: savedHtml, format: "html" }];
      });
      setSelectedId(v.id);
      setContent(savedHtml);
      await loadVersions();
      onChanged?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.setDefaultRoleDocumentVersion(selected.id);
      await loadVersions();
      onChanged?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const deleteVersion = async () => {
    if (!selected) return;
    const ok = await confirm(
      t("roles.deleteVersion").replace("{name}", selected.name),
      { title: t("common.delete"), kind: "warning", okLabel: t("common.delete"), cancelLabel: t("common.cancel") },
    );
    if (!ok) return;
    setSaving(true);
    try {
      await api.deleteRoleDocumentVersion(selected.id);
      setSelectedId(null);
      await loadVersions();
      onChanged?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const renameVersion = async () => {
    if (!selected) return;
    const name = prompt(t("roles.renamePrompt"), selected.name);
    if (!name?.trim()) return;
    setSaving(true);
    try {
      await api.renameRoleDocumentVersion(selected.id, name.trim());
      await loadVersions();
      onChanged?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || converting;
  const showEditor = selected && (isEditableTextFormat(selected.format) || converting);

  return (
    <div className="role-document-versions">
      <div className="doc-editor-toolbar">
        <div className="doc-tabs doc-tabs-lg">
          <button type="button" className={tab === "resume" ? "active" : ""} onClick={() => setTab("resume")}>
            {t("roles.tab.resume")}
          </button>
          <button type="button" className={tab === "letter" ? "active" : ""} onClick={() => setTab("letter")}>
            {t("roles.tab.letter")}
          </button>
        </div>
      </div>

      {error && <p className="error-msg">{error}</p>}

      <article>
        <header>
          <h2>{t("roles.section.newDocument")}</h2>
        </header>
        <div role="group">
          <input
            value={newVersionName}
            onChange={(e) => setNewVersionName(e.target.value)}
            placeholder={t("roles.newDocumentPlaceholder")}
          />
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value as DocumentTemplateId)}
          >
            {tabTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {t(template.labelKey as MessageKey)}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-secondary" onClick={() => createHtmlVersion()} disabled={busy}>
            {t("roles.newDocument")}
          </button>
          <button type="button" className="btn btn-secondary" onClick={uploadFile} disabled={busy}>
            {saving ? t("roles.converting") : t("roles.uploadFile")}
          </button>
        </div>
      </article>

      <article className="ui-section--version">
        <header>
          <h2>{t("roles.section.version")}</h2>
        </header>
        <div role="group">
          <select
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(Number(e.target.value))}
          >
            {tabVersions.map((v) => (
              <option key={v.id} value={v.id}>
                {versionDisplayName(v)}{v.is_default ? " ★" : ""}
              </option>
            ))}
          </select>
          {selected && !selected.is_default && (
            <button type="button" className="btn btn-secondary" onClick={setDefault} disabled={busy}>
              {t("roles.setDefault")}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={renameVersion} disabled={!selected || busy}>
            {t("roles.rename")}
          </button>
          {tabVersions.length > 1 && (
            <button type="button" className="btn btn-danger" onClick={deleteVersion} disabled={!selected || busy}>
              {t("common.delete")}
            </button>
          )}
        </div>

        <div className="ui-section-document">
          {showEditor ? (
            <>
              <p className="doc-editor-hint">
                {converting
                  ? t("roles.converting")
                  : (
                    <>
                      {t("roles.editing")} <strong>{selected!.name}</strong> ({formatLabel(selected!.format === "markdown" ? "html" : selected!.format)})
                      {selected!.is_default && ` ${t("roles.defaultVersion")}`}
                      {!canTailorFormat(selected!.format) && !isBinaryLegacyFormat(selected!.format) && ` ${t("roles.cannotTailor")}`}
                    </>
                  )}
              </p>
              {!converting && (
                <>
                  <div className="doc-editor-workspace">
                    <RichDocumentEditor value={content} onChange={setContent} />
                  </div>
                  <div className="version-save-row" role="group">
                    <button type="button" className="btn btn-primary" onClick={saveDocument} disabled={busy}>
                      {saving ? t("common.saving") : t("roles.saveVersion")}
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <p className="empty-state">{t("roles.noVersions")}</p>
          )}
        </div>
      </article>
    </div>
  );
}
