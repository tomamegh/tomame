import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/audit/services/audit.service", () => ({ logAuditEvent: vi.fn(async () => undefined) }));
vi.mock("@/db/queries/policies", async () => {
  class PolicySlugTakenError extends Error {
    constructor(public readonly slug: string) {
      super(`A policy with slug "${slug}" already exists`);
      this.name = "PolicySlugTakenError";
    }
  }
  return {
    PolicySlugTakenError,
    getPolicyBySlug: vi.fn(),
    insertPolicy: vi.fn(),
    updatePolicyBySlug: vi.fn(),
    deletePolicyBySlug: vi.fn(),
  };
});

import * as q from "@/db/queries/policies";
import { logAuditEvent } from "@/features/audit/services/audit.service";
import { APIError } from "@/lib/auth/api-helpers";
import { createPolicy, deletePolicy, updatePolicy } from "../services/policies.service";
import type { PolicyRow } from "../types";

const ACTOR = { id: "admin-1", email: "ops@tomame.test" };

const policy = (over: Partial<PolicyRow> = {}): PolicyRow => ({
  id: "6f1c1e22-0f2f-4a8c-9e57-0f3d0f1f0a11",
  slug: "returns",
  label: "Returns Policy",
  content: "You may return an item within 7 days.",
  effective_date: "2026-01-01",
  last_updated: "2026-09-01T00:00:00Z",
  is_published: true,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(q.getPolicyBySlug).mockResolvedValue(policy());
  vi.mocked(q.insertPolicy).mockResolvedValue(policy({ id: "new-id", slug: "shipping" }));
  vi.mocked(q.updatePolicyBySlug).mockImplementation(async (slug, patch) =>
    policy({ slug, content: patch.content, is_published: patch.isPublished, effective_date: patch.effectiveDate }),
  );
  vi.mocked(q.deletePolicyBySlug).mockResolvedValue(policy());
});

describe("createPolicy", () => {
  it("writes the row and audits it", async () => {
    const row = await createPolicy(ACTOR, {
      slug: "shipping",
      label: "Shipping Policy",
      content: "We ship weekly.",
      is_published: false,
    });

    expect(row.id).toBe("new-id");
    expect(q.insertPolicy).toHaveBeenCalledWith({
      slug: "shipping",
      label: "Shipping Policy",
      content: "We ship weekly.",
      effectiveDate: null,
      isPublished: false,
    });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        actorRole: "admin",
        action: "policy_created",
        entityType: "policy",
        entityId: "new-id",
      }),
    );
  });

  it("turns a taken slug into a 409 and leaves no audit row", async () => {
    vi.mocked(q.insertPolicy).mockRejectedValue(new q.PolicySlugTakenError("returns"));

    await expect(
      createPolicy(ACTOR, { slug: "returns", label: "Returns", content: "", is_published: false }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});

describe("updatePolicy", () => {
  it("saves the change and audits it with both publish states", async () => {
    const row = await updatePolicy(ACTOR, "returns", {
      content: "You may return an item within 14 days.",
      is_published: true,
      effective_date: "2026-02-01",
    });

    expect(row.content).toBe("You may return an item within 14 days.");
    expect(q.updatePolicyBySlug).toHaveBeenCalledWith("returns", {
      content: "You may return an item within 14 days.",
      isPublished: true,
      effectiveDate: "2026-02-01",
    });
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorRole: "admin",
        action: "policy_updated",
        entityType: "policy",
        entityId: policy().id,
        metadata: expect.objectContaining({
          slug: "returns",
          previousPublished: true,
          newPublished: true,
          contentChanged: true,
          actorEmail: "ops@tomame.test",
        }),
      }),
    );
  });

  // The question the missing audit trail could not answer.
  it("records an unpublish as its own action", async () => {
    await updatePolicy(ACTOR, "returns", { content: policy().content, is_published: false });

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "policy_unpublished",
        metadata: expect.objectContaining({ previousPublished: true, newPublished: false, contentChanged: false }),
      }),
    );
  });

  it("records a publish as its own action", async () => {
    vi.mocked(q.getPolicyBySlug).mockResolvedValue(policy({ is_published: false }));

    await updatePolicy(ACTOR, "returns", { content: policy().content, is_published: true });

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "policy_published",
        metadata: expect.objectContaining({ previousPublished: false, newPublished: true }),
      }),
    );
  });

  it("404s on an unknown slug without writing or auditing", async () => {
    vi.mocked(q.getPolicyBySlug).mockResolvedValue(null);

    await expect(
      updatePolicy(ACTOR, "nope", { content: "x", is_published: true }),
    ).rejects.toBeInstanceOf(APIError);
    expect(q.updatePolicyBySlug).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});

describe("deletePolicy", () => {
  it("deletes the row and keeps a copy of what went in the audit entry", async () => {
    const row = await deletePolicy(ACTOR, "returns");

    expect(row).not.toBeNull();
    expect(q.deletePolicyBySlug).toHaveBeenCalledWith("returns");
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        actorRole: "admin",
        action: "policy_deleted",
        entityType: "policy",
        entityId: policy().id,
        metadata: expect.objectContaining({
          slug: "returns",
          label: "Returns Policy",
          wasPublished: true,
          contentLength: policy().content.length,
        }),
      }),
    );
  });

  it("audits nothing when there was no such policy", async () => {
    vi.mocked(q.deletePolicyBySlug).mockResolvedValue(null);

    await expect(deletePolicy(ACTOR, "ghost")).resolves.toBeNull();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});
