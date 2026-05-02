import React, { useState } from "react";
import {
  C,
  Phone,
  ProgressBar,
  AnswerTile,
  type AnswerOption,
} from "./_shared";

// ─── Question data ────────────────────────────────────────────────────────────

type Question = {
  id: string;
  step: number;
  category: string;
  title: string;
  helperText?: string;
  options: AnswerOption[];
  skipIfAnswerIs?: { questionId: string; answerIndex: number };
};

const QUESTIONS: Question[] = [
  {
    id: "competitive_history",
    step: 1,
    category: "Your Background",
    title: "Have you ever played competitive tennis?",
    helperText:
      "Competitive means league matches, tournaments, or ranked club events — not just rallying with friends.",
    options: [
      { icon: "🏆", label: "Yes — tournaments or league", sub: "Regional, national, or international events" },
      { icon: "🎾", label: "Yes — club / social league", sub: "Internal club competition or social ladder" },
      { icon: "🌱", label: "No — recreational only", sub: "Just playing for fun, no competitions" },
      { icon: "❓", label: "Not sure", sub: "I'm somewhere in between" },
    ],
  },
  {
    id: "national_rating",
    step: 2,
    category: "Your Rating",
    title: "Do you have an official national rating?",
    helperText:
      "This can be any system — USTA (USA), LTA (UK), WTN, ITF, KNLTB/DSS (Netherlands), Tennis Australia, etc. If you're unsure, choose 'I don't know'.",
    options: [
      { icon: "🌍", label: "Yes — enter my rating", sub: "USTA, LTA, WTN, ITF, KNLTB/DSS or any national system" },
      { icon: "🚫", label: "No official rating", sub: "I've never been officially rated" },
      { icon: "❓", label: "I don't know", sub: "I may have one but I'm not sure" },
    ],
  },
  {
    id: "rally_consistency",
    step: 3,
    category: "Skill Check",
    title: "In a rally from the baseline, how many shots can you keep going in a row?",
    helperText:
      "Think of a casual warm-up rally with someone at your level — not a competitive match.",
    options: [
      { icon: "1️⃣", label: "1–3 shots before the ball goes out", sub: "Still working on keeping the ball in" },
      { icon: "🔟", label: "4–10 consistent shots", sub: "Decent rally but errors creep in" },
      { icon: "💪", label: "10–20+ shots comfortably", sub: "Can sustain a long rally" },
      { icon: "🎯", label: "20+ with direction control", sub: "Can aim cross-court / down-the-line reliably" },
    ],
  },
  {
    id: "serve_reliability",
    step: 4,
    category: "Skill Check",
    title: "How would you describe your serve?",
    options: [
      { icon: "🤷", label: "Inconsistent — double faults often", sub: "Serving is my weakest shot" },
      { icon: "👍", label: "Gets it in most of the time", sub: "Reliable but mostly flat / slow" },
      { icon: "🔥", label: "Consistent with some pace", sub: "Can serve with spin or power regularly" },
      { icon: "⚡", label: "Weapon — can ace or force short returns", sub: "Serve is a big part of my game" },
    ],
  },
  {
    id: "match_frequency",
    step: 5,
    category: "Activity",
    title: "How often do you play tennis matches or sessions?",
    options: [
      { icon: "📅", label: "Rarely — a few times a year", sub: "Casual, no regular schedule" },
      { icon: "🗓️", label: "1–3 times a month", sub: "Regular but not frequent" },
      { icon: "📆", label: "Once a week or more", sub: "Part of my regular routine" },
      { icon: "🏅", label: "Multiple times a week", sub: "Tennis is a priority in my schedule" },
    ],
  },
  {
    id: "self_assessment",
    step: 6,
    category: "Self Assessment",
    title: "Overall, where do you honestly place yourself as a player?",
    helperText:
      "Be honest — you'll always be matched against people at your real level. Real matches will adjust it automatically.",
    options: [
      { icon: "🌱", label: "Beginner", sub: "Learning the basics, rallies are short" },
      { icon: "📈", label: "Intermediate", sub: "Rallies work, know the rules, some tactics" },
      { icon: "⚔️", label: "Advanced", sub: "Competitive player, consistent technique" },
      { icon: "🏆", label: "Elite / Professional", sub: "High-level competitive or ex-professional" },
    ],
  },
];

// ─── Modal shell ──────────────────────────────────────────────────────────────

