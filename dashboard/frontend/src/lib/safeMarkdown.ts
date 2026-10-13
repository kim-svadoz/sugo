import { marked } from "marked";
import { markdownForPreview } from "./markdownEditing.js";

export function safeMarkdown(markdown: string): string {
  const html = marked.parse(markdownForPreview(markdown), { async: false }) as string;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,iframe,object,embed,style,link,meta").forEach((node) => node.remove());
  doc.querySelectorAll("*").forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || ((name === "href" || name === "src") && value.startsWith("javascript:"))) node.removeAttribute(attribute.name);
    }
  });
  return doc.body.innerHTML;
}
