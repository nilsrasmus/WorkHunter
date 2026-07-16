import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { renderAsync } from "docx-preview";
import { useI18n } from "../lib/i18n";

export interface DocumentFilePayload {
  format: string;
  file_name: string | null;
  data_base64: string;
}

type Source =
  | { kind: "version"; versionId: number }
  | { kind: "application"; applicationId: number; docType: "resume" | "letter" };

interface Props {
  source: Source;
  className?: string;
}

function mimeForFormat(format: string): string {
  if (format === "pdf") return "application/pdf";
  if (format === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "application/octet-stream";
}

async function loadPayload(source: Source): Promise<DocumentFilePayload> {
  if (source.kind === "version") {
    return invoke<DocumentFilePayload>("get_role_document_file_base64", {
      versionId: source.versionId,
    });
  }
  return invoke<DocumentFilePayload>("get_application_file_base64", {
    applicationId: source.applicationId,
    docType: source.docType,
  });
}

export function BinaryDocumentPreview({ source, className }: Props) {
  const { t } = useI18n();
  const docxRef = useRef<HTMLDivElement>(null);
  const [payload, setPayload] = useState<DocumentFilePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const sourceKey =
    source.kind === "version"
      ? `v:${source.versionId}`
      : `a:${source.applicationId}:${source.docType}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPayload(null);

    loadPayload(source)
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sourceKey]);

  useEffect(() => {
    if (!payload || payload.format !== "docx" || !docxRef.current) return;

    const el = docxRef.current;
    el.innerHTML = "";

    const binary = atob(payload.data_base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    renderAsync(bytes.buffer, el, undefined, {
      className: "docx-preview-content",
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      breakPages: true,
    }).catch((e) => setError(String(e)));
  }, [payload]);

  if (loading) {
    return (
      <div className={`binary-doc-preview binary-doc-preview--loading ${className ?? ""}`}>
        {t("preview.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className={`binary-doc-preview binary-doc-preview--error ${className ?? ""}`}>
        {error}
      </div>
    );
  }

  if (!payload) return null;

  const label = payload.file_name ?? payload.format.toUpperCase();

  if (payload.format === "pdf") {
    const dataUrl = `data:${mimeForFormat("pdf")};base64,${payload.data_base64}`;
    return (
      <div className={`binary-doc-preview binary-doc-preview--pdf ${className ?? ""}`}>
        <p className="binary-doc-preview__label">{label}</p>
        <iframe
          title={label}
          src={dataUrl}
          className="binary-doc-preview__iframe"
        />
      </div>
    );
  }

  if (payload.format === "docx") {
    return (
      <div className={`binary-doc-preview binary-doc-preview--docx ${className ?? ""}`}>
        <p className="binary-doc-preview__label">{label}</p>
        <div ref={docxRef} className="binary-doc-preview__docx" />
      </div>
    );
  }

  return (
    <div className={`binary-doc-preview binary-doc-preview--unsupported ${className ?? ""}`}>
      <p className="binary-doc-preview__label">{label}</p>
      <p>{t("preview.unsupportedFormat").replace("{format}", payload.format)}</p>
    </div>
  );
}
