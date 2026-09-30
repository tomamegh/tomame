import { describe, expect, it } from "vitest";

import { FAQ, GLOSSARY, QUIZ, SECTIONS, SECTION_IDS } from "../content";
import {
  EMPTY_PROGRESS,
  dismissTour,
  isGuideComplete,
  markPracticeDone,
  markVisited,
  parseProgress,
  readPercent,
  recordQuiz,
  toggleChecklist,
} from "../progress";
import { scoreQuiz } from "../quiz";
import { normaliseSearch, searchEntries } from "../search";
import { CLIPS, cueAt } from "../videos";

describe("scoreQuiz", () => {
  const all = Object.fromEntries(QUIZ.map((q) => [q.id, q.answer]));

  it("passes a full, correct run", () => {
    expect(scoreQuiz(QUIZ, all)).toMatchObject({ correct: QUIZ.length, passed: true, wrong: [] });
  });

  it("allows one miss and no more", () => {
    const [a, b] = QUIZ;
    const oneWrong = { ...all, [a!.id]: "zz" };
    expect(scoreQuiz(QUIZ, oneWrong)).toMatchObject({ passed: true, wrong: [a!.id] });
    expect(scoreQuiz(QUIZ, { ...oneWrong, [b!.id]: "zz" }).passed).toBe(false);
  });

  it("never passes an unfinished quiz", () => {
    const { [QUIZ[0]!.id]: _skipped, ...rest } = all;
    const score = scoreQuiz(QUIZ, rest);
    expect(score.answered).toBe(QUIZ.length - 1);
    expect(score.passed).toBe(false);
    expect(scoreQuiz([], {}).passed).toBe(false);
  });

  it("has an answer among each question's options, and a section that exists", () => {
    for (const q of QUIZ) {
      expect(q.options.map((o) => o.id)).toContain(q.answer);
      expect(SECTION_IDS).toContain(q.section);
    }
  });
});

describe("search", () => {
  it("normalises case, punctuation and accents", () => {
    expect(normaliseSearch("  Label—BLURRY?! ")).toBe("label blurry");
    expect(normaliseSearch("Café")).toBe("cafe");
  });

  it("needs every word, in any order", () => {
    const hits = searchEntries(FAQ, "blurry label");
    expect(hits[0]!.id).toBe("fuzzy");
    expect(searchEntries(FAQ, "label zebra")).toEqual([]);
  });

  it("ranks question hits above answer hits and returns everything for an empty query", () => {
    expect(searchEntries(FAQ, "camera")[0]!.q.toLowerCase()).toContain("camera");
    expect(searchEntries(GLOSSARY, "   ")).toHaveLength(GLOSSARY.length);
  });

  it("finds by tag", () => {
    expect(searchEntries(FAQ, "safari").map((f) => f.id)).toContain("tiny");
  });
});

describe("guide progress", () => {
  it("survives junk, old shapes and a missing store", () => {
    expect(parseProgress(null)).toBe(EMPTY_PROGRESS);
    expect(parseProgress("{not json")).toBe(EMPTY_PROGRESS);
    expect(parseProgress('"a string"')).toBe(EMPTY_PROGRESS);
    expect(parseProgress(JSON.stringify({ visited: ["a", 3, "a"], practiceDone: "yes", quizBest: -4 }))).toEqual({
      ...EMPTY_PROGRESS,
      visited: ["a"],
      quizBest: 0,
    });
  });

  it("counts read sections as a percentage", () => {
    const p = SECTION_IDS.slice(0, 3).reduce(markVisited, EMPTY_PROGRESS);
    expect(readPercent(p, SECTION_IDS)).toBe(Math.round((3 / SECTION_IDS.length) * 100));
    expect(markVisited(p, SECTION_IDS[0]!)).toBe(p);
  });

  it("is complete only when practised and passed", () => {
    expect(isGuideComplete(markPracticeDone(EMPTY_PROGRESS))).toBe(false);
    expect(isGuideComplete(recordQuiz(markPracticeDone(EMPTY_PROGRESS), 8, true))).toBe(true);
  });

  it("keeps the best score and never takes a pass away", () => {
    const passed = recordQuiz(EMPTY_PROGRESS, 8, true);
    const worse = recordQuiz(passed, 3, false);
    expect(worse).toBe(passed);
    expect(worse).toMatchObject({ quizPassed: true, quizBest: 8 });
  });

  it("toggles checklist ticks and dismisses the tour once", () => {
    const on = toggleChecklist(EMPTY_PROGRESS, "printer");
    expect(on.checklist).toEqual(["printer"]);
    expect(toggleChecklist(on, "printer").checklist).toEqual([]);
    const gone = dismissTour(EMPTY_PROGRESS);
    expect(dismissTour(gone)).toBe(gone);
  });
});

describe("guide content", () => {
  it("has unique section, FAQ and glossary ids", () => {
    for (const list of [SECTIONS.map((s) => s.id), FAQ.map((f) => f.id), GLOSSARY.map((g) => g.id)]) {
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it("points FAQ links only at real sections", () => {
    for (const f of FAQ) if (f.section) expect(SECTION_IDS).toContain(f.section);
  });

  it("gives every clip ordered cues inside its length", () => {
    for (const clip of Object.values(CLIPS)) {
      clip.cues.forEach((cue, i) => {
        expect(cue.to).toBeGreaterThan(cue.from);
        expect(cue.to).toBeLessThanOrEqual(clip.duration + 0.05);
        if (i > 0) expect(cue.from).toBeGreaterThanOrEqual(clip.cues[i - 1]!.to - 0.01);
      });
      expect(cueAt(clip, clip.cues[0]!.from + 0.01)).toBe(clip.cues[0]);
      expect(cueAt(clip, clip.duration + 5)).toBeNull();
    }
  });
});
