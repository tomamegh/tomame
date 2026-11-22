import { describe, expect, it } from "vitest";

import {
  formatDimensions,
  formatLbs,
  groupByRecipient,
  packageWeight,
  recipientLines,
  recipientPlace,
  sealBlocker,
  packageExceptions,
} from "../components/format";
import { cityCode } from "../label/package-label";
import type { WarehouseItem, WarehouseRecipient } from "../types";

const recipient = (over: Partial<WarehouseRecipient> = {}): WarehouseRecipient => ({
  name: "Ama Mensah",
  phone: "+233241234567",
  kind: "door",
  line1: "12 Oxford St",
  line2: null,
  area: "Osu",
  city: "Accra",
  region: "Greater Accra",
  digital_address: "GA-123-4567",
  zone_name: "Accra Central",
  ...over,
});

describe("warehouse format", () => {
  it("prints weights without trailing zeros", () => {
    expect(formatLbs(3)).toBe("3 lb");
    expect(formatLbs(1.25)).toBe("1.25 lb");
    expect(formatLbs(1.5, 1)).toBe("1.5 lb");
    expect(formatLbs(null)).toBe("–");
  });

  it("prefers the scale over the estimate and says which it is", () => {
    expect(packageWeight({ weight_lbs: 4, estimated_weight_lbs: 3 })).toEqual({ value: 4, estimated: false });
    expect(packageWeight({ weight_lbs: null, estimated_weight_lbs: 3 })).toEqual({ value: 3, estimated: true });
    expect(packageWeight({ weight_lbs: null, estimated_weight_lbs: null })).toEqual({ value: null, estimated: false });
  });

  it("only prints a size when all three sides are known", () => {
    expect(formatDimensions({ length_in: 12, width_in: 10, height_in: 8 })).toBe("12 × 10 × 8 in");
    expect(formatDimensions({ length_in: 12, width_in: null, height_in: 8 })).toBeNull();
  });

  it("addresses a door and a pickup differently", () => {
    expect(recipientPlace(recipient())).toBe("Osu, Accra");
    expect(recipientLines(recipient())).toEqual(["12 Oxford St", "Osu, Accra", "Greater Accra", "GPS GA-123-4567"]);
    expect(recipientPlace(recipient({ kind: "pickup" }))).toBe("Pickup · Accra Central");
    expect(recipientLines(recipient({ kind: "pickup" }))).toEqual(["Pickup point: Accra Central"]);
  });

  it("refuses to seal an empty or held package, with the reason", () => {
    expect(sealBlocker({ status: "packing", line_count: 0, held_count: 0 })).toMatch(/at least one/);
    expect(sealBlocker({ status: "packing", line_count: 2, held_count: 1 })).toMatch(/1 item is on hold/);
    expect(sealBlocker({ status: "packing", line_count: 2, held_count: 0 })).toBeNull();
    expect(sealBlocker({ status: "sealed", line_count: 0, held_count: 0 })).toBeNull();
  });

  it("groups a bench by the person the items belong to", () => {
    const item = (id: string, key: string) => ({ order_id: id, customer_key: key, recipient: recipient() }) as WarehouseItem;
    const groups = groupByRecipient([item("a", "u1"), item("b", "u2"), item("c", "u1")]);
    expect(groups.map((g) => [g.key, g.items.map((i) => i.order_id)])).toEqual([
      ["u1", ["a", "c"]],
      ["u2", ["b"]],
    ]);
  });

  it("names the route's stops", () => {
    expect(cityCode("New York, USA")).toBe("NYC");
    expect(cityCode("Accra, Ghana")).toBe("ACC");
    expect(cityCode("Tamale")).toBe("TAM");
  });
});

describe("packageExceptions (112)", () => {
  const now = new Date("2026-11-22T12:00:00Z");
  const base = {
    id: "p", reference: "PKG-1", status: "sealed", line_count: 1, sealed_at: "2026-11-20T12:00:00Z", created_at: "2026-11-01T00:00:00Z",
    hold: null, finished_order_nos: [] as string[],
  };
  const pkg = (over: Record<string, unknown>) => ({ ...base, ...over }) as unknown as Parameters<typeof packageExceptions>[0][number];

  it("lists what cannot ship, then what has sat sealed a week, then held, then empty ones", () => {
    const list = packageExceptions(
      [
        pkg({ id: "fresh" }),
        pkg({ id: "stuck", reference: "PKG-10008", sealed_at: "2026-10-15T00:00:00Z" }),
        pkg({ id: "cannot", reference: "PKG-10021", finished_order_nos: ["TM-00022"], sealed_at: "2026-10-31T00:00:00Z" }),
        pkg({ id: "held", hold: { reason: "Repacking", at: "x", by_name: null }, sealed_at: "2026-10-01T00:00:00Z" }),
        pkg({ id: "empty", status: "packing", line_count: 0, sealed_at: null, created_at: "2026-10-05T00:00:00Z" }),
        pkg({ id: "new-empty", status: "packing", line_count: 0, sealed_at: null, created_at: "2026-11-22T11:00:00Z" }),
      ],
      now,
    );
    expect(list.map((e) => [e.pkg.id, e.kind])).toEqual([
      ["cannot", "cannot_ship"],
      ["stuck", "stuck"],
      ["held", "held"],
      ["empty", "empty"],
    ]);
    expect(list[1]!.age_days).toBe(38);
    expect(list[0]!.detail).toMatch(/TM-00022/);
  });
});
