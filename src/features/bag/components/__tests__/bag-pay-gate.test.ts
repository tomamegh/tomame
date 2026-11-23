import { describe, expect, it } from "vitest";
import { bagPayGate } from "../bag-pay-gate";
import type { BagView } from "../../types";

const line = { id: "l1", pending: null, pricing: { total_ghs: 100 }, pay_hold: null, sourcing: null, freight_checking: false } as unknown as BagView["lines"][number];
function bag(overrides: Partial<BagView> = {}): BagView {
  return {
    lines: [line],
    has_unpriced_lines: false,
    has_sourcing_lines: false,
    has_pay_holds: false,
    has_pending_lines: false,
    has_freight_checks: false,
    delivery: { kind: "door", zone_name: "Greater Accra", fee_ghs: 0, address_id: null },
    ...overrides,
  } as unknown as BagView;
}
const contact = { first_name: "Ama", last_name: "Momo", phone: "+233551234987" };

describe("bagPayGate", () => {
  it("opens Pay for a signed-in customer with details, delivery and a MoMo number", () => {
    expect(bagPayGate({ bag: bag(), isSignedIn: true, contact, addresses: [], momoReady: true })).toEqual({ blocked: false, reason: null });
  });

  it("asks for the MoMo number last, after everything else is in place", () => {
    expect(bagPayGate({ bag: bag(), isSignedIn: true, contact, addresses: [], momoReady: false })).toEqual({
      blocked: true,
      reason: "Enter your Mobile Money number to pay.",
    });
  });

  it("names the delivery first when both delivery and the number are missing", () => {
    const gate = bagPayGate({ bag: bag({ delivery: null }), isSignedIn: true, contact, addresses: [], momoReady: false });
    expect(gate.blocked).toBe(true);
    expect(gate.reason).toMatch(/deliver/i);
  });

  it("keeps Pay live for a signed-out viewer, who is sent to sign in", () => {
    expect(bagPayGate({ bag: bag({ delivery: null }), isSignedIn: false, contact: null, addresses: [], momoReady: false }).blocked).toBe(false);
  });

  it("blocks an empty bag whoever is looking", () => {
    expect(bagPayGate({ bag: bag({ lines: [] }), isSignedIn: false, contact: null, addresses: [], momoReady: true }).blocked).toBe(true);
  });
});
