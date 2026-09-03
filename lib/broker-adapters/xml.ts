function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

export function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const hex = entity[1]?.toLowerCase() === "x";
      const code = hex
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITY_MAP[entity.toLowerCase()] ?? match;
  });
}

export function stripXmlNoise(xml: string): string {
  return xml
    .replace(/^\uFEFF/, "")
    .replace(/<\?xml[^?]*\?>/i, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
}

export function xmlRootName(xml: string): string {
  const match = stripXmlNoise(xml).match(/^<([A-Za-z_][\w:.-]*)/);
  return match?.[1]?.replace(/^.*:/, "").toLowerCase() ?? "";
}

export function xmlAttr(fragment: string, name: string): string {
  const pattern = new RegExp(
    `\\b${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    "i",
  );
  const match = fragment.match(pattern);
  return decodeXmlEntities(match?.[1] ?? match?.[2] ?? "").trim();
}

export function xmlElements(xml: string, tag: string): string[] {
  const escaped = escapeRegExp(tag);
  const pattern = new RegExp(
    `<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>|<${escaped}(?:\\s[^>]*)?/>`,
    "gi",
  );
  const hits: string[] = [];
  for (const match of xml.matchAll(pattern)) {
    hits.push(match[1] ?? match[0]);
  }
  return hits;
}

export function xmlText(fragment: string, tag: string): string {
  const inner = xmlElements(fragment, tag)[0];
  if (inner == null) {
    return xmlAttr(fragment, tag);
  }
  return decodeXmlEntities(inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

export function firstXmlText(fragment: string, tags: string[]): string {
  for (const tag of tags) {
    const value = xmlText(fragment, tag);
    if (value) return value;
  }
  return "";
}