function ModalHeader({
  onClose,
  step,
  total,
  category,
}: {
  onClose: () => void;
  step: number;
  total: number;
  category: string;
}) {
  return (
    <div
      style={{
        padding: "14px 16px 10px",
        flexShrink: 0,
        borderBottom: `1px solid ${C.divider}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 800,
              color: C.cyan,
              letterSpacing: 1.8,
              textTransform: "uppercase",
              marginBottom: 2,
            }}
          >
            Glow Level Assessment
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.textMuted }}>
            {category}
          </div>
        </div>
        <div
          onClick={onClose}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            background: C.chipStrong,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            color: C.textMuted,
            cursor: "pointer",
          }}
        >
          ✕
        </div>
      </div>
      <ProgressBar step={step} total={total} />
    </div>
  );
}

// ─── Assessment Wizard screen ─────────────────────────────────────────────────

function AssessmentScreen({
  question,
  selectedIndex,
  onSelect,
  onBack,
  onNext,
  isLast,
}: {
  question: Question;
  selectedIndex: number | null;
  onSelect: (i: number) => void;
  onBack: () => void;
  onNext: () => void;
  isLast: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <ModalHeader
        onClose={onBack}
        step={question.step}
        total={QUESTIONS.length}
        category={question.category}
      />

      {/* Question body */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "18px 16px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: C.text,
            lineHeight: 1.3,
            marginBottom: 2,
          }}
        >
          {question.title}
        </div>

        {question.helperText ? (
          <div
            style={{
              fontSize: 11,
              color: C.textMuted,
              lineHeight: 1.6,
              padding: "8px 12px",
              background: C.chip,
              borderRadius: 10,
              border: `1px solid ${C.divider}`,
              marginBottom: 4,
            }}
          >
            {question.helperText}
          </div>
        ) : null}

        {question.options.map((opt, i) => (
          <div key={i} onClick={() => onSelect(i)}>
            <AnswerTile opt={opt} selected={selectedIndex === i} />
          </div>
        ))}
      </div>

      {/* Footer nav */}
      <div
        style={{
          padding: "12px 16px 16px",
          borderTop: `1px solid ${C.divider}`,
          display: "flex",
          gap: 10,
          flexShrink: 0,
        }}
      >
        {question.step > 1 ? (
          <div
            onClick={onBack}
            style={{
              flex: 0,
              minWidth: 52,
              height: 48,
              background: C.chipStrong,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              color: C.textMuted,
              cursor: "pointer",
            }}
          >
            ←
          </div>
        ) : null}

        <div
          onClick={selectedIndex !== null ? onNext : undefined}
          style={{
            flex: 1,
            height: 48,
            borderRadius: 12,
            background: selectedIndex !== null
              ? `linear-gradient(135deg, #00E5FF, #0099CC)`
              : C.chipStrong,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            cursor: selectedIndex !== null ? "pointer" : "default",
            opacity: selectedIndex !== null ? 1 : 0.45,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: selectedIndex !== null ? "#000" : C.textMuted,
            }}
          >
            {isLast ? "See My Result" : "Next"}
          </span>
          {selectedIndex !== null ? (
            <span style={{ fontSize: 14, color: "#000" }}>→</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Exported mockup ──────────────────────────────────────────────────────────

export default function AssessmentWizardMockup() {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(
    QUESTIONS.map(() => null)
  );

  const question = QUESTIONS[currentStep];
  const selectedIndex = answers[currentStep];
  const isLast = currentStep === QUESTIONS.length - 1;

  const handleSelect = (i: number) => {
    const next = [...answers];
    next[currentStep] = i;
    setAnswers(next);
  };

  const handleNext = () => {
    if (currentStep < QUESTIONS.length - 1) {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  };

  return (
    <Phone label="ASSESSMENT">
      {/* Full-screen modal overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: C.bg,
          display: "flex",
          flexDirection: "column",
          zIndex: 10,
        }}
      >
        {/* Thin top accent */}
        <div
          style={{
            height: 3,
            background: `linear-gradient(90deg, #00E5FF, #E040FB, #C8FF3D)`,
            flexShrink: 0,
          }}
        />

        <AssessmentScreen
          question={question}
          selectedIndex={selectedIndex}
          onSelect={handleSelect}
          onBack={handleBack}
          onNext={handleNext}
          isLast={isLast}
        />
      </div>
    </Phone>
  );
}
