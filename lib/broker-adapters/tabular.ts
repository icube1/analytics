export type CsvDelimiter = "," | ";" | "\t";

export function detectCsvDelimiter(headerLine: string): CsvDelimiter {
  const counts: Record<CsvDelimiter, number> = {
    ",": (headerLine.match(/,/g) ?? []).length,
    ";": (headerLine.match(/;/g) ?? []).length,
    "\t": (headerLine.match(/\t/g) ?? []).length,
  };
  const best = (Object.entries(counts) as Array<[CsvDelimiter, number]>).sort(
    (left, right) => right[1] - left[1],
  )[0];
  return best?.[0] ?? ",";
}

export function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function csvLines(content: string): string[] {
  return stripBom(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function normalizeHeader(value: string): string {
  return value
    .replace(/^\ufeff/, "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\s._-]+/g, " ");
}

export type TabularRow = Record<string, string>;

export interface TabularSection {
  name: string;
  headers: string[];
  rows: TabularRow[];
}

export interface ParsedTabularDocument {
  magic: string | null;
  delimiter: CsvDelimiter;
  sections: TabularSection[];
  looseRows: TabularRow[];
  looseHeaders: string[];
}

function rowFromCells(headers: string[], cells: string[]): TabularRow {
  const row: TabularRow = {};
  headers.forEach((header, index) => {
    row[header] = cells[index] ?? "";
  });
  return row;
}

/** Parses sectioned (`[meta]`) or flat delimiter-separated broker tables. */
export function parseTabularDocument(content: string): ParsedTabularDocument {
  const rawLines = csvLines(content);
  const magic = rawLines[0]?.startsWith("#") ? rawLines[0] : null;
  const lines = rawLines.filter((line) => !line.startsWith("#"));

  const sections: TabularSection[] = [];
  let delimiter: CsvDelimiter = ",";
  let current: TabularSection | null = null;
  let looseHeaders: string[] = [];
  const looseRows: TabularRow[] = [];

  for (const line of lines) {
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      current = { name: sectionMatch[1].trim().toLowerCase(), headers: [], rows: [] };
      sections.push(current);
      continue;
    }

    if (current) {
      if (current.headers.length === 0) {
        delimiter = detectCsvDelimiter(line);
        current.headers = splitCsvLine(line, delimiter).map(normalizeHeader);
        continue;
      }
      current.rows.push(rowFromCells(current.headers, splitCsvLine(line, delimiter)));
      continue;
    }

    if (looseHeaders.length === 0) {
      delimiter = detectCsvDelimiter(line);
      looseHeaders = splitCsvLine(line, delimiter).map(normalizeHeader);
      continue;
    }
    looseRows.push(rowFromCells(looseHeaders, splitCsvLine(line, delimiter)));
  }

  return { magic, delimiter, sections, looseRows, looseHeaders };
}

export function sectionRows(
  document: ParsedTabularDocument,
  names: string[],
): TabularRow[] {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const fromSections = document.sections
    .filter((section) => wanted.has(section.name))
    .flatMap((section) => section.rows);
  if (fromSections.length > 0) return fromSections;
  return document.looseRows;
}

export function firstValue(row: TabularRow, aliases: string[]): string {
  const wanted = aliases.map(normalizeHeader);
  for (const key of wanted) {
    if (row[key]) return row[key];
  }
  return "";
}
