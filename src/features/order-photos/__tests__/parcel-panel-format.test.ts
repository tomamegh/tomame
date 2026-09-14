import { describe, expect, it } from "vitest";

import {
  describePhotoMoment,
  describeSelection,
  describeSelectionProblem,
  formatPhotoSize,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_UPLOAD,
  mayPhotographParcel,
  summarisePhotos,
  unansweredFeedback,
} from "../components/parcel-panel-format";

/**
 * The rules behind the camera on `/admin/orders/[id]`.
 *
 * Every one of these is a refusal or a sentence an operator sees while holding a
 * parcel, so they are checked here rather than by rendering the panel.
 */

const file = (name: string, size: number, type = "image/jpeg") => ({ name, size, type });

describe("mayPhotographParcel", () => {
  it("offers the camera from paid onward", () => {
    for (const status of ["paid", "processing", "in_transit", "delivered", "completed"] as const) {
      expect(mayPhotographParcel(status)).toBe(true);
    }
  });

  it("withholds it where there is no parcel", () => {
    expect(mayPhotographParcel("pending")).toBe(false);
    expect(mayPhotographParcel("cancelled")).toBe(false);
  });
});

describe("describeSelectionProblem", () => {
  it("asks for a photo before anything else", () => {
    expect(describeSelectionProblem([])).toBe("Choose a photo first.");
  });

  it("passes an ordinary batch", () => {
    expect(
      describeSelectionProblem([file("front.jpg", 1_200_000), file("label.jpg", 900_000)]),
    ).toBeNull();
  });

  it("refuses more than the route accepts at once", () => {
    const batch = Array.from({ length: MAX_PHOTOS_PER_UPLOAD + 1 }, (_, i) =>
      file(`p${i}.jpg`, 1000),
    );
    expect(describeSelectionProblem(batch)).toMatch(/11 photos/);
  });

  it("names the file that is too large, not just the limit", () => {
    const problem = describeSelectionProblem([
      file("small.jpg", 1000),
      file("huge.jpg", MAX_PHOTO_BYTES + 1),
    ]);
    expect(problem).toContain("huge.jpg");
    expect(problem).toContain("12.0 MB");
  });

  it("catches the empty placeholder some camera intents hand back", () => {
    expect(describeSelectionProblem([file("IMG_0001.jpg", 0)])).toBe(
      "IMG_0001.jpg is empty. Take it again.",
    );
  });

  it("refuses a file that is not an image", () => {
    expect(describeSelectionProblem([file("invoice.pdf", 2000, "application/pdf")])).toBe(
      "invoice.pdf is not an image.",
    );
  });

  it("allows a file whose type the browser could not name", () => {
    expect(describeSelectionProblem([file("photo", 2000, "")])).toBeNull();
  });
});

describe("formatPhotoSize", () => {
  it("stays in kilobytes below a megabyte", () => {
    expect(formatPhotoSize(240 * 1024)).toBe("240 KB");
  });

  it("shows one decimal above it, so 1.4MB does not read as 1MB", () => {
    expect(formatPhotoSize(1.44 * 1024 * 1024)).toBe("1.4 MB");
  });

  it("never prints a negative or a NaN", () => {
    expect(formatPhotoSize(0)).toBe("0 KB");
    expect(formatPhotoSize(Number.NaN)).toBe("0 KB");
  });
});

describe("describeSelection", () => {
  it("counts one photo in the singular", () => {
    expect(describeSelection([file("a.jpg", 512 * 1024)])).toBe("1 photo, 512 KB");
  });

  it("totals the batch", () => {
    expect(
      describeSelection([file("a.jpg", 1024 * 1024), file("b.jpg", 1024 * 1024)]),
    ).toBe("2 photos, 2.0 MB");
  });
});

describe("summarisePhotos", () => {
  const shown = { isCustomerVisible: true };
  const hidden = { isCustomerVisible: false };

  it("says so plainly when there is nothing", () => {
    expect(summarisePhotos([])).toBe("No photo yet");
  });

  it("does not mention internal ones when there are none", () => {
    expect(summarisePhotos([shown, shown])).toBe("2 photos");
  });

  it("calls out the ones the customer cannot open", () => {
    expect(summarisePhotos([shown, hidden, shown])).toBe("3 photos, 1 kept internal");
    expect(summarisePhotos([hidden])).toBe("1 photo, none shown to the customer");
  });
});

describe("unansweredFeedback", () => {
  const row = (verdict: string, status: string) =>
    ({ verdict, status }) as Parameters<typeof unansweredFeedback>[0][number];

  it("counts a live complaint", () => {
    expect(unansweredFeedback([row("wrong_item", "open")])).toHaveLength(1);
    expect(unansweredFeedback([row("damaged", "in_review")])).toHaveLength(1);
  });

  it("never counts a confirmation, whatever its status", () => {
    expect(unansweredFeedback([row("looks_right", "open")])).toHaveLength(0);
    expect(unansweredFeedback([row("looks_right", "in_review")])).toHaveLength(0);
  });

  it("drops a complaint that has been closed", () => {
    expect(unansweredFeedback([row("wrong_item", "resolved")])).toHaveLength(0);
    expect(unansweredFeedback([row("other", "dismissed")])).toHaveLength(0);
  });
});

describe("describePhotoMoment", () => {
  it("says what the picture is for while there is still nothing to see", () => {
    expect(describePhotoMoment("paid", false)).toContain("US hub");
  });

  it("is honest that a flying box is past the cheap moment", () => {
    expect(describePhotoMoment("in_transit", false)).toContain("second shipment");
  });

  it("switches to what the customer can do once a photo exists", () => {
    expect(describePhotoMoment("in_transit", true)).toContain("journey screen");
  });
});
