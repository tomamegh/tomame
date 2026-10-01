import { describe, expect, it, vi } from "vitest";

// The service is server-only; stub its dependencies so its pure `normaliseCode`
// can be compared with the guide's client-side copy.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/features/orders/services/order-events.service", () => ({ recordOrderEvent: vi.fn() }));
vi.mock("@/features/orders/services/orders.service", () => ({ advanceOrderFromWarehouse: vi.fn() }));
vi.mock("@/db/queries/order-feedback", () => ({ listOrderFeedback: vi.fn() }));
vi.mock("@/db/queries/warehouse", () => ({}));
vi.mock("@/db/queries/inbound-parcels", () => ({}));
vi.mock("@/features/warehouse/services/activity.service", () => ({ recordWarehouseActivity: vi.fn() }));

import { normaliseCode } from "@/features/warehouse/services/warehouse.service";

import { explainCode, readCode } from "../codes";

const SAMPLES = [
  "pkg-10042",
  " PKG10042 ",
  "PKG-042",
  "pkg 10042",
  "https://tomame.ca/warehouse/p/PKG-10042",
  "http://localhost:3000/warehouse/p/pkg-10042?x=1",
  "https://tomame.ca/warehouse/p/PKG%2D10042",
  "tm-42",
  "TM00042",
  "tm 7",
  "10042",
  "1234",
  "0012345678905",
  "9400 1118 9922 3197 4284 90",
  "hello",
  "",
  "   ",
];

describe("readCode matches the Scan screen's normaliseCode", () => {
  it.each(SAMPLES)("reads %j the same way", (raw) => {
    expect(readCode(raw)).toBe(normaliseCode(raw));
  });
});

describe("explainCode", () => {
  it("names what a code opens", () => {
    expect(explainCode("pkg 10042")).toEqual({ kind: "package", code: "PKG-10042" });
    expect(explainCode("tm-42")).toEqual({ kind: "order", code: "TM-00042" });
    expect(explainCode("hello")).toEqual({ kind: "unknown", code: "HELLO" });
    expect(explainCode("1z999aa10123456784")).toEqual({ kind: "carrier", code: "1Z999AA10123456784", carrier: "UPS" });
    expect(explainCode("  ")).toEqual({ kind: "empty" });
  });
});
