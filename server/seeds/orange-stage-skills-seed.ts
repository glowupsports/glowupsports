/**
 * ORANGE STAGE Skills - Developing Players (ages 7-10)
 * 
 * ORANGE 3 → ORANGE 2 → ORANGE 1
 * Focus: Technique consolidation, tactical awareness, match development
 * Ball: Orange ball (50% compression)
 * Court: Orange court (18m x 6.4m - 3/4 court)
 * 
 * KNLTB-style: 1 = best/ready for next stage, 3 = just starting
 */

interface SkillRubric {
  score: number;
  label: string;
  observable: string;
}

interface OrangeSkill {
  id: string;
  pillar: "TECHNIQUE" | "TACTICAL" | "PHYSICAL" | "MENTAL" | "SOCIAL" | "MATCH";
  category?: string;
  name: string;
  description: string;
  rubric: SkillRubric[];
}

interface PillarWeighting {
  technique: number;
  tactical: number;
  physical: number;
  mental: number;
  social: number;
  match: number;
}

interface PromotionRequirements {
  techniqueMinPercent?: number;
  tacticalMinPercent?: number;
  physicalMinPercent?: number;
  mentalMinPercent?: number;
  matchMinPercent?: number;
  coachConfirmation?: boolean;
  minSessions?: number;
}

interface OrangeLevelConfig {
  levelId: string;
  rank: number;
  name: string;
  subtitle: string;
  abilitySnapshot: string;
  philosophy: string;
  pillarWeighting: PillarWeighting;
  promotionRequirements: PromotionRequirements;
  skills: OrangeSkill[];
}

