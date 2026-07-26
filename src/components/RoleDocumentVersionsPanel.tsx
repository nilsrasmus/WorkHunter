import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { IconFileText, IconUpload } from "@tabler/icons-react";
import { BusyModal } from "./BusyModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { RichDocumentEditor } from "./RichDocumentEditor";
import { useSession } from "../context/SessionContext";
import { api } from "../lib/api";
import { hasAiApiKey } from "../lib/ai";
import { canTailorFormat, isBinaryLegacyFormat, isEditableTextFormat, versionDisplayName } from "../lib/files";
import { documentHtmlFromVersion } from "../lib/documentUtils";
import { ensureSlotIds } from "../lib/contentSlots";
import { detectImportKind } from "../lib/importDocument";
import { ensureVersionHtml, importPathToHtml } from "../lib/ensureEditableHtml";
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
  const { profile, settings } = useSession();
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
  const [convertingWithAi, setConvertingWithAi] = useState(false);
  const [newVersionName, setNewVersionName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplateId>("modern-resume");
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<RoleDocumentVersion | null>(null);
  const [aiErrorDetail, setAiErrorDetail] = useState<string | null>(null);
  const convertingRef = useRef<number | null>(null);

  const resolveImportSettings = useCallback(async () => {
    if (settings && hasAiApiKey(settings)) return settings;
    if (!profile) return settings;
    try {
      return await api.getSettings(profile.id);
    } catch {
      return settings;
    }
  }, [settings, profile]);

  const importOptsFor = useCallback(
    async (docType: "resume" | "letter") => ({
      profileId: profile?.id,
      settings: await resolveImportSettings(),
      docType,
    }),
    [resolveImportSettings, profile?.id],
  );

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
        const opts = await importOptsFor(v.doc_type);
        setConvertingWithAi(!!(opts.settings && hasAiApiKey(opts.settings)));
        const ensured = await ensureVersionHtml(v, opts);
        if (ensured.aiError) setAiErrorDetail(ensured.aiError);
        setVersions((prev) => prev.map((row) => (row.id === ensured.version.id ? ensured.version : row)));
        setContent(ensured.html);
        onChanged?.();
      } catch (e) {
        setError(String(e));
        setContent("");
      } finally {
        convertingRef.current = null;
        setConverting(false);
        setConvertingWithAi(false);
      }
    })();
  }, [selectedId, tab, versions, onChanged, importOptsFor]);

  const saveDocument = async () => {
    if (!selected || !isEditableTextFormat(selected.format)) return;
    setSaving(true);
    setError("");
    try {
      const updated = await api.updateRoleDocumentHtml(selected.id, ensureSlotIds(content));
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
      const opts = await importOptsFor(tab);
      setConvertingWithAi(!!(opts.settings && hasAiApiKey(opts.settings)));
      const baseName =
        file.split(/[/\\]/).pop()?.replace(/\.(pdf|docx|md|txt)$/i, "") ?? "Imported";
      const imported = await importPathToHtml(file, opts);
      const html = imported.html;
      if (imported.aiError) setAiErrorDetail(imported.aiError);
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
      setConvertingWithAi(false);
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

  const requestDeleteVersion = () => {
    if (!selected) return;
    setDeleteTarget(selected);
  };

  const cancelDeleteVersion = () => {
    if (saving) return;
    setDeleteTarget(null);
  };

  const confirmDeleteVersion = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setError("");
    try {
      await api.deleteRoleDocumentVersion(deleteTarget.id);
      setDeleteTarget(null);
      setSelectedId(null);
      setContent("");
      await loadVersions();
      onChanged?.();
    } catch (e) {
      setError(String(e));
      setDeleteTarget(null);
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
  const deleteIsLast =
    !!deleteTarget
    && versions.filter((v) => v.doc_type === deleteTarget.doc_type).length <= 1;
  const deleteMessage = deleteTarget
    ? (deleteIsLast
      ? t("roles.deleteLastVersion").replace("{name}", deleteTarget.name)
      : t("roles.deleteVersion").replace("{name}", deleteTarget.name))
    : "";

  return (
    <div className="role-document-versions">
      <ConfirmDialog
        open={!!deleteTarget}
        title={t("common.delete")}
        message={deleteMessage}
        danger
        busy={saving}
        onConfirm={confirmDeleteVersion}
        onCancel={cancelDeleteVersion}
      />
      <ConfirmDialog
        open={!!aiErrorDetail}
        title={t("roles.aiImportFailed")}
        message={`${t("roles.aiImportFailedHint")}\n\n${aiErrorDetail ?? ""}`}
        alertOnly
        confirmLabel={t("common.close")}
        onConfirm={() => setAiErrorDetail(null)}
        onCancel={() => setAiErrorDetail(null)}
      />
      <BusyModal
        open={convertingWithAi}
        title={t("roles.convertingAiTitle")}
        message={t("roles.convertingAiBody")}
      />

      <article>
        <div className="doc-tabs doc-tabs-lg">
          <button type="button" className={tab === "resume" ? "active" : ""} onClick={() => setTab("resume")}>
            {t("roles.tab.resume")}
          </button>
          <button type="button" className={tab === "letter" ? "active" : ""} onClick={() => setTab("letter")}>
            {t("roles.tab.letter")}
          </button>
        </div>

        {error && <p className="error-msg">{error}</p>}

        <div className="role-document-new">
          <h3>{t("roles.section.newDocument")}</h3>
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
              <IconFileText size={16} aria-hidden="true" />
              {t("roles.newDocument")}
            </button>
            <button type="button" className="btn btn-secondary" onClick={uploadFile} disabled={busy}>
              <IconUpload size={16} aria-hidden="true" />
              {saving
                ? (convertingWithAi ? t("roles.convertingAi") : t("roles.converting"))
                : t("roles.uploadFile")}
            </button>
          </div>
        </div>

        <div className="role-document-existing">
          <h3>{t("roles.section.version")}</h3>
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
            {selected && (
              <button type="button" className="btn btn-danger" onClick={requestDeleteVersion} disabled={busy}>
                {t("common.delete")}
              </button>
            )}
          </div>

          <div className="ui-section-document">
            {showEditor ? (
              <>
                <p className="doc-editor-hint">
                  {converting
                    ? (convertingWithAi ? t("roles.convertingAi") : t("roles.converting"))
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
        </div>
      </article>
    </div>
  );
}
