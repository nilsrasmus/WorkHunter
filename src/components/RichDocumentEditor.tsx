import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { FontSize } from "@tiptap/extension-text-style/font-size";
import { Color } from "@tiptap/extension-color";
import { FontFamily } from "@tiptap/extension-font-family";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconBlockquote,
  IconBold,
  IconH1,
  IconH2,
  IconH3,
  IconItalic,
  IconList,
  IconListNumbers,
  IconSeparatorHorizontal,
  IconTypography,
  IconUnderline,
} from "@tabler/icons-react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { useDocPreviewHeight } from "../lib/layout";
import {
  ensureCustomFontsLoaded,
  familyCssValue,
  uploadCustomFont,
} from "../lib/documentFonts";
import { pageBreakOffsets, pageContentHeightPx } from "../lib/pageBreaks";
import { useSession } from "../context/SessionContext";
import type { CustomFont } from "../types";
import {
  ContentSlotExtension,
  PreserveBlockStyles,
  PreserveMarkStyles,
  StyledDiv,
} from "../lib/editor/contentSlotExtension";
import "./MarkdownEditor.css";

interface Props {
  value: string;
  onChange: (value: string) => void;
  height?: number;
  preview?: boolean;
}

function ToolbarButton({
  icon,
  title,
  active,
  disabled,
  onClick,
}: {
  icon: ReactNode;
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
      {icon}
    </button>
  );
}

const BUILTIN_FONTS = [
  { label: "Default", value: "" },
  { label: "Geist", value: "Geist Variable, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Mono", value: "Geist Mono Variable, monospace" },
];

const FONT_SIZES = [
  { label: "Default", value: "" },
  { label: "10", value: "10pt" },
  { label: "11", value: "11pt" },
  { label: "12", value: "12pt" },
  { label: "14", value: "14pt" },
  { label: "16", value: "16pt" },
  { label: "18", value: "18pt" },
  { label: "24", value: "24pt" },
];

