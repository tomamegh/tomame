"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRightIcon, CheckIcon, PartyPopperIcon, RotateCcwIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { CHECKLIST, QUIZ, SECTIONS } from "../content";
import { isGuideComplete, recordQuiz, toggleChecklist } from "../progress";
import { scoreQuiz, type QuizAnswers } from "../quiz";
import { useGuideProgress, useHydrated } from "../use-guide-progress";

/**
 * "Ready for your first shift" (081 guide): the physical checks nobody can do
 * for you, and eight questions that each guard one rule. Ticks and the best
 * score are kept on this device.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

export function ReadyCheck() {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <Checklist />
      <Quiz />
    </div>
  );
}

function Checklist() {
  const [progress, update] = useGuideProgress();
  const hydrated = useHydrated();
  const ticked = (id: string, auto?: "practice" | "quiz") =>
    auto === "practice" ? progress.practiceDone : auto === "quiz" ? progress.quizPassed : progress.checklist.includes(id);
  const count = CHECKLIST.filter((c) => ticked(c.id, c.auto)).length;
  const complete = isGuideComplete(progress) && count === CHECKLIST.length;

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-[24px] border border-tm-border bg-card p-5 xl:sticky xl:top-24 xl:self-start">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-[17px] font-bold text-tm-ink">Before your first shift</h3>
        <span className="tm-nums rounded-full bg-tm-paper px-2.5 py-1 text-[12px] font-bold text-tm-ink">
          {hydrated ? count : 0}/{CHECKLIST.length}
        </span>
      </div>
      <ul className="flex flex-col gap-1">
        {CHECKLIST.map((item) => {
          const on = hydrated && ticked(item.id, item.auto);
          const auto = !!item.auto;
          return (
            <li key={item.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-[14px] px-2.5 py-2 transition-colors hover:bg-tm-paper",
                  auto && "cursor-default hover:bg-transparent",
                )}
              >
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={on}
                  disabled={auto}
                  onChange={() => update((p) => toggleChecklist(p, item.id))}
                />
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[6px] border-2 transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-tm-coral/25",
                    on ? "border-tm-green bg-tm-green text-white" : "border-tm-border bg-card",
                  )}
                  aria-hidden
                >
                  {on ? <CheckIcon className="size-3.5 stroke-[3]" /> : null}
                </span>
                <span className={cn("text-[13.5px] leading-[1.45] font-medium", on ? "text-tm-ink" : "text-tm-text-2")}>
                  {item.label}
                  {auto ? <span className="block text-[11.5px] font-semibold text-tm-text-3">Ticks itself</span> : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <AnimatePresence>
        {complete ? (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 rounded-[14px] bg-tm-green-bg px-3.5 py-3 text-[13px] font-semibold text-tm-green-ink"
          >
            <PartyPopperIcon className="size-4 shrink-0" aria-hidden />
            You are ready. Welcome to the hub.
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Quiz() {
  const [progress, update] = useGuideProgress();
  const hydrated = useHydrated();
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [submitted, setSubmitted] = useState(false);
  const score = scoreQuiz(QUIZ, answers);

  const submit = () => {
    setSubmitted(true);
    update((p) => recordQuiz(p, score.correct, score.passed));
  };

  const retry = () => {
    setAnswers({});
    setSubmitted(false);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-[17px] font-bold text-tm-ink">The quick check</h3>
        <span className="text-[12.5px] font-semibold text-tm-text-3">
          {hydrated && progress.quizPassed ? `Passed · best ${progress.quizBest}/${QUIZ.length}` : `Pass with ${QUIZ.length - 1} of ${QUIZ.length}`}
        </span>
      </div>

      <ol className="flex flex-col gap-3">
        {QUIZ.map((q, qi) => {
          const given = answers[q.id];
          const right = given === q.answer;
          const section = SECTIONS.find((s) => s.id === q.section);
          return (
            <li key={q.id} className="min-w-0 rounded-[20px] border border-tm-border bg-card p-4 sm:p-5">
              <fieldset className="flex min-w-0 flex-col gap-3">
                <legend className="mb-3 flex gap-2.5 text-[14.5px] leading-[1.45] font-semibold text-tm-ink">
                  <span className="tm-nums flex size-6 shrink-0 items-center justify-center rounded-full bg-tm-paper text-[12px] font-bold text-tm-text-2">{qi + 1}</span>
                  <span className="min-w-0">{q.prompt}</span>
                </legend>
                <div className="flex flex-col gap-2">
                  {q.options.map((o) => {
                    const chosen = given === o.id;
                    const isAnswer = o.id === q.answer;
                    return (
                      <label
                        key={o.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-[14px] border px-3.5 py-2.5 text-[13.5px] font-medium transition-colors",
                          !submitted && (chosen ? "border-tm-coral/60 bg-tm-tint text-tm-ink" : "border-tm-border text-tm-text-2 hover:bg-tm-paper"),
                          submitted && isAnswer && "border-[#cdebd8] bg-tm-green-bg text-tm-green-ink",
                          submitted && chosen && !isAnswer && "border-tm-pill-border bg-tm-pill-bg text-tm-coral-strong",
                          submitted && !chosen && !isAnswer && "border-tm-border text-tm-text-3",
                          submitted && "cursor-default",
                        )}
                      >
                        <input
                          type="radio"
                          name={`quiz-${q.id}`}
                          value={o.id}
                          checked={chosen}
                          disabled={submitted}
                          onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
                          className="peer sr-only"
                        />
                        <span
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-full border-2 peer-focus-visible:ring-4 peer-focus-visible:ring-tm-coral/25",
                            chosen ? "border-current" : "border-tm-border",
                          )}
                          aria-hidden
                        >
                          {submitted && isAnswer ? <CheckIcon className="size-3 stroke-[3]" /> : submitted && chosen ? <XIcon className="size-3 stroke-[3]" /> : chosen ? <span className="size-2 rounded-full bg-current" /> : null}
                        </span>
                        <span className="min-w-0">{o.text}</span>
                      </label>
                    );
                  })}
                </div>
                <AnimatePresence initial={false}>
                  {submitted ? (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className={cn("overflow-hidden text-[13px] leading-[1.5] font-medium", right ? "text-tm-green-ink" : "text-tm-text-2")}
                    >
                      <b>{right ? "Right. " : given ? "Not quite. " : "Not answered. "}</b>
                      {q.why}
                      {!right && section ? (
                        <a href={`#${section.id}`} className="ml-1 inline-flex items-center gap-0.5 font-semibold text-tm-coral-strong underline-offset-2 hover:underline">
                          Read {section.label}
                          <ArrowUpRightIcon className="size-3.5" aria-hidden />
                        </a>
                      ) : null}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </fieldset>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-3 rounded-[20px] border border-tm-border bg-card p-4" aria-live="polite">
        {submitted ? (
          <>
            <span className={cn("font-display text-[20px] font-bold", score.passed ? "text-tm-green-ink" : "text-tm-ink")}>
              {score.correct}/{score.total}
            </span>
            <span className="min-w-0 flex-1 text-[13.5px] font-medium text-tm-text-2">
              {score.passed ? "Passed. Saved on this device." : `${score.total - score.correct} to look at again. The links above go straight to the right part.`}
            </span>
            <button type="button" onClick={retry} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-tm-border bg-card px-4 text-[13px] font-semibold text-tm-ink hover:bg-tm-paper">
              <RotateCcwIcon className="size-4" aria-hidden />
              Try again
            </button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 text-[13.5px] font-medium text-tm-text-2">
              {score.answered} of {score.total} answered
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={score.answered < score.total}
              className="tm-cta-gradient inline-flex h-10 items-center gap-1.5 rounded-full px-5 text-[13px] font-semibold text-white shadow-[0_10px_24px_-14px_rgba(244,63,94,0.65)] focus-visible:ring-4 focus-visible:ring-tm-coral/30 focus-visible:outline-none disabled:opacity-45 disabled:shadow-none"
            >
              Check my answers
            </button>
          </>
        )}
      </div>
    </div>
  );
}
