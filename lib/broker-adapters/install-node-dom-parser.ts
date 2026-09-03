import { parseHTML } from "linkedom";

/** Node-only DOMParser stand-in. Must not be imported from client modules. */
export function installNodeDomParser(): void {
  if (typeof globalThis.DOMParser === "function") return;

  globalThis.DOMParser = class DOMParser {
    parseFromString(markup: string, _type?: string): Document {
      return parseHTML(markup).document as unknown as Document;
    }
  } as typeof DOMParser;
}

installNodeDomParser();
