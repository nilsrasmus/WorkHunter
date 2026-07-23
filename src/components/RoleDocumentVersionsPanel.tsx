import { useCallback, useEffect, useState } from "react";
import { confirm, open } from "@tauri-apps/plugin-dialog";
import { readFile, readTextFile } from "@tauri-apps/plugin-fs";
import { IconFileText, IconUpload } from "@tabler/icons-react";
import { MarkdownEditor } from "./MarkdownEditor";
import { BinaryDocumentPreview } from "./BinaryDocumentPreview";
import { api } from "../lib/api";
import { bytesToBase64, canTailorFormat, versionDisplayName } from "../lib/files";
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
  const [error, setError] = useState("");

  const tabVersions = versions.filter((v) => v.doc_type === tab);
  const selected = tabVersions.find((v) => v.id === selectedId) ?? null;

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
    if (!selectedId) {
      setContent("");
      return;
    }
    const v = versions.find((x) => x.id === selectedId && x.doc_type === tab);
    if (v?.format === "markdown") {
      setContent(v.content_md);
    } else {
      setContent("");
    }
  }, [selectedId, tab]);

  const saveMarkdown = async () => {
    if (!selected || selected.format !== "markdown") return;
    setSaving(true);
    setError("");
    try {
      await api.updateRoleDocumentMarkdown(selected.id, content);
      setVersions((prev) =>
        prev.map((v) =>
          v.id === selected.id ? { ...v, content_md: content } : v,
        ),
      );
      onChanged?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const createMarkdownVersion = async () => {
    const name = `Version ${tabVersions.length + 1}`;
    setSaving(true);
    setError("");
    try {
      const v = await api.createRoleDocumentMarkdown(roleId, tab, name, "", false);
      setSelectedId(v.id);
      setContent("");
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
    setSaving(true);
    setError("");
    try {
      if (lower.endsWith(".md") || lower.endsWith(".txt")) {
        const text = await readTextFile(file);
        const baseName = file.split(/[/\\]/).pop()?.replace(/\.(md|txt)$/i, "") ?? "Imported";
        const v = await api.createRoleDocumentMarkdown(roleId, tab, baseName, text, false);
        setSelectedId(v.id);
        setContent(text);
      } else {
        const format = lower.endsWith(".pdf") ? "pdf" as const : "docx" as const;
        const bytes = await readFile(file);
        const fileName = file.split(/[/\\]/).pop() ?? `upload.${format}`;
        const name = fileName.replace(/\.(pdf|docx)$/i, "");
        const v = await api.uploadRoleDocumentFile(
          roleId,
          tab,
          name,
          format,
          fileName,
          bytesToBase64(bytes),
        );
        setSelectedId(v.id);
      }
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

  return (
    <div className="role-document-versions">
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
            <button type="button" className="btn btn-secondary" onClick={createMarkdownVersion} disabled={saving}>
              <IconFileText size={16} aria-hidden="true" />
              {t("roles.newMarkdown")}
            </button>
            <button type="button" className="btn btn-secondary" onClick={uploadFile} disabled={saving}>
              <IconUpload size={16} aria-hidden="true" />
              {t("roles.uploadFile")}
            </button>
          </div>
        </div>

        {tabVersions.length > 0 && (
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
                <button type="button" className="btn btn-secondary" onClick={setDefault} disabled={saving}>
                  {t("roles.setDefault")}
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={renameVersion} disabled={!selected || saving}>
                {t("roles.rename")}
              </button>
              {tabVersions.length > 1 && (
                <button type="button" className="btn btn-danger" onClick={deleteVersion} disabled={!selected || saving}>
                  {t("common.delete")}
                </button>
              )}
            </div>

            <div className="ui-section-document">
              {selected?.format === "markdown" ? (
                <>
                  <p className="doc-editor-hint">
                    {t("roles.editing")} <strong>{selected.name}</strong> ({formatLabel(selected.format)})
                    {selected.is_default && ` ${t("roles.defaultVersion")}`}
                    {!canTailorFormat(selected.format) && ` ${t("roles.cannotTailor")}`}
                  </p>
                  <div className="doc-editor-workspace">
                    <MarkdownEditor value={content} onChange={setContent} />
                  </div>
                  <div className="version-save-row" role="group">
                    <button type="button" className="btn btn-primary" onClick={saveMarkdown} disabled={saving}>
                      {saving ? t("common.saving") : t("roles.saveVersion")}
                    </button>
                  </div>
                </>
              ) : selected ? (
                <div className="binary-doc-preview">
                  <h3>{selected.name}</h3>
                  {selected.is_default && <p className="hint">{t("roles.defaultForRole")}</p>}
                  <p className="hint">{t("roles.binaryHint")}</p>
                  <BinaryDocumentPreview source={{ kind: "version", versionId: selected.id }} />
                </div>
              ) : null}
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
