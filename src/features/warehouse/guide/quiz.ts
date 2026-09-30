/**
 * The "Ready for your first shift" check (081 guide). Pure scoring so the pass
 * rule is tested, not eyeballed.
 */

export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
  answer: string;
  why: string;
  /** Section of the guide that teaches it, for "read this again". */
  section: string;
}

export type QuizAnswers = Record<string, string | undefined>;

export interface QuizScore {
  answered: number;
  correct: number;
  total: number;
  passed: boolean;
  wrong: string[];
}

/** Every question answered, and no more than one wrong. */
export const QUIZ_ALLOWED_MISSES = 1;

export function scoreQuiz(questions: readonly QuizQuestion[], answers: QuizAnswers): QuizScore {
  let answered = 0;
  let correct = 0;
  const wrong: string[] = [];
  for (const q of questions) {
    const given = answers[q.id];
    if (!given) continue;
    answered += 1;
    if (given === q.answer) correct += 1;
    else wrong.push(q.id);
  }
  const total = questions.length;
  return {
    answered,
    correct,
    total,
    passed: total > 0 && answered === total && total - correct <= QUIZ_ALLOWED_MISSES,
    wrong,
  };
}
