import { describe, expect, it } from "vitest";

import {
  contactChannelsLabel,
  formatJoined,
  roleBadge,
  roleChangeWarning,
  roleGrantSummary,
  userDisplayName,
  userInitials,
} from "../components/admin-user-format";

describe("userDisplayName", () => {
  it("prefers the profile name", () => {
    expect(userDisplayName({ first_name: "Kwame", last_name: "Owusu" }, "k@x.com")).toBe(
      "Kwame Owusu",
    );
  });

  it("falls back to the email, which is something a person recognises", () => {
    expect(userDisplayName(null, "k@x.com")).toBe("k@x.com");
    expect(userDisplayName({ first_name: null, last_name: null }, "k@x.com")).toBe("k@x.com");
  });

  it("never renders an empty name", () => {
    expect(userDisplayName(null, null)).toBe("Account with no name");
  });
});

describe("userInitials", () => {
  it("uses both initials when both names exist", () => {
    expect(userInitials({ first_name: "kwame", last_name: "owusu" }, null)).toBe("KO");
  });

  it("falls back to one name, then the email, then a question mark", () => {
    expect(userInitials({ first_name: "Ama", last_name: null }, "a@x.com")).toBe("A");
    expect(userInitials(null, "zoe@x.com")).toBe("Z");
    expect(userInitials(null, null)).toBe("?");
  });
});

describe("roleBadge", () => {
  it("gives admin the brand accent and a customer the quiet one", () => {
    expect(roleBadge("admin")).toEqual({ label: "Admin", tone: "coral" });
    expect(roleBadge("user")).toEqual({ label: "Customer", tone: "muted" });
    expect(roleBadge("system").label).toBe("System");
  });
});

describe("roleGrantSummary", () => {
  it("describes the admin grant as the whole admin surface, not a subset", () => {
    // The gate is prefix-wide in src/proxy.ts; describing anything narrower
    // would understate what the click hands over.
    const summary = roleGrantSummary("admin");
    expect(summary).toContain("every admin screen");
    expect(summary).toContain("every admin endpoint");
    expect(summary).toContain("change anyone's role");
  });

  it("says a customer reaches no admin surface at all", () => {
    expect(roleGrantSummary("user")).toContain("No admin screen");
  });
});

describe("roleChangeWarning", () => {
  it("calls out self-demotion above everything else", () => {
    const warning = roleChangeWarning("admin", "user", true);
    expect(warning).toContain("your own admin access");
    expect(warning).toContain("another admin");
  });

  it("describes a promotion with the full grant", () => {
    expect(roleChangeWarning("user", "admin", false)).toContain("every admin endpoint");
  });

  it("describes a demotion as immediate", () => {
    expect(roleChangeWarning("admin", "user", false)).toContain("immediately");
  });

  it("does not call a promotion of yourself a self-demotion", () => {
    expect(roleChangeWarning("user", "admin", true)).toContain("becomes an administrator");
  });
});

describe("formatJoined", () => {
  it("formats in UTC so two screens agree on the day", () => {
    // Node’s en-GB "short" month for September is "Sept", not "Sep" — pinned so a
    // locale-data change that silently reshapes every date on the admin is caught.
    expect(formatJoined("2026-09-03T23:30:00Z")).toBe("3 Sept 2026");
  });

  it("returns null rather than Invalid Date", () => {
    expect(formatJoined("nonsense")).toBeNull();
    expect(formatJoined(null)).toBeNull();
  });
});

describe("contactChannelsLabel", () => {
  it("lists the channels that actually work", () => {
    expect(
      contactChannelsLabel({ notify_email: true, whatsapp_opt_in: true, phone: "+233..." }),
    ).toEqual({ label: "Email and WhatsApp", tone: "green" });
  });

  it("does not count a WhatsApp opt-in with no number as a channel", () => {
    // profiles.phone is nullable and unverified (051); an opt-in without one
    // reaches nobody.
    expect(
      contactChannelsLabel({ notify_email: false, whatsapp_opt_in: true, phone: null }),
    ).toEqual({
      label: "No reachable channel: WhatsApp is on but no number is saved",
      tone: "coral",
    });
  });

  it("flags a customer with every channel off", () => {
    const result = contactChannelsLabel({
      notify_email: false,
      whatsapp_opt_in: false,
      phone: null,
    });
    expect(result.tone).toBe("coral");
    expect(result.label).toBe("No reachable channel");
  });
});
