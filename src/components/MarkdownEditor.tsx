import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { useDocPreviewHeight } from "../lib/layout";
import "./MarkdownEditor.css";

interface Props {
  value: string;
  onChange: (value: string) => void;
  height?: number;
  preview?: boolean;
}

function ToolbarButton({
  label,
  title,
  active,
  disabled,
  onClick,
}: {
  label: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`md-toolbar-btn${active ? " is-active" : ""}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function MarkdownEditor({
  value,
  onChange,
  height,
  preview = false,
}: Props) {
  const defaultHeight = useDocPreviewHeight();
  const resolvedHeight = height ?? defaultHeight;

  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    content: value || "",
    contentType: "markdown",
    editable: !preview,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "md-editor-content",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: current }) => {
      if (preview) return;
      onChange(current.getMarkdown());
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!preview);
  }, [editor, preview]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getMarkdown();
    if (value === current) return;
    editor.commands.setContent(value || "", { contentType: "markdown" });
  }, [editor, value]);

  if (!editor) {
    return (
      <div className="md-editor" style={{ minHeight: resolvedHeight }}>
        <div className="md-editor-loading" />
      </div>
    );
  }

  return (
    <div
      className={`md-editor${preview ? " md-editor--preview" : ""}`}
      style={{ minHeight: resolvedHeight }}
    >
      {!preview && (
        <div className="md-toolbar" role="toolbar" aria-label="Formatting">
          <ToolbarButton
            label="B"
            title="Bold"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          />
          <ToolbarButton
            label="I"
            title="Italic"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          />
          <span className="md-toolbar-sep" aria-hidden />
          <ToolbarButton
            label="H1"
            title="Heading 1"
            active={editor.isActive("heading", { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          />
          <ToolbarButton
            label="H2"
            title="Heading 2"
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          />
          <ToolbarButton
            label="H3"
            title="Heading 3"
            active={editor.isActive("heading", { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          />
          <span className="md-toolbar-sep" aria-hidden />
          <ToolbarButton
            label="• List"
            title="Bullet list"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          />
          <ToolbarButton
            label="1. List"
            title="Numbered list"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          />
          <span className="md-toolbar-sep" aria-hidden />
          <ToolbarButton
            label="Quote"
            title="Quote"
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          />
          <ToolbarButton
            label="Code"
            title="Inline code"
            active={editor.isActive("code")}
            onClick={() => editor.chain().focus().toggleCode().run()}
          />
          <ToolbarButton
            label="—"
            title="Horizontal rule"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          />
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
