import { describe, expect, it } from "vitest";

import { passthroughSrc } from "../store-image";

describe("passthroughSrc", () => {
  it("leaves allowlisted hosts to the optimizer", () => {
    expect(passthroughSrc("https://m.media-amazon.com/images/I/x.jpg")).toBeNull();
    expect(passthroughSrc("https://mediahub.prettylittlething.com/cnr0690_black_xl?qlt=70&w=549")).toBeNull();
  });

  it("leaves local paths alone", () => {
    expect(passthroughSrc("/images/hero.jpg")).toBeNull();
  });

  it("sends an unlisted store's photo straight to the passthrough route", () => {
    const url = "https://mediahub.debenhams.com/dbz_prod_25f23e7b33?w=100&dpr=1";
    expect(passthroughSrc(url)).toBe(`/api/image-passthrough?url=${encodeURIComponent(url)}`);
  });
});
