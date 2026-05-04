import sanitizeHtml from "sanitize-html";

const MAX_HTML = 400_000;

const SANITIZE_OPTS: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    "h1",
    "h2",
    "h3",
    "h4",
    "img",
    "mark",
    "span",
    "div",
  ],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ["src", "alt", "title", "width", "height"],
    a: ["href", "name", "target", "rel"],
    span: ["style", "class"],
    p: ["style", "class"],
    div: ["style", "class"],
    h1: ["style", "class"],
    h2: ["style", "class"],
    h3: ["style", "class"],
    h4: ["style", "class"],
    li: ["style", "class"],
    ol: ["style", "class"],
    ul: ["style", "class"],
    blockquote: ["style", "class"],
  },
  allowedStyles: {
    "*": {
      color: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/],
      "background-color": [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/],
      "text-align": [/^left$/, /^right$/, /^center$/, /^justify$/],
    },
  },
  transformTags: {
    a: (tagName, attribs) => {
      const href = String(attribs.href ?? "").trim();
      const safe =
        href.startsWith("https://") ||
        href.startsWith("http://") ||
        href.startsWith("/") ||
        href.startsWith("#");
      if (!safe) {
        return { tagName: "span", attribs: {} as Record<string, string>, text: "" };
      }
      return {
        tagName,
        attribs: {
          href,
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        } as Record<string, string>,
      };
    },
    img: (tagName, attribs) => {
      const src = String(attribs.src ?? "").trim();
      if (!src.startsWith("https://")) {
        return { tagName: "span", attribs: {} as Record<string, string>, text: "" };
      }
      const title = attribs.title != null ? String(attribs.title) : "";
      return {
        tagName,
        attribs: {
          src,
          alt: String(attribs.alt ?? ""),
          ...(title ? { title } : {}),
        } as Record<string, string>,
      };
    },
  },
};

export function sanitizeBattleRestrictionsHtml(raw: string): string {
  const s = typeof raw === "string" ? raw : "";
  const clipped = s.length > MAX_HTML ? s.slice(0, MAX_HTML) : s;
  return sanitizeHtml(clipped, SANITIZE_OPTS);
}
