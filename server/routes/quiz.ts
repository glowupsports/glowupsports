import { Router } from "express";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface QuizQuestion {
  q: string;
  opts: string[];
  correct: string;
  explanation: string;
}

const FALLBACK_QUESTIONS: QuizQuestion[] = [
  {
    q: "What is the term for a score of zero in tennis?",
    opts: ["Nil", "Love", "Zero", "Duck"],
    correct: "Love",
    explanation: "In tennis, zero points is called 'love', believed to derive from the French word 'l'oeuf' meaning egg, as zero resembles an egg.",
  },
  {
    q: "What's it called when you hit the ball before it bounces?",
    opts: ["Smash", "Volley", "Lob", "Drop shot"],
    correct: "Volley",
    explanation: "A volley is when you strike the ball in the air before it bounces — typically from close to the net.",
  },
  {
    q: "How many points do you need to win a game after deuce?",
    opts: ["1", "2", "3", "It goes to a tiebreak"],
    correct: "2",
    explanation: "After deuce (40-40), a player must win two consecutive points — advantage then game — to clinch the game.",
  },
  {
    q: "What surface is Wimbledon played on?",
    opts: ["Clay", "Hard court", "Grass", "Carpet"],
    correct: "Grass",
    explanation: "Wimbledon, the oldest Grand Slam, is played on natural grass courts and is famous for its all-white dress code.",
  },
  {
    q: "What is an ace in tennis?",
    opts: [
      "A perfect drop shot",
      "A serve the opponent can't touch",
      "Winning a set 6-0",
      "A shot that lands on the line",
    ],
    correct: "A serve the opponent can't touch",
    explanation: "An ace is a legal serve that lands in the service box and is not touched by the receiver, winning the point outright.",
  },
];

let cachedDate = "";
let cachedQuestions: QuizQuestion[] = [];

async function generateOrGetCachedQuestions(): Promise<QuizQuestion[]> {
  const today = new Date().toISOString().slice(0, 10);

  if (cachedDate === today && cachedQuestions.length > 0) {
    return cachedQuestions;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a tennis expert creating quiz questions for a tennis coaching app. Return ONLY valid JSON, no explanation, no markdown.",
        },
        {
          role: "user",
          content: `Generate exactly 5 multiple-choice tennis quiz questions. Mix difficulty: 2 easy, 2 medium, 1 hard. Cover: rules, scoring, technique, Grand Slams, history, equipment. Return a JSON array of exactly 5 items where each item has exactly these fields: "q" (question string), "opts" (array of exactly 4 answer strings), "correct" (one of the opts strings, verbatim), "explanation" (1-2 sentences explaining the correct answer).`,
        },
      ],
      max_tokens: 900,
      temperature: 0.8,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const jsonStart = raw.indexOf("[");
    const jsonEnd = raw.lastIndexOf("]");
    if (jsonStart === -1 || jsonEnd === -1) throw new Error("No JSON array found");

    const parsed: QuizQuestion[] = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));

    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Empty array");

    const valid = parsed.filter(
      (q) =>
        typeof q.q === "string" &&
        Array.isArray(q.opts) &&
        q.opts.length === 4 &&
        typeof q.correct === "string" &&
        q.opts.includes(q.correct) &&
        typeof q.explanation === "string"
    );

    if (valid.length !== 5) throw new Error(`Expected 5 valid questions, got ${valid.length}`);

    cachedDate = today;
    cachedQuestions = valid;
    return cachedQuestions;
  } catch {
    cachedDate = today;
    cachedQuestions = FALLBACK_QUESTIONS;
    return FALLBACK_QUESTIONS;
  }
}

router.get("/tennis-iq", async (_req, res) => {
  try {
    const questions = await generateOrGetCachedQuestions();
    res.json({ questions });
  } catch {
    res.json({ questions: FALLBACK_QUESTIONS });
  }
});

export default router;
