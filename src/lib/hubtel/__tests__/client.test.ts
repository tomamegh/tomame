import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/env", () => ({
  env: {
    hubtel: {
      apiId: "test-api-id",
      apiKey: "test-api-key",
      merchantAccountNumber: "2019940",
      callbackSecret: "a".repeat(64),
      rmpBaseUrl: "https://rmp.hubtel.test",
      statusBaseUrl: "https://status.hubtel.test",
    },
    app: { url: "https://tomame.test" },
  },
}));

import {
  normalizeMsisdn,
  pesewasToGhs,
  generatePaymentReference,
  isValidCallbackSecret,
  receiveMobileMoney,
  getTransactionStatus,
  HUBTEL_CHANNELS,
} from "@/lib/hubtel/client";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The single fetch call made by the function under test. */
function fetchCall() {
  const call = fetchMock.mock.calls[0];
  if (!call) throw new Error("fetch was never called");
  return {
    url: call[0] as string,
    init: (call[1] ?? {}) as {
      method?: string;
      body: string;
      headers: Record<string, string>;
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

// ── normalizeMsisdn ───────────────────────────────────────────────────────────

describe("normalizeMsisdn", () => {
  it("passes through a local 10-digit number", () => {
    expect(normalizeMsisdn("0244000000")).toBe("0244000000");
  });

  it("converts +233 and 233 prefixes to the local form", () => {
    expect(normalizeMsisdn("+233244000000")).toBe("0244000000");
    expect(normalizeMsisdn("233244000000")).toBe("0244000000");
  });

  it("strips spaces, dashes and parentheses", () => {
    expect(normalizeMsisdn("024 400 0000")).toBe("0244000000");
    expect(normalizeMsisdn("+233 (24) 400-0000")).toBe("0244000000");
  });

  it("accepts a bare 9-digit subscriber number", () => {
    expect(normalizeMsisdn("244000000")).toBe("0244000000");
  });

  it("rejects numbers that are not plausible Ghanaian mobiles", () => {
    expect(normalizeMsisdn("")).toBeNull();
    expect(normalizeMsisdn("12345")).toBeNull();
    expect(normalizeMsisdn("02440000001234")).toBeNull();
    expect(normalizeMsisdn("+15551234567")).toBeNull();
  });
});

// ── Amount conversion ─────────────────────────────────────────────────────────

describe("pesewasToGhs", () => {
  it("converts pesewas to a GHS decimal", () => {
    expect(pesewasToGhs(25075)).toBe(250.75);
    expect(pesewasToGhs(100)).toBe(1);
    expect(pesewasToGhs(1)).toBe(0.01);
  });
});

describe("generatePaymentReference", () => {
  it("matches the TOM_<timestamp>_<hex> shape the schema validates", () => {
    expect(generatePaymentReference()).toMatch(/^TOM_\d+_[a-f0-9]+$/);
  });

  it("is unique across calls", () => {
    const refs = new Set(Array.from({ length: 50 }, generatePaymentReference));
    expect(refs.size).toBe(50);
  });
});

// ── Callback secret ───────────────────────────────────────────────────────────

describe("isValidCallbackSecret", () => {
  it("accepts the configured secret", () => {
    expect(isValidCallbackSecret("a".repeat(64))).toBe(true);
  });

  it("rejects a wrong secret of equal length", () => {
    expect(isValidCallbackSecret("b".repeat(64))).toBe(false);
  });

  it("rejects a secret of a different length without throwing", () => {
    expect(isValidCallbackSecret("short")).toBe(false);
    expect(isValidCallbackSecret("")).toBe(false);
  });
});

// ── receiveMobileMoney ────────────────────────────────────────────────────────

describe("receiveMobileMoney", () => {
  const params = {
    amount: 250.75,
    customerName: "Ama Mensah",
    customerEmail: "ama@example.com",
    customerMsisdn: "0244000000",
    channel: HUBTEL_CHANNELS.MTN,
    description: "Tomame order",
    clientReference: "TOM_1_abcdef",
    primaryCallbackUrl: "https://tomame.test/api/payments/webhook/hubtel/secret",
  };

  it("posts to the merchant receive endpoint with Basic auth", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ResponseCode: "0001", Data: { TransactionId: "tx-1" } }),
    );

    await receiveMobileMoney(params);

    const { url, init } = fetchCall();
    expect(url).toBe(
      "https://rmp.hubtel.test/merchantaccount/merchants/2019940/receive/mobilemoney",
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from("test-api-id:test-api-key").toString("base64")}`,
    );
  });

  it("sends the client reference as an idempotency key so a retry cannot double-charge", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ResponseCode: "0001" }));

    await receiveMobileMoney(params);

    const { init } = fetchCall();
    expect(init.headers["Idempotency-Key"]).toBe("TOM_1_abcdef");
    expect(init.headers["X-Idempotency-Key"]).toBe("TOM_1_abcdef");
    // Hubtel's own de-duplication key travels in the body.
    expect(JSON.parse(init.body).ClientReference).toBe("TOM_1_abcdef");
  });

  it("omits the idempotency key on read-only status checks", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ responseCode: "0000", data: { status: "Paid" } }),
    );

    await getTransactionStatus("TOM_1_abcdef");

    expect(fetchCall().init.headers["Idempotency-Key"]).toBeUndefined();
  });

  it("sends Hubtel's PascalCase field names and a GHS decimal amount", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ResponseCode: "0001" }));

    await receiveMobileMoney(params);

    const body = JSON.parse(fetchCall().init.body);
    expect(body).toEqual({
      CustomerName: "Ama Mensah",
      CustomerEmail: "ama@example.com",
      CustomerMsisdn: "0244000000",
      Channel: "mtn-gh",
      Amount: 250.75,
      PrimaryCallbackUrl: params.primaryCallbackUrl,
      Description: "Tomame order",
      ClientReference: "TOM_1_abcdef",
    });
  });

  it("maps 0001 to pending — the prompt is on the handset, not paid", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ResponseCode: "0001",
        Message: "accepted",
        Data: { TransactionId: "tx-9", Amount: 250.75 },
      }),
    );

    const result = await receiveMobileMoney(params);

    expect(result.state).toBe("pending");
    expect(result.transactionId).toBe("tx-9");
    expect(result.amount).toBe(250.75);
  });

  it("maps an unknown response code to failed", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ResponseCode: "2001", Message: "Insufficient balance" }),
    );

    const result = await receiveMobileMoney(params);

    expect(result.state).toBe("failed");
    expect(result.message).toBe("Insufficient balance");
  });

  it("surfaces a coded 4xx rejection as a failed result, not a throw", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ResponseCode: "4000", Message: "Invalid channel" }, 400),
    );

    const result = await receiveMobileMoney(params);

    expect(result.state).toBe("failed");
    expect(result.responseCode).toBe("4000");
  });

  it("throws when the provider fails without a response code", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "gateway down" }, 502));

    await expect(receiveMobileMoney(params)).rejects.toThrow(
      "Hubtel API error: 502",
    );
  });

  it("throws on a non-JSON body rather than guessing a state", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "<html>maintenance</html>",
    });

    await expect(receiveMobileMoney(params)).rejects.toThrow("Hubtel API error");
  });
});

// ── getTransactionStatus ──────────────────────────────────────────────────────

describe("getTransactionStatus", () => {
  it("queries the status host with the client reference", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ responseCode: "0000", data: { status: "Paid" } }),
    );

    await getTransactionStatus("TOM_1_abcdef");

    expect(fetchCall().url).toBe(
      "https://status.hubtel.test/transactions/2019940/status?clientReference=TOM_1_abcdef",
    );
  });

  it("treats only a Paid status as success", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        responseCode: "0000",
        data: { status: "Paid", transactionId: "tx-2", amount: 250.75 },
      }),
    );

    const result = await getTransactionStatus("TOM_1_abcdef");

    expect(result.state).toBe("success");
    expect(result.transactionId).toBe("tx-2");
    expect(result.amount).toBe(250.75);
  });

  it("treats Pending as pending", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ responseCode: "0001", data: { status: "Pending" } }),
    );

    expect((await getTransactionStatus("TOM_1_a")).state).toBe("pending");
  });

  it("treats a pending response code with no status as pending", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ responseCode: "0005", data: null }));

    expect((await getTransactionStatus("TOM_1_a")).state).toBe("pending");
  });

  it("treats Unpaid, Refunded and unknown statuses as failed", async () => {
    for (const status of ["Unpaid", "Refunded", "Reversed"]) {
      fetchMock.mockResolvedValue(
        jsonResponse({ responseCode: "0000", data: { status } }),
      );
      expect((await getTransactionStatus("TOM_1_a")).state).toBe("failed");
    }
  });

  it("does not report success when Hubtel returns no data envelope", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ responseCode: "4004", data: null }));

    expect((await getTransactionStatus("TOM_1_a")).state).toBe("failed");
  });
});
