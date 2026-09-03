import { describe, expect, it } from "vitest";
import { parseHtmlDocument } from "../../../lib/broker-adapters/html";

describe("browser HTML parsing", () => {
  it("uses DOMParser instead of a Node HTML package", () => {
    expect(typeof DOMParser).toBe("function");
    const doc = parseHtmlDocument(
      "<html><body><table class='x'><tr><td>ok</td></tr></table></body></html>",
    );
    expect(doc.querySelector("td")?.textContent).toBe("ok");
  });
});
