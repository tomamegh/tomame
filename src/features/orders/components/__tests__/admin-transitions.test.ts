import { describe, expect, it } from "vitest";

import { ORDER_STATUSES } from "@/config/constants";
import {
  adminStatusLabel,
  adminStatusTone,
  mayEditEtaWindow,
  transitionsFor,
} from "../admin-transitions";

/**
 * These tests pin the mirror of `ALLOWED_TRANSITIONS`.
 *
 * The service's table is module-private, so nothing can assert the two are equal
 * at runtime. What CAN be asserted is the shape a drift would break: every
 * status has a decision, no status offers a transition into itself, and the two
 * terminal statuses offer nothing at all. A future edge added to the service and
 * forgotten here shows up as a status with no controls, which these tests make
 * visible the moment someone reads them.
 */
const CONTEXT = { hasSuccessfulPayment: false, needsReview: false };

describe("transitionsFor", () => {
  it("walks the pipeline one stop at a time", () => {
    expect(transitionsFor("paid", CONTEXT).map((t) => t.to)).toEqual(["processing"]);
    expect(transitionsFor("processing", CONTEXT).map((t) => t.to)).toEqual(["in_transit"]);
    expect(transitionsFor("in_transit", CONTEXT).map((t) => t.to)).toEqual(["delivered"]);
    expect(transitionsFor("delivered", CONTEXT).map((t) => t.to)).toEqual(["completed"]);
  });

  it("offers cancellation only from pending, and only while nothing has been paid", () => {
    expect(transitionsFor("pending", CONTEXT).map((t) => t.to)).toEqual(["cancelled"]);
    expect(
      transitionsFor("pending", { ...CONTEXT, hasSuccessfulPayment: true }),
    ).toEqual([]);
    // Cancellation is not reachable from anywhere else in the machine.
    for (const status of ["paid", "processing", "in_transit", "delivered"]) {
      expect(transitionsFor(status, CONTEXT).some((t) => t.to === "cancelled")).toBe(false);
    }
  });

  it("withholds every pipeline control while an order is still awaiting review", () => {
    for (const status of Object.values(ORDER_STATUSES)) {
      expect(transitionsFor(status, { ...CONTEXT, needsReview: true })).toEqual([]);
    }
  });

  it("offers nothing from a terminal status or an unknown one", () => {
    expect(transitionsFor("completed", CONTEXT)).toEqual([]);
    expect(transitionsFor("cancelled", CONTEXT)).toEqual([]);
    expect(transitionsFor("refunded", CONTEXT)).toEqual([]);
    // Prototype keys must fall through to "nothing", not to Object.prototype.
    expect(transitionsFor("constructor", CONTEXT)).toEqual([]);
    expect(transitionsFor("toString", CONTEXT)).toEqual([]);
  });

  it("never offers a transition into the status the order is already in", () => {
    for (const status of Object.values(ORDER_STATUSES)) {
      expect(transitionsFor(status, CONTEXT).some((t) => t.to === status)).toBe(false);
    }
  });

  it("marks only the shipping transition as the one that carries tracking", () => {
    const carriers = Object.values(ORDER_STATUSES).flatMap((status) =>
      transitionsFor(status, CONTEXT).filter((t) => t.carriesTracking).map((t) => t.to),
    );
    expect(carriers).toEqual(["in_transit"]);
  });
});

describe("mayEditEtaWindow", () => {
  it("is closed before payment and after cancellation, open in between", () => {
    expect(mayEditEtaWindow("pending")).toBe(false);
    expect(mayEditEtaWindow("cancelled")).toBe(false);
    expect(mayEditEtaWindow("paid")).toBe(true);
    expect(mayEditEtaWindow("processing")).toBe(true);
    expect(mayEditEtaWindow("in_transit")).toBe(true);
    expect(mayEditEtaWindow("delivered")).toBe(true);
  });
});

describe("adminStatusTone / adminStatusLabel", () => {
  it("reads the customer's vocabulary rather than inventing one", () => {
    expect(adminStatusLabel("processing")).toBe("Being purchased");
    expect(adminStatusLabel("in_transit")).toBe("In the air");
    expect(adminStatusLabel("pending")).toBe("Awaiting payment");
  });

  it("maps the journey's tones onto the admin kit's, muting what is off the track", () => {
    expect(adminStatusTone("pending")).toBe("amber");
    expect(adminStatusTone("processing")).toBe("coral");
    expect(adminStatusTone("delivered")).toBe("green");
    expect(adminStatusTone("cancelled")).toBe("muted");
    expect(adminStatusTone("not-a-status")).toBe("muted");
  });
});
