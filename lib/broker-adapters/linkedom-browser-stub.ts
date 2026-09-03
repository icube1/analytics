/** Client-bundler stand-in: browsers use DOMParser, never this package. */
export function parseHTML(_html: string): { document: Document } {
  throw new Error("server HTML parser is not part of the web bundle");
}
