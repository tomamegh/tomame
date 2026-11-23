import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import type { Order } from "../../types";
import { AdminOrderOps } from "../admin-order-ops";

const paid = {
  id: "78ff6e0e-3aa5-4c76-b9e5-0854d853bf9a",
  order_no: "TM-00051",
  status: "paid",
  needs_review: false,
  held_at: null,
  origin_country: "USA",
  extraction_metadata: { product: { price: 11.24, currency: "USD", title: "Jarrow Zinc Balance 15 mg" } },
} as unknown as Order;

/** The purchase button, as rendered: its attributes and label. */
function purchaseButton(html: string): string {
  return html.match(/<button[^>]*>(?:(?!<\/button>).)*Mark (?:as purchased|\d+ orders purchased)(?:(?!<\/button>).)*<\/button>/)?.[0] ?? "";
}

describe("Mark as purchased — never blocked by an empty form (20-23 Nov)", () => {
  it("is enabled with no store price and no tracking", () => {
    const html = renderToStaticMarkup(<AdminOrderOps order={paid} hasSuccessfulPayment />);
    const button = purchaseButton(html);
    expect(button).not.toBe("");
    expect(button).not.toMatch(/\sdisabled(=""|\s|>)/);
    expect(html).toContain("(optional)");
    expect(html).toContain("Same as quoted");
  });

  it("offers the rest of the same checkout", () => {
    const html = renderToStaticMarkup(
      <AdminOrderOps
        order={paid}
        hasSuccessfulPayment
        purchasableSiblings={[
          { id: "bc0a487d-042c-4522-bbcc-50a76264ae42", order_no: "TM-00052", title: "Quality of Life Kinoko Gold AHCC" },
          { id: "16722f05-2006-4752-b4f0-b49d4889c265", order_no: "TM-00053", title: "Qunol Magnesium 420mg" },
        ]}
      />,
    );
    expect(html).toContain("Mark these from the same checkout too");
    expect(html).toContain("TM-00052");
    expect(html).toContain("Tick all 2");
  });
});
