import { describe, it, expect } from "vitest";
import { isHtml } from "../components/policy-html";

describe("isHtml — which writer produced this policy", () => {
  it("recognises Tiptap output, which always opens with a block tag", () => {
    expect(isHtml("<p>All payments are processed through Paystack.</p>")).toBe(true);
    expect(isHtml("\n  <h2>Payment Policy</h2>")).toBe(true);
    expect(isHtml("<ul><li>MTN MoMo</li></ul>")).toBe(true);
  });

  it("recognises the seed's markdown, which is what every live policy is", () => {
    // This is the bug: all five policies came from supabase/seeds/policies.sql
    // and were being handed to dangerouslySetInnerHTML, so customers saw the
    // literal "###" and "**" on the page the pay button links to.
    expect(isHtml("All payments on Tomame are processed securely through **Paystack**.")).toBe(false);
    expect(isHtml("### Accepted Payment Methods")).toBe(false);
    expect(isHtml("- **MTN MoMo**\n- **Telecel Cash**")).toBe(false);
  });

  it("treats a markdown document opening with raw HTML as HTML, which renders the same either way", () => {
    expect(isHtml("<div>hello</div>\n\n### Then markdown")).toBe(true);
  });
});
