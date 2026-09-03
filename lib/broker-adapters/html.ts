import { parseHTML } from "linkedom";

function hasDomParser(): boolean {
  return typeof globalThis.DOMParser === "function";
}

export function parseHtmlDocument(html: string): Document {
  if (hasDomParser()) {
    return new globalThis.DOMParser().parseFromString(html, "text/html");
  }
  return parseHTML(html).document as unknown as Document;
}

export function parseXmlDocument(xml: string): Document {
  if (hasDomParser()) {
    return new globalThis.DOMParser().parseFromString(xml, "application/xml");
  }
  return parseHTML(xml).document as unknown as Document;
}

export function cellText(row: Element, index: number): string {
  const cells = row.querySelectorAll("td");
  return cells[index]?.textContent?.trim() ?? "";
}

export function hasClass(row: Element, className: string): boolean {
  const value = row.getAttribute("class") ?? "";
  return value.split(/\s+/).includes(className);
}

export function findTableAfterHeading(
  doc: Document,
  heading: string,
): Element | null {
  const paragraphs = [...doc.querySelectorAll("p, br")];
  for (const node of paragraphs) {
    const text = node.textContent?.trim() ?? "";
    if (!text.includes(heading)) continue;

    let sibling = node.nextElementSibling;
    while (sibling) {
      if (sibling.tagName === "TABLE") {
        return sibling;
      }
      if (sibling.tagName === "P" && sibling.textContent?.trim()) {
        break;
      }
      sibling = sibling.nextElementSibling;
    }
  }

  const allTables = [...doc.querySelectorAll("table")];
  return (
    allTables.find((table) => {
      const prev = table.previousElementSibling?.textContent ?? "";
      return prev.includes(heading);
    }) ?? null
  );
}
