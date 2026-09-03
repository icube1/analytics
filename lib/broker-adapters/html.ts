function hasDomParser(): boolean {
  return typeof globalThis.DOMParser === "function";
}

function requireDomParser(): typeof DOMParser {
  if (!hasDomParser()) {
    throw new Error(
      "DOMParser is unavailable. Server/Node callers must load install-node-dom-parser first.",
    );
  }
  return globalThis.DOMParser;
}

export function parseHtmlDocument(html: string): Document {
  return new (requireDomParser())().parseFromString(html, "text/html");
}

export function parseXmlDocument(xml: string): Document {
  return new (requireDomParser())().parseFromString(xml, "application/xml");
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
