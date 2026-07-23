import { Extension, Node, mergeAttributes } from "@tiptap/core";

export const ContentSlotDiv = Node.create({
  name: "contentSlotDiv",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
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
    return [{ tag: "div[data-wh-slot]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes), 0];
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
