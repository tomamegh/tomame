import crypto from "crypto";

/**
 * A minimal in-memory stand-in for the Supabase query builder.
 *
 * It exists so the payment tests can exercise the real conditional-update
 * semantics rather than assert on which functions were called: an update
 * carrying `.eq("status", "pending")` matches nothing once the row has moved on,
 * which is exactly the guard the callback/webhook race depends on.
 */

export type Row = Record<string, unknown>;

export type TableName = "payments" | "orders" | "order_groups" | "car_orders" | "car_listings";

export type FakeDb = Partial<Record<TableName, Row[]>> & { payments: Row[] } & {
  /** Set to make subsequent writes fail, as a dropped connection would. */
  failWrites?: boolean;
  /**
   * Tables to answer as if the migration that creates them has not been applied.
   *
   * Listing one here is not the same as leaving it empty: an empty table is a
   * successful read of nothing, and a MISSING table is SQLSTATE 42P01, which
   * `isSchemaMissingError` recognises and callers are entitled to treat
   * differently. The car pass of the reconciliation job does exactly that — 068
   * is not applied everywhere and the sweep settles real money for orders and
   * bags every five minutes — so the difference has to be expressible here.
   */
  missingTables?: TableName[];
};

interface Result {
  data: Row | Row[] | null;
  error: { code: string; message: string } | null;
}

/** Supports plain columns and Supabase's `col->>json_key` arrow syntax. */
function readColumn(row: Row, column: string): unknown {
  const [col, key] = column.split("->>");
  if (col === undefined) return undefined;
  if (key === undefined) return row[col];
  const nested = row[col] as Record<string, unknown> | null | undefined;
  return nested?.[key];
}

class FakeQuery implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" = "select";
  private payload: Row | null = null;
  private predicates: Array<(row: Row) => boolean> = [];
  private sort: { column: string; ascending: boolean } | null = null;
  private take: number | null = null;

  constructor(
    private readonly db: FakeDb,
    private readonly table: TableName,
  ) {}

  select(_columns?: string): this {
    return this;
  }

  insert(row: Row): this {
    this.op = "insert";
    this.payload = row;
    return this;
  }

  update(row: Row): this {
    this.op = "update";
    this.payload = row;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.predicates.push((row) => readColumn(row, column) === value);
    return this;
  }

  neq(column: string, value: unknown): this {
    this.predicates.push((row) => readColumn(row, column) !== value);
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.predicates.push((row) => values.includes(readColumn(row, column)));
    return this;
  }

  /** `lt` on ISO timestamps and numbers alike — string comparison is fine for ISO. */
  lt(column: string, value: unknown): this {
    this.predicates.push((row) => {
      const v = readColumn(row, column);
      return v != null && (v as string | number) < (value as string | number);
    });
    return this;
  }

  is(column: string, value: null | boolean): this {
    this.predicates.push((row) => (readColumn(row, column) ?? null) === value);
    return this;
  }

  filter(column: string, _operator: string, value: unknown): this {
    this.predicates.push((row) => readColumn(row, column) === value);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.sort = { column, ascending: options?.ascending ?? true };
    return this;
  }

  limit(count: number): this {
    this.take = count;
    return this;
  }

  /** 42P01, or null when the table exists. Checked before any operation. */
  private missing(): Result | null {
    return this.db.missingTables?.includes(this.table)
      ? {
          data: null,
          error: { code: "42P01", message: `relation "public.${this.table}" does not exist` },
        }
      : null;
  }

  private matches(): Row[] {
    const rows = (this.db[this.table] ??= []);

    if (this.op === "insert") {
      const inserted: Row = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        channel: null,
        ...this.payload,
      };
      rows.push(inserted);
      return [inserted];
    }

    let matched = rows.filter((row) => this.predicates.every((p) => p(row)));

    if (this.op === "update") {
      matched.forEach((row) => Object.assign(row, this.payload));
      return matched;
    }

    if (this.sort) {
      const { column, ascending } = this.sort;
      matched = [...matched].sort((a, b) => {
        const av = String(readColumn(a, column) ?? "");
        const bv = String(readColumn(b, column) ?? "");
        return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }

    return this.take === null ? matched : matched.slice(0, this.take);
  }

  /** Errors unless exactly one row matched, as PostgREST does. */
  async single(): Promise<Result> {
    const missing = this.missing();
    if (missing) return missing;
    const matched = this.matches();
    const [row] = matched;
    if (matched.length !== 1 || !row) {
      return {
        data: null,
        error: { code: "PGRST116", message: `expected 1 row, got ${matched.length}` },
      };
    }
    return { data: row, error: null };
  }

  async maybeSingle(): Promise<Result> {
    const missing = this.missing();
    if (missing) return missing;
    if (this.db.failWrites && this.op !== "select") {
      return { data: null, error: { code: "57P01", message: "connection lost" } };
    }
    const matched = this.matches();
    return { data: matched[0] ?? null, error: null };
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    // The same dropped-connection switch `maybeSingle` honours. It belongs here
    // too: a guarded UPDATE that ends in `.select("id")` is awaited directly
    // rather than through `maybeSingle` (`updateCarOrderStatus`), and without
    // this a failed write would come back as "no rows matched" — which the money
    // path reads as "somebody else already settled it" and skips the effects.
    // Distinguishing those two is the point of the whole mechanism.
    const result: Result =
      this.missing() ??
      (this.db.failWrites && this.op !== "select"
        ? { data: null, error: { code: "57P01", message: "connection lost" } }
        : { data: this.matches(), error: null });
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

export function createFakeClient(db: FakeDb) {
  return {
    from: (table: TableName) => new FakeQuery(db, table),
  };
}
