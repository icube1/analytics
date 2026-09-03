/** Vite alias target so `linkedom` never enters the SPA graph. */
export function parseHTML(_html: string): { document: Document } {
  throw new Error("server HTML parser is not part of the web bundle");
}
