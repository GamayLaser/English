export interface WritingEvaluation {
  totalScore: number;
  scores: { content: number; grammar: number; vocabulary: number; structure: number };
  feedback: string;
  strengths: string[];
  improvements: string[];
  revisedWriting: string;
}
