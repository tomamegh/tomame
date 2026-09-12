import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// The only data dependency: the service-role client. Migration 041 adds no
// client UPDATE policy on notifications, so every write here goes through this
// client *after* the service has checked ownership — which is exactly what
// these tests exercise.
const createAdminClient = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => createAdminClient() }));

import {
  markNotificationRead,
  markAllNotificationsRead,
  countUnreadNotifications,
  listUserNotifications,
} from "../notifications.service";
import { APIError } from "@/lib/auth/api-helpers";
import type { PlatformUser } from "@/features/users/types";

// ── In-memory stand-in for the PostgREST builder ──────────────────────────────
// Supports exactly the chain shapes the service uses: select/update + eq/is +
// order + maybeSingle, plus `{ count: "exact", head: true }`.

interface Row {
  id: string;
  user_id: string;
  read_at: string | null;
  [key: string]: unknown;
}

function makeClient(rows: Row[]) {
  return {
    from() {
      const filters: ((r: Row) => boolean)[] = [];
      let patch: Partial<Row> | null = null;
      let headOnly = false;
      let counting = false;

      const match = () => rows.filter((r) => filters.every((f) => f(r)));

      const resolve = () => {
        const matched = match();
        if (patch) {
          for (const r of matched) Object.assign(r, patch);
          return { data: matched.map((r) => ({ ...r })), error: null, count: null };
        }
        if (headOnly) return { data: null, error: null, count: matched.length };
        return { data: matched.map((r) => ({ ...r })), error: null, count: counting ? matched.length : null };
      };

      const builder = {
        select(_cols?: string, opts?: { count?: string; head?: boolean }) {
          if (opts?.count) counting = true;
          if (opts?.head) headOnly = true;
          return builder;
        },
        update(p: Partial<Row>) {
          patch = p;
          return builder;
        },
        eq(col: string, val: unknown) {
          filters.push((r) => r[col] === val);
          return builder;
        },
        is(col: string, val: unknown) {
          filters.push((r) => r[col] === val);
          return builder;
        },
        order() {
          return builder;
        },
        maybeSingle() {
          const matched = match();
          return Promise.resolve({ data: matched[0] ? { ...matched[0] } : null, error: null });
        },
        // PostgREST builders are thenable; awaiting one runs the query.
        then<T>(onFulfilled: (v: ReturnType<typeof resolve>) => T) {
          return Promise.resolve(resolve()).then(onFulfilled);
        },
      };
      return builder;
    },
  };
}

const ME = "11111111-1111-1111-1111-111111111111";
const SOMEONE_ELSE = "22222222-2222-2222-2222-222222222222";

const me = { id: ME, profile: { role: "customer" } } as unknown as PlatformUser;

function notification(over: Partial<Row> & { id: string }): Row {
  return {
    user_id: ME,
    channel: "email",
    event: "order_placed",
    payload: {},
    status: "sent",
    created_at: "2026-09-01T00:00:00.000Z",
    sent_at: null,
    read_at: null,
    ...over,
  };
}

let rows: Row[];

beforeEach(() => {
  rows = [];
  createAdminClient.mockImplementation(() => makeClient(rows));
});

describe("markNotificationRead", () => {
  it("marks the caller's own unread notification read", async () => {
    rows = [notification({ id: "a" })];
    const result = await markNotificationRead(me, "a");

    expect(result.already_read).toBe(false);
    expect(result.read_at).toBeTruthy();
    expect(rows[0]?.read_at).toBe(result.read_at);
  });

  it("404s on another user's notification and leaves it untouched", async () => {
    rows = [notification({ id: "a", user_id: SOMEONE_ELSE })];

    await expect(markNotificationRead(me, "a")).rejects.toMatchObject({
      statusCode: 404,
      message: "Notification not found",
    });
    // Not 403: a 403 would confirm the id exists.
    await expect(markNotificationRead(me, "a")).rejects.toBeInstanceOf(APIError);
    expect(rows[0]?.read_at).toBeNull();
  });

  it("404s identically for a notification that does not exist", async () => {
    rows = [];
    const missing = await markNotificationRead(me, "nope").catch((e: APIError) => e);
    rows = [notification({ id: "a", user_id: SOMEONE_ELSE })];
    const foreign = await markNotificationRead(me, "a").catch((e: APIError) => e);

    // Indistinguishable responses — no existence leak.
    expect((missing as APIError).statusCode).toBe((foreign as APIError).statusCode);
    expect((missing as APIError).message).toBe((foreign as APIError).message);
  });

  it("is idempotent: a re-mark succeeds without moving read_at", async () => {
    rows = [notification({ id: "a" })];
    const first = await markNotificationRead(me, "a");

    const second = await markNotificationRead(me, "a");

    expect(second.already_read).toBe(true);
    expect(second.read_at).toBe(first.read_at);
    expect(rows[0]?.read_at).toBe(first.read_at);
  });
});

describe("markAllNotificationsRead", () => {
  it("marks only the caller's unread rows and reports the count", async () => {
    rows = [
      notification({ id: "a" }),
      notification({ id: "b" }),
      notification({ id: "c", read_at: "2026-09-02T00:00:00.000Z" }),
      notification({ id: "d", user_id: SOMEONE_ELSE }),
    ];

    const result = await markAllNotificationsRead(me);

    expect(result.updated).toBe(2);
    expect(rows.find((r) => r.id === "c")?.read_at).toBe("2026-09-02T00:00:00.000Z");
    expect(rows.find((r) => r.id === "d")?.read_at).toBeNull();
  });

  it("is idempotent: a second call updates nothing", async () => {
    rows = [notification({ id: "a" })];

    expect((await markAllNotificationsRead(me)).updated).toBe(1);
    expect((await markAllNotificationsRead(me)).updated).toBe(0);
  });
});

describe("unread count", () => {
  it("excludes read rows and other users' rows", async () => {
    rows = [
      notification({ id: "a" }),
      notification({ id: "b", read_at: "2026-09-02T00:00:00.000Z" }),
      notification({ id: "c", user_id: SOMEONE_ELSE }),
    ];

    expect(await countUnreadNotifications(me)).toBe(1);
  });

  it("drops to zero after read-all", async () => {
    rows = [notification({ id: "a" }), notification({ id: "b" })];
    await markAllNotificationsRead(me);

    expect(await countUnreadNotifications(me)).toBe(0);
  });

  it("rides along with the list without changing what `count` means", async () => {
    rows = [
      notification({ id: "a" }),
      notification({ id: "b", read_at: "2026-09-02T00:00:00.000Z" }),
    ];

    const list = await listUserNotifications(me);

    expect(list.count).toBe(2); // still the total
    expect(list.unread_count).toBe(1);
    expect(list.notifications).toHaveLength(2);
  });
});
