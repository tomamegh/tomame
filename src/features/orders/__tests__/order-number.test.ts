import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `orders.order_no` — the number a customer reads aloud on WhatsApp (050).
 *
 * The assignment itself is a Postgres DEFAULT over a sequence, so what can be
 * tested here is (a) the RULE the backfill applies, restated below so a change
 * on either side shows up as a failure, and (b) the migration's own invariants,
 * asserted against the SQL text. Both halves exist because the dangerous failure
 * is silent: a backfill that numbers the newest order TM-00001 looks fine until
 * two customers compare receipts.
 */

const MIGRATION = readFileSync(
  join(process.cwd(), "supabase/migrations/050_journeys.sql"),
  "utf8",
);

// ── (a) The rule ────────────────────────────────────────────────────────────

interface Row {
  id: string;
  created_at: string;
}

/**
 * A restatement of the migration's backfill:
 * `row_number() OVER (ORDER BY created_at, id)` → `'TM-' || lpad(n, 5, '0')`.
 */
function backfill(rows: readonly Row[]): Map<string, string> {
  const ordered = [...rows].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  return new Map(ordered.map((row, index) => [row.id, formatOrderNo(index + 1)]));
}

function formatOrderNo(sequence: number): string {
  return `TM-${String(sequence).padStart(5, "0")}`;
}

describe("order number format", () => {
  it("pads to five digits", () => {
    expect(formatOrderNo(1)).toBe("TM-00001");
    expect(formatOrderNo(42)).toBe("TM-00042");
    expect(formatOrderNo(99_999)).toBe("TM-99999");
  });

  it("grows a digit rather than wrapping or truncating past 99,999", () => {
    expect(formatOrderNo(100_000)).toBe("TM-100000");
  });
});

describe("order number backfill", () => {
  const rows: Row[] = [
    { id: "c", created_at: "2026-09-11T03:50:37Z" },
    { id: "a", created_at: "2026-08-13T03:50:37Z" },
    { id: "b", created_at: "2026-09-03T03:50:37Z" },
  ];

  it("numbers the OLDEST order first", () => {
    const numbers = backfill(rows);
    expect(numbers.get("a")).toBe("TM-00001");
    expect(numbers.get("b")).toBe("TM-00002");
    expect(numbers.get("c")).toBe("TM-00003");
  });

  it("is deterministic: the same rows in any input order give the same numbers", () => {
    const forwards = backfill(rows);
    const backwards = backfill([...rows].reverse());
    expect([...backwards.entries()].sort()).toEqual([...forwards.entries()].sort());
  });

  it("breaks a created_at tie by id, so two rows in one millisecond cannot collide", () => {
    const tied: Row[] = [
      { id: "zzz", created_at: "2026-09-13T03:38:30.911281Z" },
      { id: "aaa", created_at: "2026-09-13T03:38:30.911281Z" },
    ];
    const numbers = backfill(tied);
    expect(numbers.get("aaa")).toBe("TM-00001");
    expect(numbers.get("zzz")).toBe("TM-00002");
    expect(new Set(numbers.values()).size).toBe(2);
  });

  it("assigns a unique number to every row", () => {
    const many = Array.from({ length: 250 }, (_, i) => ({
      id: `id-${i}`,
      created_at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
    }));
    expect(new Set(backfill(many).values()).size).toBe(250);
  });
});

// ── (b) The migration's own invariants ──────────────────────────────────────

describe("migration 050 — order_no", () => {
  it("wraps everything in one transaction", () => {
    // The leading comment block is fine; what matters is that BEGIN comes
    // before the first statement and COMMIT is the last thing in the file.
    const firstStatement = MIGRATION.split("\n").findIndex(
      (line) => line.trim().length > 0 && !line.trim().startsWith("--"),
    );
    expect(MIGRATION.split("\n")[firstStatement]!.trim()).toBe("BEGIN;");
    expect(MIGRATION.trimEnd().endsWith("COMMIT;")).toBe(true);
  });

  it("backfills in (created_at, id) order — not by calling nextval() inside an UPDATE", () => {
    expect(MIGRATION).toContain("row_number() OVER (ORDER BY created_at, id)");
    expect(MIGRATION).toContain("lpad(ordered.rn::text, 5, '0')");
  });

  it("parks the sequence past the backfilled block", () => {
    expect(MIGRATION).toContain("setval(");
    expect(MIGRATION).toContain("order_no_seq");
  });

  it("grants the sequence to the role that actually inserts orders", () => {
    // Order creation runs as `authenticated` under the "users can insert own
    // orders" policy; without USAGE the DEFAULT answers 42501 on every insert.
    expect(MIGRATION).toMatch(
      /GRANT USAGE, SELECT ON SEQUENCE order_no_seq TO authenticated, service_role;/,
    );
  });

  it("makes the column unique and NOT NULL, and gives it a default", () => {
    expect(MIGRATION).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_order_no");
    expect(MIGRATION).toContain("ALTER COLUMN order_no SET NOT NULL");
    expect(MIGRATION).toContain("ALTER COLUMN order_no SET DEFAULT");
  });
});

describe("migration 050 — order_events", () => {
  it("enables RLS and declares its GRANTs explicitly", () => {
    expect(MIGRATION).toContain("ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;");
    expect(MIGRATION).toContain("GRANT SELECT ON order_events TO authenticated;");
    expect(MIGRATION).toContain("GRANT ALL ON order_events TO service_role;");
  });

  it("gives `authenticated` no write policy — every write is the server's", () => {
    const writePolicy = /CREATE POLICY[^;]*ON order_events FOR (INSERT|UPDATE|DELETE|ALL)/i;
    expect(writePolicy.test(MIGRATION)).toBe(false);
  });

  it("scopes the owner's read to their own order AND to visible rows only", () => {
    expect(MIGRATION).toContain("is_customer_visible\n    AND EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND o.user_id = auth.uid())");
  });

  it("indexes the one query the timeline makes", () => {
    expect(MIGRATION).toContain("ON order_events (order_id, occurred_at DESC)");
  });
});

describe("migration 050 — the ETA window", () => {
  it("adds the window to both tables and keeps the legacy single date", () => {
    expect(MIGRATION).toMatch(/ALTER TABLE orders\n\s+ADD COLUMN IF NOT EXISTS eta_from DATE/);
    expect(MIGRATION).toMatch(/ALTER TABLE order_deliveries\n\s+ADD COLUMN IF NOT EXISTS eta_from DATE/);
    expect(MIGRATION).not.toContain("DROP COLUMN estimated_delivery_date");
  });

  it("refuses a backwards window at the column", () => {
    expect(MIGRATION).toContain("CHECK (eta_from IS NULL OR eta_to IS NULL OR eta_to >= eta_from)");
  });
});
