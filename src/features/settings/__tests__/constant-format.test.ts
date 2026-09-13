import { describe, expect, it } from "vitest";

import {
  formatConstant,
  fromInputValue,
  inputSuffix,
  toInputValue,
} from "../components/constant-format";

describe("formatConstant", () => {
  it("prints each seeded unit the way an admin reads it", () => {
    expect(formatConstant(0.04, "%")).toBe("4%");
    expect(formatConstant(12, "$")).toBe("$12.00");
    expect(formatConstant(5, "$/lb")).toBe("$5.00/lb");
    expect(formatConstant(1, "lb")).toBe("1 lb");
  });

  it("prints a bare number for a unit it does not recognise rather than guessing", () => {
    expect(formatConstant(7, "furlongs")).toBe("7");
  });
});

describe("percent round trip", () => {
  it("survives the trip out to the input and back", () => {
    for (const stored of [0, 0.04, 0.05, 0.073, 0.1, 0.125, 1]) {
      expect(fromInputValue(toInputValue(stored, "%"), "%")).toBe(stored);
    }
  });

  it("does not leak floating-point noise into the column", () => {
    expect(fromInputValue("7.3", "%")).toBe(0.073);
  });

  it("leaves a non-percentage unit on its own scale", () => {
    expect(toInputValue(5, "$/lb")).toBe("5");
    expect(fromInputValue("5", "$/lb")).toBe(5);
  });
});

describe("fromInputValue", () => {
  it("refuses anything that is not a usable number instead of writing zero", () => {
    expect(fromInputValue("", "%")).toBeNull();
    expect(fromInputValue("   ", "$")).toBeNull();
    expect(fromInputValue("abc", "$")).toBeNull();
    expect(fromInputValue("-3", "$")).toBeNull();
  });

  it("accepts a deliberate zero", () => {
    expect(fromInputValue("0", "%")).toBe(0);
  });
});

describe("inputSuffix", () => {
  it("shows the scale the admin is typing on", () => {
    expect(inputSuffix("%")).toBe("%");
    expect(inputSuffix("$/lb")).toBe("/lb");
    expect(inputSuffix("nonsense")).toBeNull();
  });
});
