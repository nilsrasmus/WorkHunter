import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { IconChevronDown } from "@tabler/icons-react";
import type { EditorFontGroup, EditorFontOption } from "../lib/editorFonts";

type Props = {
  title: string;
  value: string;
  /** Ungrouped options (e.g. font sizes). */
  options?: EditorFontOption[];
  /** Grouped options (e.g. font families). */
  groups?: EditorFontGroup[];
  /** Option shown above groups (e.g. Default). */
  leadingOption?: EditorFontOption;
  className?: string;
  onChange: (value: string) => void;
};

function optionLabel(
  value: string,
  leading: EditorFontOption | undefined,
  groups: EditorFontGroup[] | undefined,
  options: EditorFontOption[] | undefined,
): string {
  if (leading && leading.value === value) return leading.label;
  for (const g of groups ?? []) {
    const hit = g.fonts.find((f) => f.value === value);
    if (hit) return hit.label;
  }
  const flat = options?.find((o) => o.value === value);
  if (flat) return flat.label;
  if (!value) return "Default";
  return value.split(",")[0]?.replace(/["']/g, "").trim() || "Default";
}

/**
 * Custom toolbar select that always opens downward inside the webview.
 * Avoids native select popups that can paint into the OS titlebar on WebView2.
 */
export function ToolbarSelect({
  title,
  value,
  options,
  groups,
  leadingOption,
  className,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const label = optionLabel(value, leadingOption, groups, options);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const maxHeight = Math.min(280, Math.max(140, spaceBelow));
    setMenuStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      minWidth: Math.max(rect.width, 8.5 * 16),
      maxHeight,
      zIndex: 400,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onBlurWindow = () => setOpen(false);
    // Close if anything outside the menu scrolls (overscroll chaining used to leave it floating).
    const onScroll = (e: Event) => {
      const t = e.target;
      if (t instanceof Node && menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    // Contain wheel at list edges so the editor/page behind the portal does not scroll.
    const onWheel = (e: WheelEvent) => {
      const menu = menuRef.current;
      if (!menu || !menu.contains(e.target as Node)) return;
      e.stopPropagation();
      const { scrollTop, scrollHeight, clientHeight } = menu;
      const atTop = scrollTop <= 0 && e.deltaY < 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0;
      if (atTop || atBottom) e.preventDefault();
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("blur", onBlurWindow);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("blur", onBlurWindow);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("wheel", onWheel, true);
    };
  }, [open]);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const renderOption = (opt: EditorFontOption) => (
    <button
      key={`${opt.label}:${opt.value}`}
      type="button"
      role="option"
      aria-selected={opt.value === value}
      className={`rich-toolbar-menu-item${opt.value === value ? " is-selected" : ""}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => pick(opt.value)}
    >
      {opt.label}
    </button>
  );

  return (
    <div ref={rootRef} className={`rich-toolbar-select-wrap${className ? ` ${className}` : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className="rich-toolbar-select"
        title={title}
        aria-label={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="rich-toolbar-select-label">{label}</span>
        <IconChevronDown size={14} aria-hidden />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={listId}
            className="rich-toolbar-menu"
            role="listbox"
            aria-label={title}
            style={menuStyle}
          >
            {leadingOption && renderOption(leadingOption)}
            {groups?.map((group) => (
              <div key={group.label} className="rich-toolbar-menu-group" role="group" aria-label={group.label}>
                <div className="rich-toolbar-menu-group-label">{group.label}</div>
                {group.fonts.map(renderOption)}
              </div>
            ))}
            {options?.map(renderOption)}
          </div>,
          document.body,
        )}
    </div>
  );
}
