import { describe, it, expect } from 'vitest';
import { gradeAttempt, type GradingQuestion } from '@/lib/exam-grading';

const mkMcq = (id: string, points = 5): GradingQuestion => ({
  _id: id,
  type: 'mcq',
  points,
  options: [
    { _id: `${id}-A`, text: 'A', isCorrect: false },
    { _id: `${id}-B`, text: 'B', isCorrect: true },
    { _id: `${id}-C`, text: 'C', isCorrect: false },
  ],
});

const mkFib = (id: string, answer: string, points = 5): GradingQuestion => ({
  _id: id,
  type: 'fillinblank',
  points,
  correctAnswer: answer,
});

describe('gradeAttempt', () => {
  it('grades MCQ correctly when option matches by id', () => {
    const r = gradeAttempt(
      [mkMcq('q1')],
      [{ questionId: 'q1', selectedOption: 'q1-B' }],
      60
    );
    expect(r.earnedPoints).toBe(5);
    expect(r.totalPoints).toBe(5);
    expect(r.score).toBe(100);
    expect(r.passed).toBe(true);
    expect(r.gradedAnswers[0].isCorrect).toBe(true);
  });

  it('grades MCQ correctly when option matches by text', () => {
    const r = gradeAttempt(
      [mkMcq('q1')],
      [{ questionId: 'q1', selectedOption: 'B' }],
      60
    );
    expect(r.gradedAnswers[0].isCorrect).toBe(true);
  });

  it('marks MCQ incorrect when wrong option selected', () => {
    const r = gradeAttempt(
      [mkMcq('q1')],
      [{ questionId: 'q1', selectedOption: 'A' }],
      60
    );
    expect(r.earnedPoints).toBe(0);
    expect(r.score).toBe(0);
    expect(r.passed).toBe(false);
    expect(r.gradedAnswers[0].isCorrect).toBe(false);
  });

  it('marks question incorrect when no answer was submitted', () => {
    const r = gradeAttempt([mkMcq('q1')], [], 60);
    expect(r.earnedPoints).toBe(0);
    expect(r.gradedAnswers).toHaveLength(1);
    expect(r.gradedAnswers[0].isCorrect).toBe(false);
  });

  it('grades fill-in-blank case-insensitively and trims', () => {
    const r = gradeAttempt(
      [mkFib('q1', 'Paris')],
      [{ questionId: 'q1', answer: '  paris  ' }],
      60
    );
    expect(r.gradedAnswers[0].isCorrect).toBe(true);
  });

  it('marks fill-in-blank wrong when answer differs', () => {
    const r = gradeAttempt(
      [mkFib('q1', 'Paris')],
      [{ questionId: 'q1', answer: 'London' }],
      60
    );
    expect(r.gradedAnswers[0].isCorrect).toBe(false);
  });

  it('rejects empty fill-in-blank answer even if correctAnswer is empty (no free points)', () => {
    const r = gradeAttempt(
      [mkFib('q1', '')],
      [{ questionId: 'q1', answer: '' }],
      60
    );
    expect(r.gradedAnswers[0].isCorrect).toBe(false);
  });

  it('computes mixed score and passing threshold', () => {
    const qs = [mkMcq('q1', 5), mkMcq('q2', 5), mkFib('q3', 'cat', 10)];
    const r = gradeAttempt(
      qs,
      [
        { questionId: 'q1', selectedOption: 'q1-B' }, // +5
        { questionId: 'q2', selectedOption: 'q2-A' }, // 0
        { questionId: 'q3', answer: 'CAT' },          // +10
      ],
      60
    );
    expect(r.totalPoints).toBe(20);
    expect(r.earnedPoints).toBe(15);
    expect(r.score).toBe(75);
    expect(r.passed).toBe(true);
  });

  it('passed=false when score below threshold', () => {
    const qs = [mkMcq('q1', 5), mkMcq('q2', 5)];
    const r = gradeAttempt(qs, [{ questionId: 'q1', selectedOption: 'q1-B' }], 60);
    expect(r.score).toBe(50);
    expect(r.passed).toBe(false);
  });

  it('returns score 0 when totalPoints is 0', () => {
    const r = gradeAttempt([], [], 60);
    expect(r.totalPoints).toBe(0);
    expect(r.score).toBe(0);
    expect(r.passed).toBe(false);
  });

  it('grades truefalse like single-choice', () => {
    const q: GradingQuestion = {
      _id: 'q1',
      type: 'truefalse',
      points: 2,
      options: [
        { _id: 't', text: 'True', isCorrect: true },
        { _id: 'f', text: 'False', isCorrect: false },
      ],
    };
    const right = gradeAttempt([q], [{ questionId: 'q1', selectedOption: 't' }], 60);
    expect(right.gradedAnswers[0].isCorrect).toBe(true);
    const wrong = gradeAttempt([q], [{ questionId: 'q1', selectedOption: 'f' }], 60);
    expect(wrong.gradedAnswers[0].isCorrect).toBe(false);
  });
});
