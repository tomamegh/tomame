import { describe, expect, it } from "vitest";

import {
  canOfferHold,
  describeFeedbackAge,
  describeOldestWait,
  extractHoldReason,
  feedbackActionLabel,
  feedbackActionsFor,
  feedbackStatusLabel,
  feedbackStatusTone,
  feedbackVerdictLabel,
  feedbackVerdictTone,
  isFeedbackConfirmation,
  partitionFeedback,
  shortOrderRef,
} from "../components/queue-format";

const NOW = new Date("2026-09-14T12:00:00Z");

/**
 * The rule the whole screen turns on: `looks_right` is a customer telling us we
 * bought the right thing, and it must never be dressed as a problem.
 */
describe("looks_right is not a complaint", () => {
  it("is never amber, in any status — amber means a person owes somebody an action", () => {
    for (const status of ["open", "in_review", "resolved", "dismissed"] as const) {
      expect(feedbackStatusTone(status, "looks_right")).not.toBe("amber");
    }
  });

  it("says Confirmed rather than Waiting while it is open", () => {
    expect(feedbackStatusLabel("open", "looks_right")).toBe("Confirmed");
    expect(feedbackStatusLabel("open", "wrong_item")).toBe("Waiting");
  });

  it("is not described as waiting — nobody is waiting on it", () => {
    expect(describeFeedbackAge("2026-09-14T10:00:00Z", NOW, "looks_right")).toBe("Said 2 hrs ago");
    expect(describeFeedbackAge("2026-09-14T10:00:00Z", NOW, "wrong_item")).toBe("Waiting 2 hrs");
  });

  it("is filed rather than resolved, and never dismissed", () => {
    expect(feedbackActionsFor("open", "looks_right")).toEqual(["resolved"]);
    expect(feedbackActionLabel("resolved", "looks_right")).toBe("Noted, file it");
    expect(feedbackActionLabel("resolved", "damaged")).toBe("Sorted");
  });

  it("never offers to stop the parcel", () => {
    expect(canOfferHold("open", "looks_right")).toBe(false);
    expect(canOfferHold("in_review", "looks_right")).toBe(false);
    expect(canOfferHold("open", "wrong_item")).toBe(true);
  });

  it("is green, and a complaint is not", () => {
    expect(feedbackVerdictTone("looks_right")).toBe("green");
    expect(feedbackVerdictTone("damaged")).toBe("coral");
    expect(feedbackVerdictTone("wrong_item")).toBe("amber");
    expect(isFeedbackConfirmation("looks_right")).toBe(true);
    expect(isFeedbackConfirmation("other")).toBe(false);
  });

  it("reads as words rather than a column value", () => {
    expect(feedbackVerdictLabel("looks_right")).toBe("Looks right");
    expect(feedbackVerdictLabel("wrong_variant")).toBe("Wrong size or colour");
  });
});

describe("partitionFeedback", () => {
  const rows = [
    { id: "a", verdict: "wrong_item" as const },
    { id: "b", verdict: "looks_right" as const },
    { id: "c", verdict: "damaged" as const },
    { id: "d", verdict: "looks_right" as const },
  ];

  it("separates the confirmations from the work", () => {
    const { complaints, confirmations } = partitionFeedback(rows);
    expect(complaints.map((r) => r.id)).toEqual(["a", "c"]);
    expect(confirmations.map((r) => r.id)).toEqual(["b", "d"]);
  });

  it("does not re-sort within either half — the server's oldest-first order stands", () => {
    const { complaints } = partitionFeedback(rows);
    expect(complaints[0]?.id).toBe("a");
  });

  it("copes with a queue that is all good news", () => {
    const { complaints, confirmations } = partitionFeedback([rows[1]!, rows[3]!]);
    expect(complaints).toEqual([]);
    expect(confirmations).toHaveLength(2);
  });
});

describe("feedbackActionsFor", () => {
  it("offers claim-or-close while open, and only closing once claimed", () => {
    expect(feedbackActionsFor("open", "damaged")).toEqual(["in_review", "resolved", "dismissed"]);
    expect(feedbackActionsFor("in_review", "damaged")).toEqual(["resolved", "dismissed"]);
  });

  it("offers nothing once it is closed — a button that is going to 409 is a bad no", () => {
    expect(feedbackActionsFor("resolved", "damaged")).toEqual([]);
    expect(feedbackActionsFor("dismissed", "damaged")).toEqual([]);
    expect(feedbackActionsFor("resolved", "looks_right")).toEqual([]);
  });
});

describe("canOfferHold", () => {
  it("is not offered on a complaint that is already closed", () => {
    expect(canOfferHold("resolved", "wrong_item")).toBe(false);
    expect(canOfferHold("dismissed", "wrong_item")).toBe(false);
  });
});

describe("describeFeedbackAge", () => {
  it("drops the clause rather than printing an invalid date", () => {
    expect(describeFeedbackAge("nonsense", NOW, "wrong_item")).toBeNull();
  });

  it("says just arrived rather than waiting 0 minutes", () => {
    expect(describeFeedbackAge("2026-09-14T11:59:50Z", NOW, "wrong_item")).toBe("Just arrived");
    expect(describeFeedbackAge("2026-09-14T11:59:50Z", NOW, "looks_right")).toBe("Just now");
  });
});

describe("extractHoldReason", () => {
  it("pulls the standing reason out of the hold endpoint's 409", () => {
    expect(extractHoldReason("This order is already on hold: wrong colour, checking with the store")).toBe(
      "wrong colour, checking with the store",
    );
  });

  it("returns nothing when the server had no reason to give", () => {
    expect(extractHoldReason("This order is already on hold: no reason recorded")).toBeNull();
  });

  it("returns nothing for the other 409 on that route, so its own sentence is shown instead", () => {
    expect(extractHoldReason("Someone else just put this order on hold. Refresh.")).toBeNull();
  });
});

describe("shortOrderRef", () => {
  it("is the first block of the uuid — how ops say it aloud", () => {
    expect(shortOrderRef("3f2a91c4-2b7e-4d1a-9f55-0c3a8d21e77b")).toBe("3f2a91c4");
  });
});

describe("feedbackStatusLabel", () => {
  it("gives every complaint status human words", () => {
    expect(feedbackStatusLabel("in_review", "damaged")).toBe("Being looked at");
    expect(feedbackStatusLabel("resolved", "damaged")).toBe("Sorted");
    expect(feedbackStatusLabel("dismissed", "damaged")).toBe("Nothing in it");
  });
});

describe("describeOldestWait", () => {
  const NOW = new Date("2026-09-14T12:00:00.000Z");

  it("reads as a sentence, not as a chip", () => {
    // The bug this exists to prevent: `describeFeedbackAge` returns "Just
    // arrived", and the blurb spliced it into "The one at the top has been …",
    // which rendered "has been just arrived" on the live screen.
    const justNow = describeOldestWait("2026-09-14T11:59:50.000Z", NOW);
    expect(justNow).toBe("The one at the top has only just come in");
    expect(justNow).not.toMatch(/has been just/i);
  });

  it("names the wait when there is one", () => {
    expect(describeOldestWait("2026-09-14T09:00:00.000Z", NOW)).toMatch(
      /^The one at the top has been waiting .+/,
    );
    expect(describeOldestWait("2026-09-14T09:00:00.000Z", NOW)).not.toMatch(/ago/);
  });

  it("drops the clause rather than printing a broken date", () => {
    expect(describeOldestWait("not-a-date", NOW)).toBeNull();
  });
});
