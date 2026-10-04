import { describe, expect, it } from "vitest";

import { matchDoorZone, parseGeocodeResults } from "../location";

const c = (long_name: string, ...types: string[]) => ({ long_name, types });

describe("parseGeocodeResults", () => {
  it("takes each field from the first result that has it", () => {
    const parsed = parseGeocodeResults([
      { address_components: [c("Unnamed Road", "route"), c("H8V7+2Q", "plus_code")] },
      { address_components: [c("Boundary Rd", "route"), c("East Legon", "neighborhood"), c("Accra", "locality"), c("Greater Accra Region", "administrative_area_level_1")] },
    ]);
    expect(parsed).toEqual({ line1: "Boundary Rd", area: "East Legon", city: "Accra", region: "Greater Accra Region" });
  });

  it("joins a street number and falls back to a named place", () => {
    expect(parseGeocodeResults([{ address_components: [c("12", "street_number"), c("Oxford St", "route")] }]).line1).toBe("12 Oxford St");
    expect(parseGeocodeResults([{ address_components: [c("Accra Mall", "establishment")] }]).line1).toBe("Accra Mall");
  });

  it("answers nulls for nothing", () => {
    expect(parseGeocodeResults([])).toEqual({ line1: null, area: null, city: null, region: null });
  });
});

describe("matchDoorZone", () => {
  const zones = [
    { id: "accra", name: "Greater Accra · door delivery", kind: "door" as const },
    { id: "kumasi", name: "Kumasi", kind: "door" as const },
    { id: "north", name: "Cape Coast · Tamale · Ho", kind: "door" as const },
    { id: "hub", name: "Pickup at our Osu hub", kind: "pickup" as const },
  ];
  const at = (city: string | null, region: string | null = null) => ({ line1: null, area: null, city, region });

  it("matches the city, then the region", () => {
    expect(matchDoorZone(at("Kumasi", "Ashanti Region"), zones)).toBe("kumasi");
    expect(matchDoorZone(at("Tamale"), zones)).toBe("north");
    expect(matchDoorZone(at("Tema", "Greater Accra Region"), zones)).toBe("accra");
  });

  it("never picks a pickup zone, and guesses nothing when unsure", () => {
    expect(matchDoorZone(at("Osu"), zones)).toBeNull();
    expect(matchDoorZone(at("Bolgatanga", "Upper East Region"), zones)).toBeNull();
  });
});
