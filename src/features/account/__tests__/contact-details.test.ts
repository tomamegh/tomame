import { describe, expect, it } from "vitest";

import { missingContactDetails } from "../contact-details";
import { requireContactDetails } from "../services/contact-details.service";
import type { PlatformUser } from "@/features/users/types";

const full = { first_name: "Ama", last_name: "Owusu", phone: "+233 24 555 0192" };

describe("missingContactDetails", () => {
  it("passes a full name and a phone", () => {
    expect(missingContactDetails(full)).toEqual([]);
  });

  it("names every missing field, treating blanks as missing", () => {
    expect(missingContactDetails({ first_name: "  ", last_name: null })).toEqual(["first_name", "last_name", "phone"]);
  });

  it("refuses a phone that is not a number", () => {
    expect(missingContactDetails({ ...full, phone: "call me" })).toEqual(["phone"]);
  });
});

describe("requireContactDetails", () => {
  const user = (profile: object) => ({ id: "u1", profile: { role: "user", ...profile } }) as unknown as PlatformUser;

  it("lets a complete account through", () => {
    expect(() => requireContactDetails(user(full))).not.toThrow();
  });

  it("answers 409 for an account without a phone", () => {
    expect(() => requireContactDetails(user({ ...full, phone: null }))).toThrow(
      expect.objectContaining({ statusCode: 409 }),
    );
  });
});
