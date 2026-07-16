import { useState } from "react";
import { MarkdownEditor } from "./MarkdownEditor";
export type RoleDocTab = "resume" | "letter";

interface Props {
  resume: string;
  letter: string;
  onResumeChange: (value: string) => void;
  onLetterChange: (value: string) => void;
  onUpload?: (docType: RoleDocTab) => void;
}

export function RoleDocumentEditor({
  resume,
  letter,
  onResumeChange,
  onLetterChange,
  onUpload,
}: Props) {
  const [tab, setTab] = useState<RoleDocTab>("resume");
  const value = tab === "resume" ? resume : letter;
  const onChange = tab === "resume" ? onResumeChange : onLetterChange;

  return (
    <div className="role-document-editor">
      <div className="doc-editor-toolbar">
        <div className="doc-tabs doc-tabs-lg">
          <button type="button" className={tab === "resume" ? "active" : ""}
            onClick={() => setTab("resume")}
          >
            Resume
          </button>
          <button type="button" className={tab === "letter" ? "active" : ""}
            onClick={() => setTab("letter")}
          >
            Personal letter
          </button>
        </div>
        {onUpload && (
          <button type="button" className="btn btn-secondary"
            onClick={() => onUpload(tab)}
          >
            Upload {tab === "resume" ? "resume" : "letter"}
          </button>
        )}
      </div>
      <p className="doc-editor-hint">
        Editing <strong>{tab === "resume" ? "resume" : "personal letter"}</strong>
        {" "}— switch tabs to edit the other document.
      </p>
      <div className="doc-editor-workspace">
        <MarkdownEditor value={value} onChange={onChange} />      </div>
    </div>
  );
}