export function RichDocumentEditor({
  value,
  onChange,
  height,
  preview = false,
}: Props) {
  const { profile } = useSession();
  const defaultHeight = useDocPreviewHeight();
  const resolvedHeight = height ?? defaultHeight;
  const [customFonts, setCustomFonts] = useState<CustomFont[]>([]);
  const [fontBusy, setFontBusy] = useState(false);
  const [breakYs, setBreakYs] = useState<number[]>([]);
  const [scrollTop, setScrollTop] = useState(0);
  const shellRef = useRef<HTMLDivElement>(null);
  /** Skip setContent when `value` is echoing our own onChange (prevents cursor jump). */
  const lastEmittedHtml = useRef<string | null>(null);

  const fontOptions = useMemo(() => {
    const custom = customFonts.map((f) => ({
      label: f.family,
      value: familyCssValue(f.family),
    }));
    return [...BUILTIN_FONTS, ...custom];
  }, [customFonts]);

  const extensions = useMemo(
    () => [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      StyledDiv,
      ContentSlotExtension,
      PreserveBlockStyles,
      PreserveMarkStyles,
      TextStyle,
      FontSize,
      Color,
      FontFamily,
      Underline,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    [],
  );

  const emitHtml = useCallback(
    (html: string) => {
      lastEmittedHtml.current = html;
      onChange(html);
    },
    [onChange],
  );

  const editor = useEditor({
    extensions,
    content: value || "<p></p>",
    editable: !preview,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "md-editor-content rich-editor-content",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: current }) => {
      if (preview) return;
      // Do not run ensureSlotIds here — it changes markup vs getHTML() and triggers setContent → cursor jump.
      emitHtml(current.getHTML());
    },
  });

  useEffect(() => {
    if (!profile) return;
    ensureCustomFontsLoaded(profile.id)
      .then(setCustomFonts)
      .catch(() => setCustomFonts([]));
  }, [profile]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!preview);
  }, [editor, preview]);

  useEffect(() => {
    if (!editor) return;
    if (lastEmittedHtml.current !== null && value === lastEmittedHtml.current) {
      return;
    }
    const next = value?.trim() ? value : "<p></p>";
    if (next === editor.getHTML()) return;
    editor.commands.setContent(next, { emitUpdate: false });
    lastEmittedHtml.current = next;
  }, [editor, value]);

  const refreshPageBreaks = useCallback(() => {
    const root = shellRef.current;
    if (!root) return;
    const prose = root.querySelector(".tiptap") as HTMLElement | null;
    if (!prose) {
      setBreakYs([]);
      return;
    }
    const pageH = pageContentHeightPx();
    const offsets = pageBreakOffsets(prose.scrollHeight, pageH);
    setBreakYs(offsets);
  }, []);

  useEffect(() => {
    if (!editor || !shellRef.current) return;
    refreshPageBreaks();
    const prose = shellRef.current.querySelector(".tiptap") as HTMLElement | null;
    if (!prose) return;

    let scrollRaf = 0;
    const onScroll = () => {
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      scrollRaf = requestAnimationFrame(() => {
        setScrollTop(prose.scrollTop);
      });
    };
    setScrollTop(prose.scrollTop);
    prose.addEventListener("scroll", onScroll, { passive: true });

    let resizeRaf = 0;
    const ro = new ResizeObserver(() => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(refreshPageBreaks);
    });
    ro.observe(prose);
    const onUpdate = () => {
      requestAnimationFrame(refreshPageBreaks);
    };
    editor.on("update", onUpdate);
    return () => {
      prose.removeEventListener("scroll", onScroll);
      ro.disconnect();
      editor.off("update", onUpdate);
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
    };
  }, [editor, refreshPageBreaks]);

  const addFont = async () => {
    if (!profile) return;
    const file = await open({
      multiple: false,
      filters: [{ name: "Fonts", extensions: ["ttf", "otf", "woff", "woff2"] }],
    });
    if (!file || typeof file !== "string") return;
    setFontBusy(true);
    try {
      const bytes = Uint8Array.from(await readFile(file));
      const font = await uploadCustomFont(profile.id, file, bytes);
      setCustomFonts((prev) => [...prev.filter((f) => f.id !== font.id), font]);
    } catch (e) {
      console.error(e);
      window.alert(String(e));
    } finally {
      setFontBusy(false);
    }
  };

  if (!editor) {
    return (
      <div className="md-editor" style={{ minHeight: resolvedHeight }}>
        <div className="md-editor-loading" />
      </div>
    );
  }

  return (
    <div
      ref={shellRef}
      className={`md-editor rich-document-editor${preview ? " md-editor--preview" : ""}`}
      style={{ minHeight: resolvedHeight }}
    >
      {!preview && (
        <div className="md-toolbar rich-toolbar" role="toolbar" aria-label="Formatting">
          <div className="md-toolbar-group">
            <ToolbarButton
              icon={<IconBold size={16} />}
              title="Bold"
              active={editor.isActive("bold")}
              onClick={() => editor.chain().focus().toggleBold().run()}
            />
            <ToolbarButton
              icon={<IconItalic size={16} />}
              title="Italic"
              active={editor.isActive("italic")}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            />
            <ToolbarButton
              icon={<IconUnderline size={16} />}
              title="Underline"
              active={editor.isActive("underline")}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            />
          </div>
          <span className="md-toolbar-sep" aria-hidden />
          <div className="md-toolbar-group">
            <ToolbarButton
              icon={<IconH1 size={16} />}
              title="Heading 1"
              active={editor.isActive("heading", { level: 1 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            />
            <ToolbarButton
              icon={<IconH2 size={16} />}
              title="Heading 2"
              active={editor.isActive("heading", { level: 2 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            />
            <ToolbarButton
              icon={<IconH3 size={16} />}
              title="Heading 3"
              active={editor.isActive("heading", { level: 3 })}
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            />
          </div>
          <span className="md-toolbar-sep" aria-hidden />
          <div className="md-toolbar-group">
            <select
              className="rich-toolbar-select"
              title="Font family"
              value={editor.getAttributes("textStyle").fontFamily ?? ""}
              onChange={(e) => {
                const family = e.target.value;
                if (family) {
                  editor.chain().focus().setFontFamily(family).run();
                } else {
                  editor.chain().focus().unsetFontFamily().run();
                }
              }}
            >
              {fontOptions.map((opt) => (
                <option key={`${opt.label}:${opt.value}`} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select
              className="rich-toolbar-select rich-toolbar-select--size"
              title="Font size"
              value={editor.getAttributes("textStyle").fontSize ?? ""}
              onChange={(e) => {
                const size = e.target.value;
                if (size) {
                  editor.chain().focus().setFontSize(size).run();
                } else {
                  editor.chain().focus().unsetFontSize().run();
                }
              }}
            >
              {FONT_SIZES.map((opt) => (
                <option key={opt.label} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ToolbarButton
              icon={fontBusy ? <span className="md-toolbar-btn-label">…</span> : <IconTypography size={16} />}
              title="Upload font (.ttf, .otf, .woff)"
              disabled={!profile || fontBusy}
              onClick={addFont}
            />
            <input
              type="color"
              className="rich-toolbar-color"
              title="Text color"
              defaultValue="#12161A"
              onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            />
          </div>
          <span className="md-toolbar-sep" aria-hidden />
          <div className="md-toolbar-segmented">
            <ToolbarButton
              icon={<IconAlignLeft size={16} />}
              title="Align left"
              active={editor.isActive({ textAlign: "left" })}
              onClick={() => editor.chain().focus().setTextAlign("left").run()}
            />
            <ToolbarButton
              icon={<IconAlignCenter size={16} />}
              title="Align center"
              active={editor.isActive({ textAlign: "center" })}
              onClick={() => editor.chain().focus().setTextAlign("center").run()}
            />
            <ToolbarButton
              icon={<IconAlignRight size={16} />}
              title="Align right"
              active={editor.isActive({ textAlign: "right" })}
              onClick={() => editor.chain().focus().setTextAlign("right").run()}
            />
          </div>
          <span className="md-toolbar-sep" aria-hidden />
          <div className="md-toolbar-group">
            <ToolbarButton
              icon={<IconList size={16} />}
              title="Bullet list"
              active={editor.isActive("bulletList")}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            />
            <ToolbarButton
              icon={<IconListNumbers size={16} />}
              title="Numbered list"
              active={editor.isActive("orderedList")}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            />
            <ToolbarButton
              icon={<IconBlockquote size={16} />}
              title="Quote"
              active={editor.isActive("blockquote")}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
            />
            <ToolbarButton
              icon={<IconSeparatorHorizontal size={16} />}
              title="Horizontal rule"
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
            />
          </div>
        </div>
      )}
      <div className="rich-editor-page">
        <EditorContent editor={editor} />
        {breakYs.length > 0 && (
          <div className="page-break-guides" aria-hidden>
            {breakYs.map((y) => (
              <div key={y} className="page-break-line" style={{ top: y - scrollTop }}>
                <span className="page-break-label">Page break</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** @deprecated Use RichDocumentEditor */
