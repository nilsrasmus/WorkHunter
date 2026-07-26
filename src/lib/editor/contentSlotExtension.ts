import { Extension, mergeAttributes, Node } from "@tiptap/core";

function styleAttrs() {
  return {
    style: {
      default: null as string | null,
      parseHTML: (element: HTMLElement) => element.getAttribute("style"),
      renderHTML: (attributes: Record<string, unknown>) => {
        if (!attributes.style || typeof attributes.style !== "string") return {};
        return { style: attributes.style };
      },
    },
  };
}

/**
 * Layout/section wrappers from AI HTML. Optional data-wh-slot; always keeps style.
 * TipTap has no built-in div — without this, flex/color on divs is discarded.
 */
export const StyledDiv = Node.create({
  name: "styledDiv",
  group: "block",
  content: "block*",
  defining: true,

  addAttributes() {
    return {
      ...styleAttrs(),
      "data-wh-slot": {
        default: null,
        parseHTML: (element) => element.getAttribute("data-wh-slot"),
        renderHTML: (attributes) => {
          if (!attributes["data-wh-slot"]) return {};
          return { "data-wh-slot": attributes["data-wh-slot"] };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "div" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes), 0];
  },
});

/** Keep inline style= on blocks so AI colors/borders/flex survive setContent. */
export const PreserveBlockStyles = Extension.create({
  name: "preserveBlockStyles",

  addGlobalAttributes() {
    return [
      {
        types: ["heading", "paragraph", "blockquote", "listItem", "bulletList", "orderedList"],
        attributes: styleAttrs(),
      },
    ];
  },
});

export const ContentSlotExtension = Extension.create({
  name: "contentSlot",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading", "blockquote"],
        attributes: {
          "data-wh-slot": {
            default: null,
            parseHTML: (element) => element.getAttribute("data-wh-slot"),
            renderHTML: (attributes) => {
              if (!attributes["data-wh-slot"]) return {};
              return { "data-wh-slot": attributes["data-wh-slot"] };
            },
          },
        },
      },
    ];
  },
});

export function createSlotId(): string {
  return `slot-${crypto.randomUUID().slice(0, 8)}`;
}

/** @deprecated Use StyledDiv — kept for existing imports. */
export const ContentSlotDiv = StyledDiv;