export const ORANGE_STAGE_SKILLS_BY_LEVEL: Record<string, OrangeLevelConfig> = {
  "ORANGE_3": {
    levelId: "ORANGE_3",
    rank: 3,
    name: "Progressor",
    subtitle: "Transition to Orange",
    abilitySnapshot: "Ik leer op de grotere baan te spelen!",
    philosophy: "Aanpassen aan grotere baan, snellere bal, en langere rally's.",
    pillarWeighting: {
      technique: 35,
      tactical: 20,
      physical: 20,
      mental: 15,
      social: 5,
      match: 5,
    },
    promotionRequirements: {
      techniqueMinPercent: 65,
      tacticalMinPercent: 55,
      physicalMinPercent: 60,
      coachConfirmation: true,
      minSessions: 12,
    },
    skills: [
      // TECHNIQUE - FOREHAND (10 skills)
      { id: "O3_FH_GRIP", pillar: "TECHNIQUE", category: "Forehand", name: "Orange Grip Adjustment", description: "Past grip aan voor snellere bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Gebruikt nog Red grip" },
          { score: 1, label: "Emerging", observable: "Aanpassing gaande" },
          { score: 2, label: "Achieved", observable: "Correcte grip voor Orange" },
        ]
      },
      { id: "O3_FH_TOPSPIN", pillar: "TECHNIQUE", category: "Forehand", name: "FH Topspin Orange", description: "Topspin op langere baan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Platte bal" },
          { score: 1, label: "Emerging", observable: "Soms topspin" },
          { score: 2, label: "Achieved", observable: "Consistente topspin" },
        ]
      },
      { id: "O3_FH_DEPTH", pillar: "TECHNIQUE", category: "Forehand", name: "FH Depth Orange", description: "Diepte op grotere baan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Korte ballen" },
          { score: 1, label: "Emerging", observable: "Soms diep" },
          { score: 2, label: "Achieved", observable: "Consistente diepte" },
        ]
      },
      { id: "O3_FH_CROSSCOURT", pillar: "TECHNIQUE", category: "Forehand", name: "FH Crosscourt Long", description: "Crosscourt over langere afstand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Te kort of wide" },
          { score: 1, label: "Emerging", observable: "Soms succesvol" },
          { score: 2, label: "Achieved", observable: "Betrouwbare long crosscourt" },
        ]
      },
      { id: "O3_FH_DOWNLINE", pillar: "TECHNIQUE", category: "Forehand", name: "FH Down Line Long", description: "Down the line op grotere baan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen controle" },
          { score: 1, label: "Emerging", observable: "Soms succesvol" },
          { score: 2, label: "Achieved", observable: "Betrouwbare down the line" },
        ]
      },
      { id: "O3_FH_RALLY8", pillar: "TECHNIQUE", category: "Forehand", name: "8 Ball Rally FH", description: "8+ forehand rally op Orange",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Max 4 ballen" },
          { score: 1, label: "Emerging", observable: "5-7 ballen" },
          { score: 2, label: "Achieved", observable: "8+ ballen" },
        ]
      },
      { id: "O3_FH_FOOTWORK", pillar: "TECHNIQUE", category: "Forehand", name: "FH Footwork Orange", description: "Voetenwerk voor grotere baan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Te traag/onjuist" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Goed voetenwerk op Orange" },
        ]
      },
      { id: "O3_FH_INSIDE_OUT", pillar: "TECHNIQUE", category: "Forehand", name: "FH Inside Out Intro", description: "Begint inside out forehand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kent slag niet" },
          { score: 1, label: "Emerging", observable: "Probeert" },
          { score: 2, label: "Achieved", observable: "Kan inside out slaan" },
        ]
      },
      { id: "O3_FH_OPEN_STANCE", pillar: "TECHNIQUE", category: "Forehand", name: "FH Open Stance", description: "Open stance forehand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Alleen neutral stance" },
          { score: 1, label: "Emerging", observable: "Soms open" },
          { score: 2, label: "Achieved", observable: "Kan beide stances" },
        ]
      },
      { id: "O3_FH_POWER", pillar: "TECHNIQUE", category: "Forehand", name: "FH Power Development", description: "Ontwikkelt kracht in forehand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weinig kracht" },
          { score: 1, label: "Emerging", observable: "Soms krachtig" },
          { score: 2, label: "Achieved", observable: "Consistente kracht" },
        ]
      },

      // TECHNIQUE - BACKHAND (9 skills)
      { id: "O3_BH_TOPSPIN", pillar: "TECHNIQUE", category: "Backhand", name: "BH Topspin Orange", description: "Topspin backhand op Orange",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Platte BH" },
          { score: 1, label: "Emerging", observable: "Soms topspin" },
          { score: 2, label: "Achieved", observable: "Consistente topspin BH" },
        ]
      },
      { id: "O3_BH_CROSSCOURT", pillar: "TECHNIQUE", category: "Backhand", name: "BH Crosscourt Long", description: "BH crosscourt lange afstand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Te kort" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Betrouwbare long crosscourt BH" },
        ]
      },
      { id: "O3_BH_DOWNLINE", pillar: "TECHNIQUE", category: "Backhand", name: "BH Down Line", description: "BH down the line",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen controle" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Betrouwbare DTL BH" },
        ]
      },
      { id: "O3_BH_RALLY5", pillar: "TECHNIQUE", category: "Backhand", name: "5 Ball BH Rally", description: "5+ backhand rally",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Max 2" },
          { score: 1, label: "Emerging", observable: "3-4 ballen" },
          { score: 2, label: "Achieved", observable: "5+ BH's" },
        ]
      },
      { id: "O3_BH_SLICE", pillar: "TECHNIQUE", category: "Backhand", name: "BH Slice Development", description: "Ontwikkelt slice backhand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen slice" },
          { score: 1, label: "Emerging", observable: "Basis slice" },
          { score: 2, label: "Achieved", observable: "Effectieve slice" },
        ]
      },
      { id: "O3_BH_DEPTH", pillar: "TECHNIQUE", category: "Backhand", name: "BH Depth Control", description: "Diepte controle backhand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Korte BH's" },
          { score: 1, label: "Emerging", observable: "Soms diep" },
          { score: 2, label: "Achieved", observable: "Consistente diepte" },
        ]
      },
      { id: "O3_BH_FOOTWORK", pillar: "TECHNIQUE", category: "Backhand", name: "BH Footwork", description: "Voetenwerk bij BH",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onjuist" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Correct voetenwerk" },
        ]
      },
      { id: "O3_BH_STABILITY", pillar: "TECHNIQUE", category: "Backhand", name: "BH Stability", description: "Stabiele backhand onder druk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onstabiel" },
          { score: 1, label: "Emerging", observable: "Soms stabiel" },
          { score: 2, label: "Achieved", observable: "Stabiel onder druk" },
        ]
      },
      { id: "O3_BH_OPTION", pillar: "TECHNIQUE", category: "Backhand", name: "BH Shot Options", description: "Meerdere opties bij BH",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Eén optie" },
          { score: 1, label: "Emerging", observable: "Twee opties" },
          { score: 2, label: "Achieved", observable: "Meerdere opties" },
        ]
      },

      // TECHNIQUE - SERVE (8 skills)
      { id: "O3_SV_OVERHAND", pillar: "TECHNIQUE", category: "Serve", name: "Full Overhand Serve", description: "Volledige overhand serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Incomplete techniek" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Volledige overhand" },
        ]
      },
      { id: "O3_SV_TOSS", pillar: "TECHNIQUE", category: "Serve", name: "Consistent Toss Orange", description: "Consistente toss",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Inconsistente toss" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Betrouwbare toss" },
        ]
      },
      { id: "O3_SV_POWER", pillar: "TECHNIQUE", category: "Serve", name: "Serve Power Intro", description: "Ontwikkelt serve power",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weinig kracht" },
          { score: 1, label: "Emerging", observable: "Soms krachtig" },
          { score: 2, label: "Achieved", observable: "Goede kracht" },
        ]
      },
      { id: "O3_SV_SPIN", pillar: "TECHNIQUE", category: "Serve", name: "Serve Spin Intro", description: "Begint spin serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Platte serve" },
          { score: 1, label: "Emerging", observable: "Probeert spin" },
          { score: 2, label: "Achieved", observable: "Kan spin serve" },
        ]
      },
      { id: "O3_SV_PLACEMENT", pillar: "TECHNIQUE", category: "Serve", name: "Serve Placement", description: "Serve plaatsing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen controle" },
          { score: 1, label: "Emerging", observable: "Soms gericht" },
          { score: 2, label: "Achieved", observable: "Kan T en Wide" },
        ]
      },
      { id: "O3_SV_SECOND", pillar: "TECHNIQUE", category: "Serve", name: "Reliable Second Serve", description: "Betrouwbare tweede serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Vaak dubbele fout" },
          { score: 1, label: "Emerging", observable: "Soms betrouwbaar" },
          { score: 2, label: "Achieved", observable: "Betrouwbaar" },
        ]
      },
      { id: "O3_SV_60PCT", pillar: "TECHNIQUE", category: "Serve", name: "60% First Serve", description: "60%+ eerste serve in",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onder 40%" },
          { score: 1, label: "Emerging", observable: "40-60%" },
          { score: 2, label: "Achieved", observable: "60%+" },
        ]
      },
      { id: "O3_SV_RITUAL", pillar: "TECHNIQUE", category: "Serve", name: "Serve Ritual", description: "Heeft serve routine",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen routine" },
          { score: 1, label: "Emerging", observable: "Basis routine" },
          { score: 2, label: "Achieved", observable: "Consistente routine" },
        ]
      },

      // TECHNIQUE - VOLLEY & NET (6 skills)
      { id: "O3_VL_PUNCH", pillar: "TECHNIQUE", category: "Volley", name: "Punch Volley Orange", description: "Punch volley op Orange",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Swingt te veel" },
          { score: 1, label: "Emerging", observable: "Compacter" },
          { score: 2, label: "Achieved", observable: "Goede punch volley" },
        ]
      },
      { id: "O3_VL_ANGLES", pillar: "TECHNIQUE", category: "Volley", name: "Volley Angles", description: "Volley hoeken maken",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Alleen recht" },
          { score: 1, label: "Emerging", observable: "Soms hoek" },
          { score: 2, label: "Achieved", observable: "Maakt effectieve hoeken" },
        ]
      },
      { id: "O3_VL_DEPTH", pillar: "TECHNIQUE", category: "Volley", name: "Volley Depth", description: "Volley diepte controle",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen controle" },
          { score: 1, label: "Emerging", observable: "Soms diep" },
          { score: 2, label: "Achieved", observable: "Kiest kort/diep" },
        ]
      },
      { id: "O3_OH_SMASH", pillar: "TECHNIQUE", category: "Overhead", name: "Smash Orange", description: "Smash op Orange baan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Mist smash" },
          { score: 1, label: "Emerging", observable: "Soms succesvol" },
          { score: 2, label: "Achieved", observable: "Betrouwbare smash" },
        ]
      },
      { id: "O3_VL_APPROACH", pillar: "TECHNIQUE", category: "Transition", name: "Approach Shot", description: "Approach naar net",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen approach" },
          { score: 1, label: "Emerging", observable: "Basis approach" },
          { score: 2, label: "Achieved", observable: "Effectieve approach" },
        ]
      },
      { id: "O3_VL_SPLIT", pillar: "TECHNIQUE", category: "Volley", name: "Split Step Net", description: "Split step bij net",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen split" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Altijd split step" },
        ]
      },

      // TACTICAL (10 skills)
      { id: "O3_TAC_LONGER", pillar: "TACTICAL", category: "Court", name: "Uses Longer Court", description: "Speelt met diepte",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Speelt kort" },
          { score: 1, label: "Emerging", observable: "Soms diep" },
          { score: 2, label: "Achieved", observable: "Gebruikt hele baan" },
        ]
      },
      { id: "O3_TAC_PATTERNS", pillar: "TACTICAL", category: "Patterns", name: "Basic Patterns", description: "Speelt basispatronen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen patronen" },
          { score: 1, label: "Emerging", observable: "Eén patroon" },
          { score: 2, label: "Achieved", observable: "Meerdere patronen" },
        ]
      },
      { id: "O3_TAC_CROSSCOURT", pillar: "TACTICAL", category: "Patterns", name: "Crosscourt Rally", description: "Rally't crosscourt",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan niet houden" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Consistente CC rally" },
        ]
      },
      { id: "O3_TAC_BUILD", pillar: "TACTICAL", category: "Construction", name: "Build Point", description: "Bouwt punt op",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Slaat winners te vroeg" },
          { score: 1, label: "Emerging", observable: "Soms geduldig" },
          { score: 2, label: "Achieved", observable: "Bouwt punt op" },
        ]
      },
      { id: "O3_TAC_OPEN", pillar: "TACTICAL", category: "Construction", name: "Creates Opening", description: "Creëert opening",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen opening" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Creëert kansen" },
        ]
      },
      { id: "O3_TAC_SERVE_PLUS", pillar: "TACTICAL", category: "Serve", name: "Serve +1 Orange", description: "Serve + volgende slag",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen plan" },
          { score: 1, label: "Emerging", observable: "Soms klaar" },
          { score: 2, label: "Achieved", observable: "Altijd klaar voor +1" },
        ]
      },
      { id: "O3_TAC_RETURN", pillar: "TACTICAL", category: "Return", name: "Return Tactics", description: "Tactische return",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Slaat terug zonder plan" },
          { score: 1, label: "Emerging", observable: "Soms tactisch" },
          { score: 2, label: "Achieved", observable: "Tactische return keuzes" },
        ]
      },
      { id: "O3_TAC_RECOVERY", pillar: "TACTICAL", category: "Positioning", name: "Smart Recovery", description: "Slim herstellen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkeerde positie" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Slimme recovery" },
        ]
      },
      { id: "O3_TAC_OPPONENT", pillar: "TACTICAL", category: "Strategy", name: "Reads Opponent", description: "Leest tegenstander",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen observatie" },
          { score: 1, label: "Emerging", observable: "Begint te lezen" },
          { score: 2, label: "Achieved", observable: "Leest tegenstander" },
        ]
      },
      { id: "O3_TAC_MARGIN", pillar: "TACTICAL", category: "Risk", name: "Safety Margin", description: "Speelt met marge",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Veel fouten" },
          { score: 1, label: "Emerging", observable: "Soms marge" },
          { score: 2, label: "Achieved", observable: "Goede marge" },
        ]
      },

      // PHYSICAL (7 skills)
      { id: "O3_PHY_ENDURANCE", pillar: "PHYSICAL", category: "Fitness", name: "60 Min Session", description: "Houdt 60 min vol",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moe binnen 40 min" },
          { score: 1, label: "Emerging", observable: "45-55 min" },
          { score: 2, label: "Achieved", observable: "Actief 60 min" },
        ]
      },
      { id: "O3_PHY_SPEED", pillar: "PHYSICAL", category: "Movement", name: "Court Coverage", description: "Dekt hele baan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Te traag" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Goede dekking" },
        ]
      },
      { id: "O3_PHY_SPLIT", pillar: "PHYSICAL", category: "Movement", name: "Split Step Timing", description: "Split step timing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Te laat" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Goede timing" },
        ]
      },
      { id: "O3_PHY_LATERAL", pillar: "PHYSICAL", category: "Movement", name: "Lateral Movement", description: "Zijwaartse beweging",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Langzaam zijwaarts" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Snelle laterale beweging" },
        ]
      },
      { id: "O3_PHY_RECOVERY", pillar: "PHYSICAL", category: "Movement", name: "Physical Recovery", description: "Fysiek herstel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Traag herstel" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Snel fysiek herstel" },
        ]
      },
      { id: "O3_PHY_BALANCE", pillar: "PHYSICAL", category: "Balance", name: "Dynamic Balance", description: "Dynamische balans",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Valt uit balans" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Stabiele balans in beweging" },
        ]
      },
      { id: "O3_PHY_CORE", pillar: "PHYSICAL", category: "Strength", name: "Core Stability", description: "Romp stabiliteit",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwakke romp" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Stabiele romp" },
        ]
      },

      // MENTAL (6 skills)
      { id: "O3_MEN_FOCUS", pillar: "MENTAL", category: "Focus", name: "Match Focus", description: "Focus tijdens wedstrijd",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest focus" },
          { score: 1, label: "Emerging", observable: "Wisselend" },
          { score: 2, label: "Achieved", observable: "Gefocust hele match" },
        ]
      },
      { id: "O3_MEN_PRESSURE", pillar: "MENTAL", category: "Resilience", name: "Handles Pressure", description: "Omgaan met druk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkrampt" },
          { score: 1, label: "Emerging", observable: "Soms kalm" },
          { score: 2, label: "Achieved", observable: "Blijft kalm" },
        ]
      },
      { id: "O3_MEN_MISTAKES", pillar: "MENTAL", category: "Resilience", name: "Bounce Back", description: "Herstelt van fouten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Gefrustreerd na fout" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Herstelt snel" },
        ]
      },
      { id: "O3_MEN_ROUTINE", pillar: "MENTAL", category: "Rituals", name: "Pre-Point Routine", description: "Routine voor punt",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen routine" },
          { score: 1, label: "Emerging", observable: "Inconsistent" },
          { score: 2, label: "Achieved", observable: "Consistente routine" },
        ]
      },
      { id: "O3_MEN_EFFORT", pillar: "MENTAL", category: "Effort", name: "Consistent Effort", description: "Constante inzet",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wisselende inzet" },
          { score: 1, label: "Emerging", observable: "Meestal goed" },
          { score: 2, label: "Achieved", observable: "Altijd volle inzet" },
        ]
      },
      { id: "O3_MEN_POSITIVE", pillar: "MENTAL", category: "Attitude", name: "Positive Attitude", description: "Positieve houding",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Negatief" },
          { score: 1, label: "Emerging", observable: "Wisselend" },
          { score: 2, label: "Achieved", observable: "Altijd positief" },
        ]
      },

      // SOCIAL (4 skills)
      { id: "O3_SOC_FAIR", pillar: "SOCIAL", category: "Sportsmanship", name: "Fair Play", description: "Eerlijk spel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Oneerlijk" },
          { score: 1, label: "Emerging", observable: "Meestal eerlijk" },
          { score: 2, label: "Achieved", observable: "Altijd fair" },
        ]
      },
      { id: "O3_SOC_CALLS", pillar: "SOCIAL", category: "Rules", name: "Line Calls", description: "Eerlijke lijncalls",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Foute calls" },
          { score: 1, label: "Emerging", observable: "Meestal goed" },
          { score: 2, label: "Achieved", observable: "Altijd eerlijk" },
        ]
      },
      { id: "O3_SOC_RESPECT", pillar: "SOCIAL", category: "Etiquette", name: "Respect All", description: "Respect voor iedereen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Respectloos" },
          { score: 1, label: "Emerging", observable: "Meestal respectvol" },
          { score: 2, label: "Achieved", observable: "Altijd respectvol" },
        ]
      },
      { id: "O3_SOC_TEAM", pillar: "SOCIAL", category: "Group", name: "Team Player", description: "Teamspeler",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Individualist" },
          { score: 1, label: "Emerging", observable: "Soms teamspeler" },
          { score: 2, label: "Achieved", observable: "Goede teamspeler" },
        ]
      },

      // MATCH (5 skills)
      { id: "O3_MAT_COMPLETE", pillar: "MATCH", category: "Match Play", name: "Plays Full Match", description: "Speelt complete wedstrijd",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Maakt niet af" },
          { score: 1, label: "Emerging", observable: "Met moeite" },
          { score: 2, label: "Achieved", observable: "Speelt volledig uit" },
        ]
      },
      { id: "O3_MAT_SCORE", pillar: "MATCH", category: "Knowledge", name: "Keeps Score", description: "Houdt score bij",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kent score niet" },
          { score: 1, label: "Emerging", observable: "Met hulp" },
          { score: 2, label: "Achieved", observable: "Zelfstandig scoren" },
        ]
      },
      { id: "O3_MAT_SERVE_GAME", pillar: "MATCH", category: "Match Play", name: "Holds Serve", description: "Houdt service",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest vaak service" },
          { score: 1, label: "Emerging", observable: "Soms houden" },
          { score: 2, label: "Achieved", observable: "Houdt service regelmatig" },
        ]
      },
      { id: "O3_MAT_TIEBREAK", pillar: "MATCH", category: "Match Play", name: "Tiebreak Play", description: "Speelt tiebreak",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kent regels niet" },
          { score: 1, label: "Emerging", observable: "Met hulp" },
          { score: 2, label: "Achieved", observable: "Zelfstandig tiebreak" },
        ]
      },
      { id: "O3_MAT_COMPETE", pillar: "MATCH", category: "Competition", name: "Competes Well", description: "Goede wedstrijdmentaliteit",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen strijdlust" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Sterke wedstrijdmentaliteit" },
        ]
      },
    ],
  },

  "ORANGE_2": {
    levelId: "ORANGE_2",
    rank: 2,
    name: "Developer",
    subtitle: "Building Weapons",
    abilitySnapshot: "Ik ontwikkel mijn wapens en patronen!",
    philosophy: "Focus op het ontwikkelen van sterke slagen en tactische patronen.",
    pillarWeighting: {
      technique: 30,
      tactical: 25,
      physical: 20,
      mental: 15,
      social: 5,
      match: 5,
    },
    promotionRequirements: {
      techniqueMinPercent: 70,
      tacticalMinPercent: 65,
      matchMinPercent: 65,
      coachConfirmation: true,
      minSessions: 16,
    },
    skills: [
      // TECHNIQUE - FOREHAND WEAPONS (8 skills)
      { id: "O2_FH_WEAPON", pillar: "TECHNIQUE", category: "Forehand", name: "FH as Weapon", description: "Forehand is wapen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Neutrale FH" },
          { score: 1, label: "Emerging", observable: "Soms offensief" },
          { score: 2, label: "Achieved", observable: "FH is betrouwbaar wapen" },
        ]
      },
      { id: "O2_FH_WINNER", pillar: "TECHNIQUE", category: "Forehand", name: "FH Winner", description: "Maakt FH winners",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen winners" },
          { score: 1, label: "Emerging", observable: "Soms winner" },
          { score: 2, label: "Achieved", observable: "Regelmatige FH winners" },
        ]
      },
      { id: "O2_FH_INSIDE_OUT", pillar: "TECHNIQUE", category: "Forehand", name: "Inside Out FH", description: "Effectieve inside out",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan niet" },
          { score: 1, label: "Emerging", observable: "Soms succesvol" },
          { score: 2, label: "Achieved", observable: "Betrouwbare IO FH" },
        ]
      },
      { id: "O2_FH_HEAVY", pillar: "TECHNIQUE", category: "Forehand", name: "Heavy Topspin", description: "Zware topspin FH",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Lichte spin" },
          { score: 1, label: "Emerging", observable: "Soms zwaar" },
          { score: 2, label: "Achieved", observable: "Consistente heavy topspin" },
        ]
      },
      { id: "O2_FH_ANGLES", pillar: "TECHNIQUE", category: "Forehand", name: "FH Angles", description: "Hoekslag forehand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen hoeken" },
          { score: 1, label: "Emerging", observable: "Soms hoekje" },
          { score: 2, label: "Achieved", observable: "Maakt effectieve hoeken" },
        ]
      },
      { id: "O2_FH_ON_RISE", pillar: "TECHNIQUE", category: "Forehand", name: "FH on Rise", description: "FH op stuiterende bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wacht tot bal daalt" },
          { score: 1, label: "Emerging", observable: "Probeert" },
          { score: 2, label: "Achieved", observable: "Kan on the rise spelen" },
        ]
      },
      { id: "O2_FH_DEFENSE", pillar: "TECHNIQUE", category: "Forehand", name: "Defensive FH", description: "Verdedigende FH",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Alleen aanval" },
          { score: 1, label: "Emerging", observable: "Soms verdedigend" },
          { score: 2, label: "Achieved", observable: "Kan verdedigen met FH" },
        ]
      },
      { id: "O2_FH_RALLY12", pillar: "TECHNIQUE", category: "Forehand", name: "12 Ball Rally", description: "12+ ballen rally",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Max 8" },
          { score: 1, label: "Emerging", observable: "9-11" },
          { score: 2, label: "Achieved", observable: "12+ ballen consistent" },
        ]
      },

      // TECHNIQUE - BACKHAND DEVELOPMENT (7 skills)
      { id: "O2_BH_WEAPON", pillar: "TECHNIQUE", category: "Backhand", name: "BH Development", description: "BH wordt sterker",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwakke BH" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Sterke, betrouwbare BH" },
        ]
      },
      { id: "O2_BH_WINNER", pillar: "TECHNIQUE", category: "Backhand", name: "BH Winner", description: "Kan BH winner",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen winners" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Regelmatige BH winners" },
        ]
      },
      { id: "O2_BH_TOPSPIN", pillar: "TECHNIQUE", category: "Backhand", name: "Heavy BH Topspin", description: "Zware topspin BH",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Lichte spin" },
          { score: 1, label: "Emerging", observable: "Soms zwaar" },
          { score: 2, label: "Achieved", observable: "Consistente heavy topspin BH" },
        ]
      },
      { id: "O2_BH_SLICE_DEF", pillar: "TECHNIQUE", category: "Backhand", name: "Defensive Slice", description: "Verdedigende slice",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen slice" },
          { score: 1, label: "Emerging", observable: "Basis slice" },
          { score: 2, label: "Achieved", observable: "Effectieve verdedigende slice" },
        ]
      },
      { id: "O2_BH_ANGLES", pillar: "TECHNIQUE", category: "Backhand", name: "BH Angles", description: "Hoekslag backhand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen hoeken" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Maakt effectieve hoeken" },
        ]
      },
      { id: "O2_BH_RALLY8", pillar: "TECHNIQUE", category: "Backhand", name: "8 Ball BH Rally", description: "8+ BH rally",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Max 4" },
          { score: 1, label: "Emerging", observable: "5-7" },
          { score: 2, label: "Achieved", observable: "8+ BH's" },
        ]
      },
      { id: "O2_BH_PRESSURE", pillar: "TECHNIQUE", category: "Backhand", name: "BH Under Pressure", description: "BH onder druk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Breekt onder druk" },
          { score: 1, label: "Emerging", observable: "Soms stabiel" },
          { score: 2, label: "Achieved", observable: "Stabiel onder druk" },
        ]
      },

      // TECHNIQUE - SERVE DEVELOPMENT (7 skills)
      { id: "O2_SV_FLAT", pillar: "TECHNIQUE", category: "Serve", name: "Flat First Serve", description: "Platte eerste serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen kracht" },
          { score: 1, label: "Emerging", observable: "Soms krachtig" },
          { score: 2, label: "Achieved", observable: "Krachtige platte serve" },
        ]
      },
      { id: "O2_SV_SLICE", pillar: "TECHNIQUE", category: "Serve", name: "Slice Serve", description: "Slice serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen slice" },
          { score: 1, label: "Emerging", observable: "Probeert" },
          { score: 2, label: "Achieved", observable: "Effectieve slice serve" },
        ]
      },
      { id: "O2_SV_KICK", pillar: "TECHNIQUE", category: "Serve", name: "Kick Serve Intro", description: "Begint kick serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen kick" },
          { score: 1, label: "Emerging", observable: "Probeert" },
          { score: 2, label: "Achieved", observable: "Basis kick serve" },
        ]
      },
      { id: "O2_SV_70PCT", pillar: "TECHNIQUE", category: "Serve", name: "70% First Serve", description: "70%+ eerste serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onder 55%" },
          { score: 1, label: "Emerging", observable: "55-70%" },
          { score: 2, label: "Achieved", observable: "70%+" },
        ]
      },
      { id: "O2_SV_PLACEMENT", pillar: "TECHNIQUE", category: "Serve", name: "Serve Placement", description: "Serve plaatsing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Random" },
          { score: 1, label: "Emerging", observable: "Soms gericht" },
          { score: 2, label: "Achieved", observable: "Consistent T/Wide/Body" },
        ]
      },
      { id: "O2_SV_DISGUISE", pillar: "TECHNIQUE", category: "Serve", name: "Serve Disguise", description: "Serve vermomming",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Voorspelbaar" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Kan richting vermommen" },
        ]
      },
      { id: "O2_SV_RELIABLE_2ND", pillar: "TECHNIQUE", category: "Serve", name: "Reliable 2nd Serve", description: "Betrouwbare tweede",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Veel dubbele fouten" },
          { score: 1, label: "Emerging", observable: "Soms betrouwbaar" },
          { score: 2, label: "Achieved", observable: "Zeer betrouwbaar" },
        ]
      },

      // TECHNIQUE - RETURN & NET (6 skills)
      { id: "O2_RET_FIRST", pillar: "TECHNIQUE", category: "Return", name: "First Serve Return", description: "Return eerste serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Mist vaak" },
          { score: 1, label: "Emerging", observable: "Blok return" },
          { score: 2, label: "Achieved", observable: "Effectieve return" },
        ]
      },
      { id: "O2_RET_SECOND", pillar: "TECHNIQUE", category: "Return", name: "Attack 2nd Serve", description: "Aanval tweede serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Passief" },
          { score: 1, label: "Emerging", observable: "Soms offensief" },
          { score: 2, label: "Achieved", observable: "Aanvalt tweede serve" },
        ]
      },
      { id: "O2_VL_WINNERS", pillar: "TECHNIQUE", category: "Volley", name: "Volley Winners", description: "Volley winners",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen winners" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Maakt volley winners" },
        ]
      },
      { id: "O2_OH_CONSISTENT", pillar: "TECHNIQUE", category: "Overhead", name: "Consistent Smash", description: "Consistente smash",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Mist vaak" },
          { score: 1, label: "Emerging", observable: "Soms in" },
          { score: 2, label: "Achieved", observable: "Consistente smash" },
        ]
      },
      { id: "O2_APP_SHOT", pillar: "TECHNIQUE", category: "Transition", name: "Approach Options", description: "Approach opties",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Één optie" },
          { score: 1, label: "Emerging", observable: "Twee opties" },
          { score: 2, label: "Achieved", observable: "Meerdere approach opties" },
        ]
      },
      { id: "O2_DROP_LOB", pillar: "TECHNIQUE", category: "Specialty", name: "Drop & Lob", description: "Dropshot en lob",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kent niet" },
          { score: 1, label: "Emerging", observable: "Probeert" },
          { score: 2, label: "Achieved", observable: "Effectieve drop & lob" },
        ]
      },

      // TACTICAL (10 skills)
      { id: "O2_TAC_PATTERNS", pillar: "TACTICAL", category: "Patterns", name: "Multiple Patterns", description: "Meerdere patronen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Eén patroon" },
          { score: 1, label: "Emerging", observable: "Twee patronen" },
          { score: 2, label: "Achieved", observable: "3+ patronen" },
        ]
      },
      { id: "O2_TAC_WEAPON", pillar: "TACTICAL", category: "Patterns", name: "Uses Weapon", description: "Gebruikt wapen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen wapen" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Zet wapen effectief in" },
        ]
      },
      { id: "O2_TAC_CONSTRUCT", pillar: "TACTICAL", category: "Construction", name: "Point Construction", description: "Punt constructie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Random" },
          { score: 1, label: "Emerging", observable: "Soms plan" },
          { score: 2, label: "Achieved", observable: "Bouwt systematisch punt" },
        ]
      },
      { id: "O2_TAC_SERVE_T", pillar: "TACTICAL", category: "Serve", name: "Serve Tactics", description: "Serve tactiek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen tactiek" },
          { score: 1, label: "Emerging", observable: "Basis tactiek" },
          { score: 2, label: "Achieved", observable: "Slimme serve keuzes" },
        ]
      },
      { id: "O2_TAC_RETURN_T", pillar: "TACTICAL", category: "Return", name: "Return Tactics", description: "Return tactiek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen plan" },
          { score: 1, label: "Emerging", observable: "Soms tactisch" },
          { score: 2, label: "Achieved", observable: "Tactische return" },
        ]
      },
      { id: "O2_TAC_NET_APPROACH", pillar: "TACTICAL", category: "Net Play", name: "Net Approach", description: "Net aanval timing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Komt nooit naar net" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Goede timing" },
        ]
      },
      { id: "O2_TAC_DEFENSE", pillar: "TACTICAL", category: "Defense", name: "Defensive Tactics", description: "Verdedigings tactiek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen verdediging" },
          { score: 1, label: "Emerging", observable: "Basis" },
          { score: 2, label: "Achieved", observable: "Effectieve verdediging" },
        ]
      },
      { id: "O2_TAC_ADAPT", pillar: "TACTICAL", category: "Strategy", name: "Mid-Match Adapt", description: "Past aan tijdens wedstrijd",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen aanpassing" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Past effectief aan" },
        ]
      },
      { id: "O2_TAC_WEAK", pillar: "TACTICAL", category: "Strategy", name: "Attacks Weakness", description: "Speelt naar zwakte",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen observatie" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Zoekt en benut zwakte" },
        ]
      },
      { id: "O2_TAC_RISK", pillar: "TACTICAL", category: "Risk", name: "Risk Management", description: "Risico management",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Te risicovol/passief" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Goede risico inschatting" },
        ]
      },

      // PHYSICAL (6 skills)
      { id: "O2_PHY_ENDURANCE", pillar: "PHYSICAL", category: "Fitness", name: "75 Min Session", description: "Houdt 75 min vol",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moe binnen 50 min" },
          { score: 1, label: "Emerging", observable: "55-70 min" },
          { score: 2, label: "Achieved", observable: "Actief 75 min" },
        ]
      },
      { id: "O2_PHY_EXPLOSIVE", pillar: "PHYSICAL", category: "Movement", name: "Explosive Movement", description: "Explosieve beweging",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Trage start" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Explosieve start" },
        ]
      },
      { id: "O2_PHY_SLIDE", pillar: "PHYSICAL", category: "Movement", name: "Slide Step", description: "Glijpas/slide",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan niet glijden" },
          { score: 1, label: "Emerging", observable: "Probeert" },
          { score: 2, label: "Achieved", observable: "Effectieve slide" },
        ]
      },
      { id: "O2_PHY_STRETCH", pillar: "PHYSICAL", category: "Movement", name: "Stretch Shots", description: "Stretch slagen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen stretch" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Effectieve stretch shots" },
        ]
      },
      { id: "O2_PHY_POWER", pillar: "PHYSICAL", category: "Strength", name: "Leg Power", description: "Beenkracht",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwakke benen" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Sterke beenkracht" },
        ]
      },
      { id: "O2_PHY_AGILITY", pillar: "PHYSICAL", category: "Movement", name: "Change Direction", description: "Richtingsverandering",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Traag" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Snelle richting verandering" },
        ]
      },

      // MENTAL (5 skills)
      { id: "O2_MEN_COMPETE", pillar: "MENTAL", category: "Competition", name: "Competitive Drive", description: "Competitie drang",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen strijdlust" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Sterke strijdlust" },
        ]
      },
      { id: "O2_MEN_CLUTCH", pillar: "MENTAL", category: "Pressure", name: "Big Points", description: "Presteert op grote punten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkrampt" },
          { score: 1, label: "Emerging", observable: "Wisselend" },
          { score: 2, label: "Achieved", observable: "Sterk op grote punten" },
        ]
      },
      { id: "O2_MEN_PLAN", pillar: "MENTAL", category: "Strategy", name: "Game Plan", description: "Heeft wedstrijdplan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen plan" },
          { score: 1, label: "Emerging", observable: "Basis plan" },
          { score: 2, label: "Achieved", observable: "Duidelijk wedstrijdplan" },
        ]
      },
      { id: "O2_MEN_MOMENTUM", pillar: "MENTAL", category: "Awareness", name: "Momentum", description: "Voelt momentum",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen bewustzijn" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Voelt en benut momentum" },
        ]
      },
      { id: "O2_MEN_CONFIDENCE", pillar: "MENTAL", category: "Confidence", name: "Self Belief", description: "Zelfvertrouwen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen vertrouwen" },
          { score: 1, label: "Emerging", observable: "Wisselend" },
          { score: 2, label: "Achieved", observable: "Sterk zelfvertrouwen" },
        ]
      },

      // SOCIAL (3 skills)
      { id: "O2_SOC_LEADER", pillar: "SOCIAL", category: "Leadership", name: "Leadership", description: "Toont leiderschap",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen leiderschap" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Natuurlijke leider" },
        ]
      },
      { id: "O2_SOC_DOUBLES", pillar: "SOCIAL", category: "Doubles", name: "Doubles Partner", description: "Goede dubbelpartner",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Individualist" },
          { score: 1, label: "Emerging", observable: "Soms teamwork" },
          { score: 2, label: "Achieved", observable: "Uitstekende partner" },
        ]
      },
      { id: "O2_SOC_ETIQUETTE", pillar: "SOCIAL", category: "Etiquette", name: "Full Etiquette", description: "Volledige etiquette",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kent regels niet" },
          { score: 1, label: "Emerging", observable: "Meeste regels" },
          { score: 2, label: "Achieved", observable: "Volledige etiquette" },
        ]
      },

      // MATCH (5 skills)
      { id: "O2_MAT_TOURNEY", pillar: "MATCH", category: "Competition", name: "Tournament Play", description: "Speelt toernooien",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen toernooi ervaring" },
          { score: 1, label: "Emerging", observable: "Eerste toernooien" },
          { score: 2, label: "Achieved", observable: "Regelmatig toernooien" },
        ]
      },
      { id: "O2_MAT_WIN", pillar: "MATCH", category: "Match Play", name: "Wins Matches", description: "Wint wedstrijden",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wint zelden" },
          { score: 1, label: "Emerging", observable: "Soms winnen" },
          { score: 2, label: "Achieved", observable: "Wint regelmatig" },
        ]
      },
      { id: "O2_MAT_COMEBACK", pillar: "MATCH", category: "Match Play", name: "Comeback", description: "Kan terugkomen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geeft op" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Sterke comebacks" },
        ]
      },
      { id: "O2_MAT_CLOSE", pillar: "MATCH", category: "Match Play", name: "Closes Matches", description: "Sluit wedstrijden af",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkrampt bij matchpoint" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Sluit matches af" },
        ]
      },
      { id: "O2_MAT_DOUBLES", pillar: "MATCH", category: "Doubles", name: "Doubles Play", description: "Speelt dubbelspel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen dubbel ervaring" },
          { score: 1, label: "Emerging", observable: "Basis dubbel" },
          { score: 2, label: "Achieved", observable: "Goed dubbelspel" },
        ]
      },
    ],
  },

  "ORANGE_1": {
    levelId: "ORANGE_1",
    rank: 1,
    name: "Champion",
    subtitle: "Ready for Green",
    abilitySnapshot: "Ik ben klaar voor de volledige baan!",
    philosophy: "Alle vaardigheden op Orange niveau beheerst, klaar voor volledige baan.",
    pillarWeighting: {
      technique: 30,
      tactical: 25,
      physical: 20,
      mental: 15,
      social: 5,
      match: 5,
    },
    promotionRequirements: {
      techniqueMinPercent: 80,
      tacticalMinPercent: 75,
      matchMinPercent: 75,
      coachConfirmation: true,
      minSessions: 20,
    },
    skills: [
      // TECHNIQUE - Complete Strokes (12 skills)
      { id: "O1_FH_COMPLETE", pillar: "TECHNIQUE", category: "Forehand", name: "Complete FH", description: "Volledige forehand techniek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Incompleet" },
          { score: 1, label: "Emerging", observable: "Bijna compleet" },
          { score: 2, label: "Achieved", observable: "Volledige FH techniek" },
        ]
      },
      { id: "O1_FH_ALL_COURT", pillar: "TECHNIQUE", category: "Forehand", name: "FH All Court", description: "FH naar alle hoeken",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Beperkte richting" },
          { score: 1, label: "Emerging", observable: "Meeste richtingen" },
          { score: 2, label: "Achieved", observable: "Alle richtingen beheerst" },
        ]
      },
      { id: "O1_FH_RALLY15", pillar: "TECHNIQUE", category: "Forehand", name: "15+ Rally", description: "15+ ballen rally",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Max 10" },
          { score: 1, label: "Emerging", observable: "11-14" },
          { score: 2, label: "Achieved", observable: "15+ ballen" },
        ]
      },
      { id: "O1_BH_COMPLETE", pillar: "TECHNIQUE", category: "Backhand", name: "Complete BH", description: "Volledige backhand techniek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Incompleet" },
          { score: 1, label: "Emerging", observable: "Bijna compleet" },
          { score: 2, label: "Achieved", observable: "Volledige BH techniek" },
        ]
      },
      { id: "O1_BH_ALL_COURT", pillar: "TECHNIQUE", category: "Backhand", name: "BH All Court", description: "BH naar alle hoeken",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Beperkt" },
          { score: 1, label: "Emerging", observable: "Meeste richtingen" },
          { score: 2, label: "Achieved", observable: "Alle richtingen" },
        ]
      },
      { id: "O1_BH_SLICE_DROP", pillar: "TECHNIQUE", category: "Backhand", name: "Slice & Drop", description: "Slice en dropshot",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen variatie" },
          { score: 1, label: "Emerging", observable: "Basis variatie" },
          { score: 2, label: "Achieved", observable: "Effectieve variatie" },
        ]
      },
      { id: "O1_SV_COMPLETE", pillar: "TECHNIQUE", category: "Serve", name: "Complete Serve", description: "Volledige serve techniek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Incompleet" },
          { score: 1, label: "Emerging", observable: "Bijna compleet" },
          { score: 2, label: "Achieved", observable: "Volledige serve techniek" },
        ]
      },
      { id: "O1_SV_75PCT", pillar: "TECHNIQUE", category: "Serve", name: "75% First Serve", description: "75%+ eerste serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onder 60%" },
          { score: 1, label: "Emerging", observable: "60-75%" },
          { score: 2, label: "Achieved", observable: "75%+" },
        ]
      },
      { id: "O1_SV_VARIETY", pillar: "TECHNIQUE", category: "Serve", name: "Serve Variety", description: "Serve variatie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Eén type" },
          { score: 1, label: "Emerging", observable: "Twee types" },
          { score: 2, label: "Achieved", observable: "Flat, slice, kick" },
        ]
      },
      { id: "O1_VL_COMPLETE", pillar: "TECHNIQUE", category: "Volley", name: "Complete Volley", description: "Volledige volley techniek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Incompleet" },
          { score: 1, label: "Emerging", observable: "Bijna compleet" },
          { score: 2, label: "Achieved", observable: "Volledige volley techniek" },
        ]
      },
      { id: "O1_RET_COMPLETE", pillar: "TECHNIQUE", category: "Return", name: "Complete Return", description: "Volledige return game",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwakke return" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Sterke return game" },
        ]
      },
      { id: "O1_SPECIALTY", pillar: "TECHNIQUE", category: "Specialty", name: "All Specialty Shots", description: "Alle speciale slagen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Mist slagen" },
          { score: 1, label: "Emerging", observable: "Meeste slagen" },
          { score: 2, label: "Achieved", observable: "Alle speciale slagen" },
        ]
      },

      // TACTICAL (10 skills)
      { id: "O1_TAC_GAME_STYLE", pillar: "TACTICAL", category: "Style", name: "Game Style", description: "Heeft speelstijl",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen stijl" },
          { score: 1, label: "Emerging", observable: "Ontwikkelt stijl" },
          { score: 2, label: "Achieved", observable: "Duidelijke speelstijl" },
        ]
      },
      { id: "O1_TAC_PATTERNS", pillar: "TACTICAL", category: "Patterns", name: "Pattern Mastery", description: "Beheerst patronen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weinig patronen" },
          { score: 1, label: "Emerging", observable: "Meeste patronen" },
          { score: 2, label: "Achieved", observable: "Beheerst alle patronen" },
        ]
      },
      { id: "O1_TAC_POINT_WIN", pillar: "TACTICAL", category: "Construction", name: "Point Winning", description: "Wint punten tactisch",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wacht op fouten" },
          { score: 1, label: "Emerging", observable: "Soms constructief" },
          { score: 2, label: "Achieved", observable: "Wint punten constructief" },
        ]
      },
      { id: "O1_TAC_SERVE_GAME", pillar: "TACTICAL", category: "Serve", name: "Complete Serve Game", description: "Volledig serve spel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwak serve spel" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Sterk serve spel" },
        ]
      },
      { id: "O1_TAC_RETURN_GAME", pillar: "TACTICAL", category: "Return", name: "Complete Return Game", description: "Volledig return spel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Passieve return" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Sterke return tactiek" },
        ]
      },
      { id: "O1_TAC_NET_FULL", pillar: "TACTICAL", category: "Net Play", name: "Complete Net Game", description: "Volledig netspel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Vermijdt net" },
          { score: 1, label: "Emerging", observable: "Basis netspel" },
          { score: 2, label: "Achieved", observable: "Sterk netspel" },
        ]
      },
      { id: "O1_TAC_DEFENSE_FULL", pillar: "TACTICAL", category: "Defense", name: "Complete Defense", description: "Volledige verdediging",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen verdediging" },
          { score: 1, label: "Emerging", observable: "Basis verdediging" },
          { score: 2, label: "Achieved", observable: "Volledige verdedigings tactiek" },
        ]
      },
      { id: "O1_TAC_MATCH_MGMT", pillar: "TACTICAL", category: "Strategy", name: "Match Management", description: "Wedstrijd management",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen strategie" },
          { score: 1, label: "Emerging", observable: "Basis strategie" },
          { score: 2, label: "Achieved", observable: "Sterk wedstrijd management" },
        ]
      },
      { id: "O1_TAC_ADAPT", pillar: "TACTICAL", category: "Strategy", name: "Full Adaptation", description: "Volledige aanpassing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen aanpassing" },
          { score: 1, label: "Emerging", observable: "Soms aanpassen" },
          { score: 2, label: "Achieved", observable: "Past volledig aan" },
        ]
      },
      { id: "O1_TAC_DOUBLES", pillar: "TACTICAL", category: "Doubles", name: "Doubles Tactics", description: "Dubbel tactiek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen dubbel tactiek" },
          { score: 1, label: "Emerging", observable: "Basis dubbel" },
          { score: 2, label: "Achieved", observable: "Sterke dubbel tactiek" },
        ]
      },

      // PHYSICAL (6 skills)
      { id: "O1_PHY_ENDURANCE", pillar: "PHYSICAL", category: "Fitness", name: "90 Min Session", description: "Houdt 90 min vol",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moe binnen 60 min" },
          { score: 1, label: "Emerging", observable: "60-80 min" },
          { score: 2, label: "Achieved", observable: "Actief 90 min" },
        ]
      },
      { id: "O1_PHY_SPEED", pillar: "PHYSICAL", category: "Movement", name: "Court Speed", description: "Baan snelheid",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Te traag" },
          { score: 1, label: "Emerging", observable: "Goede snelheid" },
          { score: 2, label: "Achieved", observable: "Uitstekende snelheid" },
        ]
      },
      { id: "O1_PHY_POWER", pillar: "PHYSICAL", category: "Strength", name: "Shot Power", description: "Slagkracht",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weinig kracht" },
          { score: 1, label: "Emerging", observable: "Goede kracht" },
          { score: 2, label: "Achieved", observable: "Sterke slagkracht" },
        ]
      },
      { id: "O1_PHY_FOOTWORK", pillar: "PHYSICAL", category: "Movement", name: "Advanced Footwork", description: "Gevorderd voetenwerk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Basis voetenwerk" },
          { score: 1, label: "Emerging", observable: "Goed voetenwerk" },
          { score: 2, label: "Achieved", observable: "Uitstekend voetenwerk" },
        ]
      },
      { id: "O1_PHY_FLEXIBILITY", pillar: "PHYSICAL", category: "Flexibility", name: "Flexibility", description: "Flexibiliteit",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Stijf" },
          { score: 1, label: "Emerging", observable: "Redelijk flexibel" },
          { score: 2, label: "Achieved", observable: "Zeer flexibel" },
        ]
      },
      { id: "O1_PHY_FULL_COURT", pillar: "PHYSICAL", category: "Movement", name: "Full Court Ready", description: "Klaar voor volle baan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Niet klaar" },
          { score: 1, label: "Emerging", observable: "Bijna klaar" },
          { score: 2, label: "Achieved", observable: "Volledig klaar" },
        ]
      },

      // MENTAL (6 skills)
      { id: "O1_MEN_COMPETE", pillar: "MENTAL", category: "Competition", name: "Elite Competitor", description: "Elite competitie mentaliteit",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen strijdlust" },
          { score: 1, label: "Emerging", observable: "Goede strijdlust" },
          { score: 2, label: "Achieved", observable: "Elite strijdlust" },
        ]
      },
      { id: "O1_MEN_PRESSURE", pillar: "MENTAL", category: "Pressure", name: "Thrives Under Pressure", description: "Gedijt onder druk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkrampt" },
          { score: 1, label: "Emerging", observable: "Blijft kalm" },
          { score: 2, label: "Achieved", observable: "Gedijt onder druk" },
        ]
      },
      { id: "O1_MEN_FOCUS", pillar: "MENTAL", category: "Focus", name: "Match Long Focus", description: "Focus hele wedstrijd",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest focus" },
          { score: 1, label: "Emerging", observable: "Meestal gefocust" },
          { score: 2, label: "Achieved", observable: "Altijd gefocust" },
        ]
      },
      { id: "O1_MEN_PLAN", pillar: "MENTAL", category: "Strategy", name: "Strategic Mind", description: "Strategisch denken",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen strategie" },
          { score: 1, label: "Emerging", observable: "Basis strategie" },
          { score: 2, label: "Achieved", observable: "Sterk strategisch" },
        ]
      },
      { id: "O1_MEN_CONFIDENCE", pillar: "MENTAL", category: "Confidence", name: "Self Belief", description: "Sterk zelfvertrouwen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen vertrouwen" },
          { score: 1, label: "Emerging", observable: "Goed vertrouwen" },
          { score: 2, label: "Achieved", observable: "Sterk zelfvertrouwen" },
        ]
      },
      { id: "O1_MEN_PROFESSIONAL", pillar: "MENTAL", category: "Attitude", name: "Professional Attitude", description: "Professionele houding",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onprofessioneel" },
          { score: 1, label: "Emerging", observable: "Meestal professioneel" },
          { score: 2, label: "Achieved", observable: "Altijd professioneel" },
        ]
      },

      // SOCIAL (3 skills)
      { id: "O1_SOC_AMBASSADOR", pillar: "SOCIAL", category: "Leadership", name: "Club Ambassador", description: "Club ambassadeur",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen ambassadeur" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Ware ambassadeur" },
        ]
      },
      { id: "O1_SOC_MENTOR", pillar: "SOCIAL", category: "Leadership", name: "Mentors Others", description: "Helpt jongeren",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Helpt niet" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Actief mentor" },
        ]
      },
      { id: "O1_SOC_SPORTSMANSHIP", pillar: "SOCIAL", category: "Sportsmanship", name: "Elite Sportsmanship", description: "Elite sportiviteit",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Basis sportiviteit" },
          { score: 1, label: "Emerging", observable: "Goede sportiviteit" },
          { score: 2, label: "Achieved", observable: "Elite sportiviteit" },
        ]
      },

      // MATCH (6 skills)
      { id: "O1_MAT_TOURNEY", pillar: "MATCH", category: "Competition", name: "Tournament Success", description: "Toernooi succes",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen succes" },
          { score: 1, label: "Emerging", observable: "Soms winnen" },
          { score: 2, label: "Achieved", observable: "Regelmatig winnen" },
        ]
      },
      { id: "O1_MAT_BIG_MATCHES", pillar: "MATCH", category: "Match Play", name: "Big Match Player", description: "Presteert in grote wedstrijden",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest grote wedstrijden" },
          { score: 1, label: "Emerging", observable: "Soms winnen" },
          { score: 2, label: "Achieved", observable: "Wint grote wedstrijden" },
        ]
      },
      { id: "O1_MAT_COMEBACK", pillar: "MATCH", category: "Match Play", name: "Elite Comeback", description: "Elite comebacks",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen comebacks" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Sterke comebacks" },
        ]
      },
      { id: "O1_MAT_CLOSE", pillar: "MATCH", category: "Match Play", name: "Closes Out", description: "Maakt af",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Maakt niet af" },
          { score: 1, label: "Emerging", observable: "Meestal af" },
          { score: 2, label: "Achieved", observable: "Maakt altijd af" },
        ]
      },
      { id: "O1_MAT_DOUBLES", pillar: "MATCH", category: "Doubles", name: "Doubles Champion", description: "Dubbel kampioen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwak dubbelspel" },
          { score: 1, label: "Emerging", observable: "Goed dubbelspel" },
          { score: 2, label: "Achieved", observable: "Sterk dubbelspel" },
        ]
      },
      { id: "O1_MAT_GREEN_READY", pillar: "MATCH", category: "Readiness", name: "Green Ready", description: "Klaar voor Green",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Niet klaar" },
          { score: 1, label: "Emerging", observable: "Bijna klaar" },
          { score: 2, label: "Achieved", observable: "Volledig klaar voor Green" },
        ]
      },
    ],
  },
};

// Helper functions
export function getOrderedOrangeLevelIds(): string[] {
  return ["ORANGE_3", "ORANGE_2", "ORANGE_1"];
}

export function getOrangeSkillsByPillar(levelId: string, pillar: string): OrangeSkill[] {
  const level = ORANGE_STAGE_SKILLS_BY_LEVEL[levelId];
  if (!level) return [];
  return level.skills.filter(s => s.pillar === pillar.toUpperCase());
}

export function countOrangeSkillsPerLevel(levelId: string): number {
  const level = ORANGE_STAGE_SKILLS_BY_LEVEL[levelId];
  return level ? level.skills.length : 0;
}

export function getOrangePillarWeighting(levelId: string): PillarWeighting | null {
  const level = ORANGE_STAGE_SKILLS_BY_LEVEL[levelId];
  return level ? level.pillarWeighting : null;
}
