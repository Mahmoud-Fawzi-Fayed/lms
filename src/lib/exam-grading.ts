/**
 * Pure grading logic extracted from /api/exams/submit so it can be unit-tested
 * without a DB or HTTP layer.
 *
 * The shape of `questions` is the same as ExamAttempt.questionSnapshot (i.e. the
 * frozen copy stored at attempt start, including `correctAnswer` and `options[i].isCorrect`).
 */

export type GradingQuestion = {
  _id: any;
  type: 'mcq' | 'single' | 'truefalse' | 'fillinblank';
  points?: number;
  options?: Array<{ _id?: any; text?: string; isCorrect?: boolean }>;
  correctAnswer?: string;
};

export type SubmittedAnswer = {
  questionId: string;
  selectedOption?: string;
  answer?: string;
};

export type GradedAnswer = {
  question: any;
  selectedOption?: string;
  answer?: string;
  isCorrect: boolean;
  points: number;
};

export type GradingResult = {
  totalPoints: number;
  earnedPoints: number;
  score: number;
  passed: boolean;
  gradedAnswers: GradedAnswer[];
};

export function gradeAttempt(
  questions: GradingQuestion[],
  answers: SubmittedAnswer[],
  passingScore: number
): GradingResult {
  let totalPoints = 0;
  let earnedPoints = 0;
  const gradedAnswers: GradedAnswer[] = [];

  for (const question of questions) {
    const qPoints = question.points || 0;
    totalPoints += qPoints;
    const userAnswer = answers.find(
      a => a.questionId === String(question._id)
    );

    let isCorrect = false;

    if (userAnswer) {
      switch (question.type) {
        case 'mcq':
        case 'single':
        case 'truefalse': {
          const selectedOpt = question.options?.find(
            o =>
              (o._id != null && String(o._id) === userAnswer.selectedOption) ||
              o.text === userAnswer.selectedOption
          );
          isCorrect = !!selectedOpt?.isCorrect;
          break;
        }
        case 'fillinblank': {
          isCorrect =
            !!userAnswer.answer &&
            !!question.correctAnswer &&
            userAnswer.answer.trim().toLowerCase() ===
              question.correctAnswer.trim().toLowerCase();
          break;
        }
      }
    }

    if (isCorrect) earnedPoints += qPoints;

    gradedAnswers.push({
      question: question._id,
      selectedOption: userAnswer?.selectedOption,
      answer: userAnswer?.answer,
      isCorrect,
      points: isCorrect ? qPoints : 0,
    });
  }

  const score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  const passed = score >= passingScore;
  return { totalPoints, earnedPoints, score, passed, gradedAnswers };
}
