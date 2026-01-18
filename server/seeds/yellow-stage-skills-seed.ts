/**
 * YELLOW STAGE Skills - Advanced Junior / Adult Transition (ages 11+)
 * 
 * YELLOW 3 → YELLOW 2 → YELLOW 1
 * Focus: Full adult tennis, competition excellence, professional development
 * Ball: Yellow ball (100% compression - standard tennis ball)
 * Court: Full court (23.77m x 8.23m)
 * 
 * KNLTB-style: 1 = best/elite level, 3 = transitioning from Green
 */

interface SkillRubric {
  score: number;
  label: string;
  observable: string;
}

interface YellowSkill {
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

interface YellowLevelConfig {
  levelId: string;
  rank: number;
  name: string;
  subtitle: string;
  abilitySnapshot: string;
  philosophy: string;
  pillarWeighting: PillarWeighting;
  promotionRequirements: PromotionRequirements;
  skills: YellowSkill[];
}

export const YELLOW_STAGE_SKILLS_BY_LEVEL: Record<string, YellowLevelConfig> = {
  "YELLOW_3": {
    levelId: "YELLOW_3",
    rank: 3,
    name: "Transition",
    subtitle: "Yellow Ball Transition",
    abilitySnapshot: "Ik leer met de gele bal te spelen!",
    philosophy: "Aanpassen aan volledige balsnelheid, verfijning van techniek en tactiek.",
    pillarWeighting: {
      technique: 25,
      tactical: 30,
      physical: 20,
      mental: 15,
      social: 5,
      match: 5,
    },
    promotionRequirements: {
      techniqueMinPercent: 70,
      tacticalMinPercent: 65,
      physicalMinPercent: 70,
      coachConfirmation: true,
      minSessions: 20,
    },
    skills: [
      // TECHNIQUE - GROUNDSTROKES TRANSITION (16 skills)
      { id: "Y3_FH_YELLOW", pillar: "TECHNIQUE", category: "Forehand", name: "FH Yellow Transition", description: "Forehand aanpassing aan gele bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Timing problemen" },
          { score: 1, label: "Emerging", observable: "Aanpassing gaande" },
          { score: 2, label: "Achieved", observable: "Vloeiende overgang" },
        ]
      },
      { id: "Y3_FH_POWER", pillar: "TECHNIQUE", category: "Forehand", name: "FH Power Yellow", description: "Kracht in FH met gele bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Te weinig kracht" },
          { score: 1, label: "Emerging", observable: "Soms krachtig" },
          { score: 2, label: "Achieved", observable: "Consistente kracht" },
        ]
      },
      { id: "Y3_FH_SPIN", pillar: "TECHNIQUE", category: "Forehand", name: "FH Spin Variety", description: "Spin variatie FH",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Eén type spin" },
          { score: 1, label: "Emerging", observable: "Twee types" },
          { score: 2, label: "Achieved", observable: "Volledige spin variatie" },
        ]
      },
      { id: "Y3_FH_DEPTH", pillar: "TECHNIQUE", category: "Forehand", name: "FH Depth Control", description: "Diepte controle FH",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Inconsistente diepte" },
          { score: 1, label: "Emerging", observable: "Soms diep" },
          { score: 2, label: "Achieved", observable: "Volledige diepte controle" },
        ]
      },
      { id: "Y3_FH_ANGLES", pillar: "TECHNIQUE", category: "Forehand", name: "FH Angle Shots", description: "Hoekslagen FH",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen scherpe hoeken" },
          { score: 1, label: "Emerging", observable: "Soms effectief" },
          { score: 2, label: "Achieved", observable: "Scherpe hoeken op commando" },
        ]
      },
      { id: "Y3_FH_WINNER", pillar: "TECHNIQUE", category: "Forehand", name: "FH Winner Rate", description: "FH winner percentage",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weinig winners" },
          { score: 1, label: "Emerging", observable: "Soms winners" },
          { score: 2, label: "Achieved", observable: "Regelmatige winners" },
        ]
      },
      { id: "Y3_FH_DEFENSE", pillar: "TECHNIQUE", category: "Forehand", name: "Defensive FH Yellow", description: "Verdedigende FH gele bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Breekt onder druk" },
          { score: 1, label: "Emerging", observable: "Soms stabiel" },
          { score: 2, label: "Achieved", observable: "Sterke verdedigende FH" },
        ]
      },
      { id: "Y3_FH_RUNNING", pillar: "TECHNIQUE", category: "Forehand", name: "Running FH", description: "FH uit beweging",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onstabiel uit beweging" },
          { score: 1, label: "Emerging", observable: "Soms stabiel" },
          { score: 2, label: "Achieved", observable: "Stabiele running FH" },
        ]
      },
      { id: "Y3_BH_YELLOW", pillar: "TECHNIQUE", category: "Backhand", name: "BH Yellow Transition", description: "Backhand aanpassing gele bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Timing problemen" },
          { score: 1, label: "Emerging", observable: "Aanpassing gaande" },
          { score: 2, label: "Achieved", observable: "Vloeiende overgang" },
        ]
      },
      { id: "Y3_BH_POWER", pillar: "TECHNIQUE", category: "Backhand", name: "BH Power Yellow", description: "Kracht in BH met gele bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weinig kracht" },
          { score: 1, label: "Emerging", observable: "Soms krachtig" },
          { score: 2, label: "Achieved", observable: "Consistente kracht BH" },
        ]
      },
      { id: "Y3_BH_TOPSPIN", pillar: "TECHNIQUE", category: "Backhand", name: "BH Topspin Yellow", description: "Topspin BH gele bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Matige spin" },
          { score: 1, label: "Emerging", observable: "Goede spin" },
          { score: 2, label: "Achieved", observable: "Zware topspin" },
        ]
      },
      { id: "Y3_BH_SLICE", pillar: "TECHNIQUE", category: "Backhand", name: "BH Slice Advanced", description: "Gevorderde slice BH",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Basis slice" },
          { score: 1, label: "Emerging", observable: "Goede slice" },
          { score: 2, label: "Achieved", observable: "Penetrerende/variabele slice" },
        ]
      },
      { id: "Y3_BH_CROSSCOURT", pillar: "TECHNIQUE", category: "Backhand", name: "BH Crosscourt Deep", description: "Diepe crosscourt BH",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Te kort" },
          { score: 1, label: "Emerging", observable: "Soms diep" },
          { score: 2, label: "Achieved", observable: "Consistente diepe CC" },
        ]
      },
      { id: "Y3_BH_DTL", pillar: "TECHNIQUE", category: "Backhand", name: "BH Down The Line", description: "BH down the line",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onbetrouwbaar" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Betrouwbare DTL" },
        ]
      },
      { id: "Y3_BH_WINNER", pillar: "TECHNIQUE", category: "Backhand", name: "BH Winner Ability", description: "BH winner mogelijkheid",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen winners" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Regelmatige BH winners" },
        ]
      },
      { id: "Y3_BH_DEFENSE", pillar: "TECHNIQUE", category: "Backhand", name: "Defensive BH Yellow", description: "Verdedigende BH",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Breekt" },
          { score: 1, label: "Emerging", observable: "Soms stabiel" },
          { score: 2, label: "Achieved", observable: "Sterke verdedigende BH" },
        ]
      },

      // TECHNIQUE - SERVE (12 skills)
      { id: "Y3_SV_YELLOW", pillar: "TECHNIQUE", category: "Serve", name: "Serve Yellow Transition", description: "Serve aanpassing gele bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Inconsistent" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Aangepast aan gele bal" },
        ]
      },
      { id: "Y3_SV_FLAT", pillar: "TECHNIQUE", category: "Serve", name: "Flat Serve Power", description: "Krachtige platte serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Matige kracht" },
          { score: 1, label: "Emerging", observable: "Goede kracht" },
          { score: 2, label: "Achieved", observable: "Krachtige flat serve" },
        ]
      },
      { id: "Y3_SV_SLICE", pillar: "TECHNIQUE", category: "Serve", name: "Slice Serve Advanced", description: "Gevorderde slice serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Basis slice" },
          { score: 1, label: "Emerging", observable: "Goede curve" },
          { score: 2, label: "Achieved", observable: "Scherpe slice serve" },
        ]
      },
      { id: "Y3_SV_KICK", pillar: "TECHNIQUE", category: "Serve", name: "Kick Serve Yellow", description: "Kick serve gele bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwakke kick" },
          { score: 1, label: "Emerging", observable: "Goede kick" },
          { score: 2, label: "Achieved", observable: "Hoge effectieve kick" },
        ]
      },
      { id: "Y3_SV_75PCT", pillar: "TECHNIQUE", category: "Serve", name: "75% First Serve", description: "75%+ eerste serve in",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onder 60%" },
          { score: 1, label: "Emerging", observable: "60-75%" },
          { score: 2, label: "Achieved", observable: "75%+" },
        ]
      },
      { id: "Y3_SV_PLACEMENT", pillar: "TECHNIQUE", category: "Serve", name: "Serve Placement", description: "Serve plaatsing beheersing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Inconsistent" },
          { score: 1, label: "Emerging", observable: "Soms gericht" },
          { score: 2, label: "Achieved", observable: "T/Wide/Body op commando" },
        ]
      },
      { id: "Y3_SV_SECOND", pillar: "TECHNIQUE", category: "Serve", name: "Reliable Second", description: "Betrouwbare tweede serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Dubbele fouten" },
          { score: 1, label: "Emerging", observable: "Meestal in" },
          { score: 2, label: "Achieved", observable: "Zeer betrouwbaar met effect" },
        ]
      },
      { id: "Y3_SV_DISGUISE", pillar: "TECHNIQUE", category: "Serve", name: "Serve Disguise", description: "Serve vermomming",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Voorspelbaar" },
          { score: 1, label: "Emerging", observable: "Soms vermomming" },
          { score: 2, label: "Achieved", observable: "Goede vermomming" },
        ]
      },
      { id: "Y3_SV_PRESSURE", pillar: "TECHNIQUE", category: "Serve", name: "Serve Under Pressure", description: "Serve onder druk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkrampt" },
          { score: 1, label: "Emerging", observable: "Soms stabiel" },
          { score: 2, label: "Achieved", observable: "Stabiel onder druk" },
        ]
      },
      { id: "Y3_SV_TOSS", pillar: "TECHNIQUE", category: "Serve", name: "Toss Control", description: "Toss controle",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wisselende toss" },
          { score: 1, label: "Emerging", observable: "Meestal consistent" },
          { score: 2, label: "Achieved", observable: "Perfecte toss controle" },
        ]
      },
      { id: "Y3_SV_RHYTHM", pillar: "TECHNIQUE", category: "Serve", name: "Serve Rhythm", description: "Serve ritme",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onregelmatig" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Consistent ritme" },
        ]
      },
      { id: "Y3_SV_BODY", pillar: "TECHNIQUE", category: "Serve", name: "Body Serve", description: "Body serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan niet" },
          { score: 1, label: "Emerging", observable: "Soms effectief" },
          { score: 2, label: "Achieved", observable: "Effectieve body serve" },
        ]
      },

      // TECHNIQUE - RETURN & NET (10 skills)
      { id: "Y3_RET_FIRST", pillar: "TECHNIQUE", category: "Return", name: "First Serve Return", description: "Return eerste serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Mist vaak" },
          { score: 1, label: "Emerging", observable: "Neutraliseert" },
          { score: 2, label: "Achieved", observable: "Agressieve return" },
        ]
      },
      { id: "Y3_RET_SECOND", pillar: "TECHNIQUE", category: "Return", name: "Attack Second Serve", description: "Aanval tweede serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Passief" },
          { score: 1, label: "Emerging", observable: "Soms agressief" },
          { score: 2, label: "Achieved", observable: "Consistent aanvallend" },
        ]
      },
      { id: "Y3_RET_CHIP", pillar: "TECHNIQUE", category: "Return", name: "Chip Return", description: "Chip return",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen chip" },
          { score: 1, label: "Emerging", observable: "Basis" },
          { score: 2, label: "Achieved", observable: "Effectieve chip return" },
        ]
      },
      { id: "Y3_VL_PUNCH", pillar: "TECHNIQUE", category: "Volley", name: "Volley Yellow Ball", description: "Volley gele bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Timing issues" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Stabiele volley" },
        ]
      },
      { id: "Y3_VL_WINNER", pillar: "TECHNIQUE", category: "Volley", name: "Volley Winners", description: "Volley winners",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen winners" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Regelmatige volley winners" },
        ]
      },
      { id: "Y3_VL_ANGLES", pillar: "TECHNIQUE", category: "Volley", name: "Volley Angles", description: "Volley hoeken",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen hoeken" },
          { score: 1, label: "Emerging", observable: "Soms hoekje" },
          { score: 2, label: "Achieved", observable: "Scherpe hoeken" },
        ]
      },
      { id: "Y3_OH_SMASH", pillar: "TECHNIQUE", category: "Overhead", name: "Smash Yellow Ball", description: "Smash gele bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onstabiel" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Betrouwbare smash" },
        ]
      },
      { id: "Y3_APP_SHOT", pillar: "TECHNIQUE", category: "Transition", name: "Approach Shots", description: "Approach slagen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwakke approach" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Effectieve approach" },
        ]
      },
      { id: "Y3_DROP_SHOT", pillar: "TECHNIQUE", category: "Specialty", name: "Drop Shot Yellow", description: "Dropshot gele bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen dropshot" },
          { score: 1, label: "Emerging", observable: "Basis" },
          { score: 2, label: "Achieved", observable: "Effectieve dropshot" },
        ]
      },
      { id: "Y3_LOB", pillar: "TECHNIQUE", category: "Specialty", name: "Lob Yellow Ball", description: "Lob gele bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onbetrouwbaar" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Effectieve offensieve/defensieve lob" },
        ]
      },

      // TACTICAL (14 skills)
      { id: "Y3_TAC_PATTERNS", pillar: "TACTICAL", category: "Patterns", name: "Pattern Play Yellow", description: "Patronen gele bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weinig patronen" },
          { score: 1, label: "Emerging", observable: "Basis patronen" },
          { score: 2, label: "Achieved", observable: "Meerdere patronen" },
        ]
      },
      { id: "Y3_TAC_CONSTRUCT", pillar: "TACTICAL", category: "Construction", name: "Point Construction", description: "Punt constructie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen plan" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Tactische opbouw" },
        ]
      },
      { id: "Y3_TAC_SERVE_T", pillar: "TACTICAL", category: "Serve", name: "Serve Tactics Yellow", description: "Serve tactiek gele bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen plan" },
          { score: 1, label: "Emerging", observable: "Basis" },
          { score: 2, label: "Achieved", observable: "Slimme serve tactiek" },
        ]
      },
      { id: "Y3_TAC_RETURN_T", pillar: "TACTICAL", category: "Return", name: "Return Tactics Yellow", description: "Return tactiek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Passief" },
          { score: 1, label: "Emerging", observable: "Soms tactisch" },
          { score: 2, label: "Achieved", observable: "Sterke return tactiek" },
        ]
      },
      { id: "Y3_TAC_NET", pillar: "TACTICAL", category: "Net Play", name: "Net Approach Timing", description: "Net timing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkeerde timing" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Goede net timing" },
        ]
      },
      { id: "Y3_TAC_DEFENSE", pillar: "TACTICAL", category: "Defense", name: "Defensive Tactics", description: "Verdedigings tactiek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen verdediging" },
          { score: 1, label: "Emerging", observable: "Basis" },
          { score: 2, label: "Achieved", observable: "Sterke verdediging" },
        ]
      },
      { id: "Y3_TAC_ADAPT", pillar: "TACTICAL", category: "Strategy", name: "Match Adaptation", description: "Wedstrijd aanpassing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Past niet aan" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Past effectief aan" },
        ]
      },
      { id: "Y3_TAC_OPPONENT", pillar: "TACTICAL", category: "Strategy", name: "Reads Opponent", description: "Leest tegenstander",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen observatie" },
          { score: 1, label: "Emerging", observable: "Basis" },
          { score: 2, label: "Achieved", observable: "Leest goed" },
        ]
      },
      { id: "Y3_TAC_WEAK", pillar: "TACTICAL", category: "Strategy", name: "Attacks Weakness", description: "Benut zwaktes",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen focus" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Benut zwaktes effectief" },
        ]
      },
      { id: "Y3_TAC_RISK", pillar: "TACTICAL", category: "Risk", name: "Risk Management", description: "Risico beheer",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Te risicovol/passief" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Goede risico inschatting" },
        ]
      },
      { id: "Y3_TAC_MOMENTUM", pillar: "TACTICAL", category: "Strategy", name: "Momentum Control", description: "Momentum beheersing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen bewustzijn" },
          { score: 1, label: "Emerging", observable: "Voelt momentum" },
          { score: 2, label: "Achieved", observable: "Beheerst momentum" },
        ]
      },
      { id: "Y3_TAC_CLUTCH", pillar: "TACTICAL", category: "Strategy", name: "Big Point Play", description: "Grote punten spel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkrampt" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Sterk op grote punten" },
        ]
      },
      { id: "Y3_TAC_DOUBLES", pillar: "TACTICAL", category: "Doubles", name: "Doubles Tactics Yellow", description: "Dubbel tactiek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen tactiek" },
          { score: 1, label: "Emerging", observable: "Basis" },
          { score: 2, label: "Achieved", observable: "Sterke dubbel tactiek" },
        ]
      },
      { id: "Y3_TAC_SURFACE", pillar: "TACTICAL", category: "Strategy", name: "Surface Adaptation", description: "Ondergrond aanpassing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen aanpassing" },
          { score: 1, label: "Emerging", observable: "Basis" },
          { score: 2, label: "Achieved", observable: "Past aan per ondergrond" },
        ]
      },

      // PHYSICAL (10 skills)
      { id: "Y3_PHY_ENDURANCE", pillar: "PHYSICAL", category: "Fitness", name: "2 Hour Match", description: "Houdt 2 uur wedstrijd vol",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moe binnen 90 min" },
          { score: 1, label: "Emerging", observable: "90-110 min" },
          { score: 2, label: "Achieved", observable: "Actief 2+ uur" },
        ]
      },
      { id: "Y3_PHY_SPEED", pillar: "PHYSICAL", category: "Movement", name: "Court Speed Yellow", description: "Baan snelheid gele bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Te traag" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Snelle dekking" },
        ]
      },
      { id: "Y3_PHY_EXPLOSIVE", pillar: "PHYSICAL", category: "Movement", name: "Explosive First Step", description: "Explosieve eerste stap",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Trage start" },
          { score: 1, label: "Emerging", observable: "Soms snel" },
          { score: 2, label: "Achieved", observable: "Altijd explosief" },
        ]
      },
      { id: "Y3_PHY_FOOTWORK", pillar: "PHYSICAL", category: "Movement", name: "Advanced Footwork", description: "Gevorderd voetenwerk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Basis" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Gevorderd voetenwerk" },
        ]
      },
      { id: "Y3_PHY_POWER", pillar: "PHYSICAL", category: "Strength", name: "Shot Power Yellow", description: "Slagkracht gele bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Matig" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Sterke slagkracht" },
        ]
      },
      { id: "Y3_PHY_AGILITY", pillar: "PHYSICAL", category: "Movement", name: "Agility", description: "Wendbaarheid",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Traag" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Zeer wendbaar" },
        ]
      },
      { id: "Y3_PHY_BALANCE", pillar: "PHYSICAL", category: "Balance", name: "Dynamic Balance", description: "Dynamische balans",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Uit balans" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Uitstekende balans" },
        ]
      },
      { id: "Y3_PHY_CORE", pillar: "PHYSICAL", category: "Strength", name: "Core Strength", description: "Romp sterkte",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwak" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Sterke romp" },
        ]
      },
      { id: "Y3_PHY_RECOVERY", pillar: "PHYSICAL", category: "Recovery", name: "Between Points", description: "Herstel tussen punten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Traag" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Snel herstel" },
        ]
      },
      { id: "Y3_PHY_FLEXIBILITY", pillar: "PHYSICAL", category: "Flexibility", name: "Flexibility", description: "Flexibiliteit",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Stijf" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Goed flexibel" },
        ]
      },

      // MENTAL (8 skills)
      { id: "Y3_MEN_FOCUS", pillar: "MENTAL", category: "Focus", name: "Match Focus Yellow", description: "Focus wedstrijd",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest focus" },
          { score: 1, label: "Emerging", observable: "Wisselend" },
          { score: 2, label: "Achieved", observable: "Sterke focus" },
        ]
      },
      { id: "Y3_MEN_PRESSURE", pillar: "MENTAL", category: "Resilience", name: "Pressure Handling", description: "Omgaan met druk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkrampt" },
          { score: 1, label: "Emerging", observable: "Soms kalm" },
          { score: 2, label: "Achieved", observable: "Blijft kalm" },
        ]
      },
      { id: "Y3_MEN_COMPETE", pillar: "MENTAL", category: "Competition", name: "Competitive Drive", description: "Competitie drang",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen strijdlust" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Sterke strijdlust" },
        ]
      },
      { id: "Y3_MEN_MISTAKES", pillar: "MENTAL", category: "Resilience", name: "Error Recovery", description: "Herstelt van fouten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Gefrustreerd" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Herstelt snel" },
        ]
      },
      { id: "Y3_MEN_ROUTINE", pillar: "MENTAL", category: "Rituals", name: "Match Rituals", description: "Wedstrijd rituelen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen rituelen" },
          { score: 1, label: "Emerging", observable: "Basis" },
          { score: 2, label: "Achieved", observable: "Consistente rituelen" },
        ]
      },
      { id: "Y3_MEN_PLAN", pillar: "MENTAL", category: "Strategy", name: "Game Plan", description: "Wedstrijdplan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen plan" },
          { score: 1, label: "Emerging", observable: "Basis plan" },
          { score: 2, label: "Achieved", observable: "Duidelijk plan" },
        ]
      },
      { id: "Y3_MEN_CONFIDENCE", pillar: "MENTAL", category: "Confidence", name: "Self Belief", description: "Zelfvertrouwen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen vertrouwen" },
          { score: 1, label: "Emerging", observable: "Wisselend" },
          { score: 2, label: "Achieved", observable: "Sterk zelfvertrouwen" },
        ]
      },
      { id: "Y3_MEN_BODY_LANG", pillar: "MENTAL", category: "Attitude", name: "Body Language", description: "Lichaamstaal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Negatief" },
          { score: 1, label: "Emerging", observable: "Wisselend" },
          { score: 2, label: "Achieved", observable: "Altijd positief" },
        ]
      },

      // SOCIAL (4 skills)
      { id: "Y3_SOC_FAIR", pillar: "SOCIAL", category: "Sportsmanship", name: "Fair Play", description: "Eerlijk spel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Oneerlijk" },
          { score: 1, label: "Emerging", observable: "Meestal eerlijk" },
          { score: 2, label: "Achieved", observable: "Altijd fair" },
        ]
      },
      { id: "Y3_SOC_CALLS", pillar: "SOCIAL", category: "Rules", name: "Line Calls", description: "Eerlijke calls",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Foute calls" },
          { score: 1, label: "Emerging", observable: "Meestal goed" },
          { score: 2, label: "Achieved", observable: "Altijd eerlijk" },
        ]
      },
      { id: "Y3_SOC_ETIQUETTE", pillar: "SOCIAL", category: "Etiquette", name: "Full Etiquette", description: "Volledige etiquette",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Mist regels" },
          { score: 1, label: "Emerging", observable: "Meeste regels" },
          { score: 2, label: "Achieved", observable: "Volledige etiquette" },
        ]
      },
      { id: "Y3_SOC_DOUBLES", pillar: "SOCIAL", category: "Doubles", name: "Doubles Partner", description: "Dubbel partner",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moeilijke partner" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Goede partner" },
        ]
      },

      // MATCH (8 skills)
      { id: "Y3_MAT_COMPLETE", pillar: "MATCH", category: "Match Play", name: "Full Match Yellow", description: "Volledige wedstrijd gele bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Maakt niet af" },
          { score: 1, label: "Emerging", observable: "Met moeite" },
          { score: 2, label: "Achieved", observable: "Speelt volledig" },
        ]
      },
      { id: "Y3_MAT_TOURNEY", pillar: "MATCH", category: "Competition", name: "Tournament Play", description: "Speelt toernooien",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen toernooien" },
          { score: 1, label: "Emerging", observable: "Eerste toernooien" },
          { score: 2, label: "Achieved", observable: "Regelmatig toernooien" },
        ]
      },
      { id: "Y3_MAT_WIN", pillar: "MATCH", category: "Match Play", name: "Winning Matches", description: "Wint wedstrijden",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wint zelden" },
          { score: 1, label: "Emerging", observable: "Soms winnen" },
          { score: 2, label: "Achieved", observable: "Wint regelmatig" },
        ]
      },
      { id: "Y3_MAT_SERVE_GAME", pillar: "MATCH", category: "Match Play", name: "Holds Serve", description: "Houdt service",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest vaak" },
          { score: 1, label: "Emerging", observable: "Soms houden" },
          { score: 2, label: "Achieved", observable: "Houdt regelmatig" },
        ]
      },
      { id: "Y3_MAT_BREAK", pillar: "MATCH", category: "Match Play", name: "Breaks Serve", description: "Breekt service",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Breekt nooit" },
          { score: 1, label: "Emerging", observable: "Soms breken" },
          { score: 2, label: "Achieved", observable: "Breekt regelmatig" },
        ]
      },
      { id: "Y3_MAT_COMEBACK", pillar: "MATCH", category: "Match Play", name: "Comeback Ability", description: "Comeback vermogen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geeft op" },
          { score: 1, label: "Emerging", observable: "Soms comeback" },
          { score: 2, label: "Achieved", observable: "Sterke comebacks" },
        ]
      },
      { id: "Y3_MAT_CLOSE", pillar: "MATCH", category: "Match Play", name: "Closes Matches", description: "Sluit wedstrijden",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Maakt niet af" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Sluit matches af" },
        ]
      },
      { id: "Y3_MAT_DOUBLES", pillar: "MATCH", category: "Doubles", name: "Doubles Play", description: "Speelt dubbel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen dubbel" },
          { score: 1, label: "Emerging", observable: "Basis dubbel" },
          { score: 2, label: "Achieved", observable: "Goed dubbelspel" },
        ]
      },
    ],
  },

  "YELLOW_2": {
    levelId: "YELLOW_2",
    rank: 2,
    name: "Competitor",
    subtitle: "Competition Excellence",
    abilitySnapshot: "Ik wed strijd op hoog niveau en ontwikkel mijn speelstijl!",
    philosophy: "Focus op competitie excellentie, speelstijl verfijning, en mentale kracht.",
    pillarWeighting: {
      technique: 20,
      tactical: 30,
      physical: 20,
      mental: 20,
      social: 5,
      match: 5,
    },
    promotionRequirements: {
      techniqueMinPercent: 75,
      tacticalMinPercent: 75,
      mentalMinPercent: 75,
      matchMinPercent: 75,
      coachConfirmation: true,
      minSessions: 24,
    },
    skills: [
      // TECHNIQUE - WEAPONS (10 skills)
      { id: "Y2_WEAPONS", pillar: "TECHNIQUE", category: "Weapons", name: "Multiple Weapons", description: "Meerdere wapens",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Eén wapen" },
          { score: 1, label: "Emerging", observable: "Twee wapens" },
          { score: 2, label: "Achieved", observable: "Drie+ wapens" },
        ]
      },
      { id: "Y2_FH_ELITE", pillar: "TECHNIQUE", category: "Forehand", name: "Elite FH", description: "Elite forehand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Zeer goed" },
          { score: 2, label: "Achieved", observable: "Elite niveau FH" },
        ]
      },
      { id: "Y2_BH_STRENGTH", pillar: "TECHNIQUE", category: "Backhand", name: "BH Strength", description: "Sterke backhand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwak punt" },
          { score: 1, label: "Emerging", observable: "Neutraal" },
          { score: 2, label: "Achieved", observable: "Sterk punt" },
        ]
      },
      { id: "Y2_SV_ELITE", pillar: "TECHNIQUE", category: "Serve", name: "Elite Serve", description: "Elite serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Zeer goed" },
          { score: 2, label: "Achieved", observable: "Elite serve" },
        ]
      },
      { id: "Y2_SV_80PCT", pillar: "TECHNIQUE", category: "Serve", name: "80% First Serve", description: "80%+ eerste serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onder 65%" },
          { score: 1, label: "Emerging", observable: "65-80%" },
          { score: 2, label: "Achieved", observable: "80%+" },
        ]
      },
      { id: "Y2_RET_STRENGTH", pillar: "TECHNIQUE", category: "Return", name: "Return Strength", description: "Sterke return",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Passief" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Sterke return" },
        ]
      },
      { id: "Y2_NET_COMPLETE", pillar: "TECHNIQUE", category: "Net Play", name: "Complete Net", description: "Volledig netspel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Beperkt" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Volledig netspel" },
        ]
      },
      { id: "Y2_SPECIALTY", pillar: "TECHNIQUE", category: "Specialty", name: "All Specialty", description: "Alle speciale slagen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Mist slagen" },
          { score: 1, label: "Emerging", observable: "Meeste" },
          { score: 2, label: "Achieved", observable: "Alle speciale slagen" },
        ]
      },
      { id: "Y2_CONSISTENCY", pillar: "TECHNIQUE", category: "Execution", name: "High Consistency", description: "Hoge consistentie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Inconsistent" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Zeer consistent" },
        ]
      },
      { id: "Y2_PRESSURE", pillar: "TECHNIQUE", category: "Execution", name: "Technique Under Pressure", description: "Techniek onder druk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Breekt" },
          { score: 1, label: "Emerging", observable: "Soms stabiel" },
          { score: 2, label: "Achieved", observable: "Stabiel onder druk" },
        ]
      },

      // TACTICAL - ADVANCED (14 skills)
      { id: "Y2_TAC_STYLE", pillar: "TACTICAL", category: "Style", name: "Defined Style", description: "Gedefinieerde speelstijl",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onduidelijk" },
          { score: 1, label: "Emerging", observable: "Ontwikkelt" },
          { score: 2, label: "Achieved", observable: "Duidelijke stijl" },
        ]
      },
      { id: "Y2_TAC_PATTERNS", pillar: "TACTICAL", category: "Patterns", name: "Elite Patterns", description: "Elite patronen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Basis" },
          { score: 1, label: "Emerging", observable: "Gevorderd" },
          { score: 2, label: "Achieved", observable: "Elite patronen" },
        ]
      },
      { id: "Y2_TAC_CONSTRUCT", pillar: "TACTICAL", category: "Construction", name: "Elite Construction", description: "Elite punt opbouw",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Inconsistent" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Elite constructie" },
        ]
      },
      { id: "Y2_TAC_SERVE", pillar: "TACTICAL", category: "Serve", name: "Elite Serve Game", description: "Elite serve spel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Matig" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Elite serve spel" },
        ]
      },
      { id: "Y2_TAC_RETURN", pillar: "TACTICAL", category: "Return", name: "Elite Return Game", description: "Elite return spel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Matig" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Elite return spel" },
        ]
      },
      { id: "Y2_TAC_NET", pillar: "TACTICAL", category: "Net Play", name: "Elite Net Tactics", description: "Elite net tactiek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Basis" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Elite net tactiek" },
        ]
      },
      { id: "Y2_TAC_DEFENSE", pillar: "TACTICAL", category: "Defense", name: "Elite Defense", description: "Elite verdediging",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Basis" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Elite verdediging" },
        ]
      },
      { id: "Y2_TAC_MGMT", pillar: "TACTICAL", category: "Strategy", name: "Match Management", description: "Wedstrijd management",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Matig" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Uitstekend management" },
        ]
      },
      { id: "Y2_TAC_ADAPT", pillar: "TACTICAL", category: "Strategy", name: "Quick Adaptation", description: "Snelle aanpassing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Traag" },
          { score: 1, label: "Emerging", observable: "Redelijk snel" },
          { score: 2, label: "Achieved", observable: "Zeer snelle aanpassing" },
        ]
      },
      { id: "Y2_TAC_OPPONENT", pillar: "TACTICAL", category: "Strategy", name: "Opponent Analysis", description: "Tegenstander analyse",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen analyse" },
          { score: 1, label: "Emerging", observable: "Basis" },
          { score: 2, label: "Achieved", observable: "Diepgaande analyse" },
        ]
      },
      { id: "Y2_TAC_DOUBLES", pillar: "TACTICAL", category: "Doubles", name: "Elite Doubles", description: "Elite dubbel tactiek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Basis" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Elite dubbel" },
        ]
      },
      { id: "Y2_TAC_SURFACE", pillar: "TACTICAL", category: "Strategy", name: "All Surface Play", description: "Speelt op alle ondergronden",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Eén ondergrond" },
          { score: 1, label: "Emerging", observable: "Twee" },
          { score: 2, label: "Achieved", observable: "Alle ondergronden" },
        ]
      },
      { id: "Y2_TAC_WEATHER", pillar: "TACTICAL", category: "Strategy", name: "Weather Conditions", description: "Speelt in alle condities",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moeite met condities" },
          { score: 1, label: "Emerging", observable: "Meestal goed" },
          { score: 2, label: "Achieved", observable: "Speelt in alle condities" },
        ]
      },
      { id: "Y2_TAC_IQ", pillar: "TACTICAL", category: "Strategy", name: "Tennis IQ", description: "Tennis IQ",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Gemiddeld" },
          { score: 1, label: "Emerging", observable: "Hoog" },
          { score: 2, label: "Achieved", observable: "Elite tennis IQ" },
        ]
      },

      // PHYSICAL (10 skills)
      { id: "Y2_PHY_ENDURANCE", pillar: "PHYSICAL", category: "Fitness", name: "3 Hour Match", description: "Houdt 3 uur wedstrijd vol",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Max 2 uur" },
          { score: 1, label: "Emerging", observable: "2-2.5 uur" },
          { score: 2, label: "Achieved", observable: "3+ uur" },
        ]
      },
      { id: "Y2_PHY_SPEED", pillar: "PHYSICAL", category: "Movement", name: "Elite Speed", description: "Elite snelheid",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Zeer goed" },
          { score: 2, label: "Achieved", observable: "Elite snelheid" },
        ]
      },
      { id: "Y2_PHY_POWER", pillar: "PHYSICAL", category: "Strength", name: "Elite Power", description: "Elite kracht",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Zeer goed" },
          { score: 2, label: "Achieved", observable: "Elite kracht" },
        ]
      },
      { id: "Y2_PHY_FOOTWORK", pillar: "PHYSICAL", category: "Movement", name: "Elite Footwork", description: "Elite voetenwerk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Zeer goed" },
          { score: 2, label: "Achieved", observable: "Elite voetenwerk" },
        ]
      },
      { id: "Y2_PHY_AGILITY", pillar: "PHYSICAL", category: "Movement", name: "Elite Agility", description: "Elite wendbaarheid",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Zeer goed" },
          { score: 2, label: "Achieved", observable: "Elite wendbaarheid" },
        ]
      },
      { id: "Y2_PHY_FITNESS", pillar: "PHYSICAL", category: "Fitness", name: "Complete Fitness", description: "Volledige fitheid",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwakke punten" },
          { score: 1, label: "Emerging", observable: "Bijna compleet" },
          { score: 2, label: "Achieved", observable: "Volledige fitheid" },
        ]
      },
      { id: "Y2_PHY_RECOVERY", pillar: "PHYSICAL", category: "Recovery", name: "Elite Recovery", description: "Elite herstel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Traag" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Elite herstel" },
        ]
      },
      { id: "Y2_PHY_HEALTH", pillar: "PHYSICAL", category: "Health", name: "Injury Prevention", description: "Blessure preventie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen preventie" },
          { score: 1, label: "Emerging", observable: "Basis" },
          { score: 2, label: "Achieved", observable: "Volledige preventie" },
        ]
      },
      { id: "Y2_PHY_NUTRITION", pillar: "PHYSICAL", category: "Health", name: "Nutrition Awareness", description: "Voeding bewustzijn",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen aandacht" },
          { score: 1, label: "Emerging", observable: "Basis" },
          { score: 2, label: "Achieved", observable: "Goede voeding" },
        ]
      },
      { id: "Y2_PHY_REST", pillar: "PHYSICAL", category: "Health", name: "Rest & Recovery", description: "Rust en herstel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen prioriteit" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Prioriteit rust" },
        ]
      },

      // MENTAL (10 skills)
      { id: "Y2_MEN_COMPETE", pillar: "MENTAL", category: "Competition", name: "Elite Competitor", description: "Elite competitie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Zeer goed" },
          { score: 2, label: "Achieved", observable: "Elite competitor" },
        ]
      },
      { id: "Y2_MEN_PRESSURE", pillar: "MENTAL", category: "Pressure", name: "Thrives Pressure", description: "Gedijt onder druk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Blijft kalm" },
          { score: 1, label: "Emerging", observable: "Presteert" },
          { score: 2, label: "Achieved", observable: "Gedijt volledig" },
        ]
      },
      { id: "Y2_MEN_FOCUS", pillar: "MENTAL", category: "Focus", name: "Elite Focus", description: "Elite focus",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Zeer goed" },
          { score: 2, label: "Achieved", observable: "Elite focus" },
        ]
      },
      { id: "Y2_MEN_RESILIENCE", pillar: "MENTAL", category: "Resilience", name: "Elite Resilience", description: "Elite veerkracht",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Zeer goed" },
          { score: 2, label: "Achieved", observable: "Elite veerkracht" },
        ]
      },
      { id: "Y2_MEN_STRATEGY", pillar: "MENTAL", category: "Strategy", name: "Strategic Mind", description: "Strategische geest",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Basis" },
          { score: 1, label: "Emerging", observable: "Gevorderd" },
          { score: 2, label: "Achieved", observable: "Elite strategisch" },
        ]
      },
      { id: "Y2_MEN_CONFIDENCE", pillar: "MENTAL", category: "Confidence", name: "Elite Confidence", description: "Elite zelfvertrouwen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Sterk" },
          { score: 2, label: "Achieved", observable: "Elite zelfvertrouwen" },
        ]
      },
      { id: "Y2_MEN_PROFESSIONAL", pillar: "MENTAL", category: "Attitude", name: "Professional", description: "Professioneel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Ontwikkelt" },
          { score: 1, label: "Emerging", observable: "Meestal" },
          { score: 2, label: "Achieved", observable: "Volledig professioneel" },
        ]
      },
      { id: "Y2_MEN_GOALS", pillar: "MENTAL", category: "Goals", name: "Goal Setting", description: "Doelen stellen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen doelen" },
          { score: 1, label: "Emerging", observable: "Basis doelen" },
          { score: 2, label: "Achieved", observable: "Duidelijke ambitieuze doelen" },
        ]
      },
      { id: "Y2_MEN_PROCESS", pillar: "MENTAL", category: "Mindset", name: "Process Focus", description: "Proces focus",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Resultaat gericht" },
          { score: 1, label: "Emerging", observable: "Balans" },
          { score: 2, label: "Achieved", observable: "Proces gefocust" },
        ]
      },
      { id: "Y2_MEN_MINDFULNESS", pillar: "MENTAL", category: "Mindset", name: "Mindfulness", description: "Mindfulness",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen aandacht" },
          { score: 1, label: "Emerging", observable: "Basis" },
          { score: 2, label: "Achieved", observable: "Dagelijkse praktijk" },
        ]
      },

      // SOCIAL (4 skills)
      { id: "Y2_SOC_LEADER", pillar: "SOCIAL", category: "Leadership", name: "Team Leader", description: "Team leider",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen leider" },
          { score: 1, label: "Emerging", observable: "Soms leider" },
          { score: 2, label: "Achieved", observable: "Natuurlijke leider" },
        ]
      },
      { id: "Y2_SOC_AMBASSADOR", pillar: "SOCIAL", category: "Leadership", name: "Sport Ambassador", description: "Sport ambassadeur",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen ambassadeur" },
          { score: 1, label: "Emerging", observable: "Club level" },
          { score: 2, label: "Achieved", observable: "Sport ambassadeur" },
        ]
      },
      { id: "Y2_SOC_MENTOR", pillar: "SOCIAL", category: "Leadership", name: "Active Mentor", description: "Actief mentor",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Helpt niet" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Actief mentor" },
        ]
      },
      { id: "Y2_SOC_NETWORK", pillar: "SOCIAL", category: "Network", name: "Tennis Network", description: "Tennis netwerk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Beperkt" },
          { score: 1, label: "Emerging", observable: "Groeit" },
          { score: 2, label: "Achieved", observable: "Sterk netwerk" },
        ]
      },

      // MATCH (10 skills)
      { id: "Y2_MAT_NATIONAL", pillar: "MATCH", category: "Competition", name: "National Level", description: "Nationaal niveau",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Regionaal" },
          { score: 1, label: "Emerging", observable: "Top regionaal" },
          { score: 2, label: "Achieved", observable: "Nationaal niveau" },
        ]
      },
      { id: "Y2_MAT_RANKING", pillar: "MATCH", category: "Competition", name: "Strong Ranking", description: "Sterke ranking",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Lage ranking" },
          { score: 1, label: "Emerging", observable: "Groeit" },
          { score: 2, label: "Achieved", observable: "Sterke ranking" },
        ]
      },
      { id: "Y2_MAT_TOURNEY", pillar: "MATCH", category: "Competition", name: "Tournament Success", description: "Toernooi succes",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weinig succes" },
          { score: 1, label: "Emerging", observable: "Regelmatig rondes" },
          { score: 2, label: "Achieved", observable: "Wint toernooien" },
        ]
      },
      { id: "Y2_MAT_BIG", pillar: "MATCH", category: "Match Play", name: "Big Match Winner", description: "Wint grote wedstrijden",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest vaak" },
          { score: 1, label: "Emerging", observable: "Soms winnen" },
          { score: 2, label: "Achieved", observable: "Wint grote wedstrijden" },
        ]
      },
      { id: "Y2_MAT_CLUTCH", pillar: "MATCH", category: "Match Play", name: "Clutch Player", description: "Clutch speler",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkrampt" },
          { score: 1, label: "Emerging", observable: "Soms clutch" },
          { score: 2, label: "Achieved", observable: "Clutch speler" },
        ]
      },
      { id: "Y2_MAT_COMEBACK", pillar: "MATCH", category: "Match Play", name: "Elite Comeback", description: "Elite comebacks",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen comebacks" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Sterke comebacks" },
        ]
      },
      { id: "Y2_MAT_CLOSE", pillar: "MATCH", category: "Match Play", name: "Closes Out", description: "Maakt af",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Maakt niet af" },
          { score: 1, label: "Emerging", observable: "Meestal" },
          { score: 2, label: "Achieved", observable: "Sluit altijd af" },
        ]
      },
      { id: "Y2_MAT_TIGHT", pillar: "MATCH", category: "Match Play", name: "Tight Match Winner", description: "Wint krappe wedstrijden",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest vaak" },
          { score: 1, label: "Emerging", observable: "Soms winnen" },
          { score: 2, label: "Achieved", observable: "Wint krappe wedstrijden" },
        ]
      },
      { id: "Y2_MAT_DOUBLES", pillar: "MATCH", category: "Doubles", name: "Elite Doubles", description: "Elite dubbelspel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Zeer goed" },
          { score: 2, label: "Achieved", observable: "Elite dubbelspel" },
        ]
      },
      { id: "Y2_MAT_INTERNATIONAL", pillar: "MATCH", category: "Competition", name: "International Aspirations", description: "Internationale aspiraties",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Nationaal" },
          { score: 1, label: "Emerging", observable: "Begint internationaal" },
          { score: 2, label: "Achieved", observable: "Internationaal niveau" },
        ]
      },
    ],
  },

  "YELLOW_1": {
    levelId: "YELLOW_1",
    rank: 1,
    name: "Elite",
    subtitle: "Elite Player",
    abilitySnapshot: "Ik speel op elite niveau en ben klaar voor hoogste competitie!",
    philosophy: "Maximale ontwikkeling bereikt, klaar voor hoogste jeugd/amateur niveau.",
    pillarWeighting: {
      technique: 20,
      tactical: 25,
      physical: 20,
      mental: 25,
      social: 5,
      match: 5,
    },
    promotionRequirements: {
      techniqueMinPercent: 85,
      tacticalMinPercent: 85,
      mentalMinPercent: 85,
      matchMinPercent: 85,
      coachConfirmation: true,
      minSessions: 30,
    },
    skills: [
      // TECHNIQUE - ELITE MASTERY (8 skills)
      { id: "Y1_STROKES", pillar: "TECHNIQUE", category: "Mastery", name: "Stroke Mastery", description: "Slag beheersing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zeer goed" },
          { score: 1, label: "Emerging", observable: "Elite niveau" },
          { score: 2, label: "Achieved", observable: "Volledige beheersing" },
        ]
      },
      { id: "Y1_WEAPONS", pillar: "TECHNIQUE", category: "Weapons", name: "Elite Weapons", description: "Elite wapens",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Meerdere wapens" },
          { score: 1, label: "Emerging", observable: "Elite wapens" },
          { score: 2, label: "Achieved", observable: "Dominante wapens" },
        ]
      },
      { id: "Y1_SERVE", pillar: "TECHNIQUE", category: "Serve", name: "Elite Serve", description: "Elite serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zeer goed" },
          { score: 1, label: "Emerging", observable: "Elite" },
          { score: 2, label: "Achieved", observable: "Dominante serve" },
        ]
      },
      { id: "Y1_SV_85PCT", pillar: "TECHNIQUE", category: "Serve", name: "85% First Serve", description: "85%+ eerste serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onder 75%" },
          { score: 1, label: "Emerging", observable: "75-85%" },
          { score: 2, label: "Achieved", observable: "85%+" },
        ]
      },
      { id: "Y1_RETURN", pillar: "TECHNIQUE", category: "Return", name: "Elite Return", description: "Elite return",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Zeer goed" },
          { score: 2, label: "Achieved", observable: "Elite return" },
        ]
      },
      { id: "Y1_NET", pillar: "TECHNIQUE", category: "Net Play", name: "Elite Net Game", description: "Elite netspel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Zeer goed" },
          { score: 2, label: "Achieved", observable: "Elite netspel" },
        ]
      },
      { id: "Y1_CONSISTENCY", pillar: "TECHNIQUE", category: "Execution", name: "Elite Consistency", description: "Elite consistentie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Zeer goed" },
          { score: 2, label: "Achieved", observable: "Elite consistentie" },
        ]
      },
      { id: "Y1_CLUTCH_TECH", pillar: "TECHNIQUE", category: "Execution", name: "Clutch Execution", description: "Clutch uitvoering",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Soms stabiel" },
          { score: 1, label: "Emerging", observable: "Stabiel" },
          { score: 2, label: "Achieved", observable: "Verhoogt niveau onder druk" },
        ]
      },

      // TACTICAL - ELITE (10 skills)
      { id: "Y1_TAC_STYLE", pillar: "TACTICAL", category: "Style", name: "Elite Style", description: "Elite speelstijl",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Duidelijk" },
          { score: 1, label: "Emerging", observable: "Verfijnd" },
          { score: 2, label: "Achieved", observable: "Elite eigen stijl" },
        ]
      },
      { id: "Y1_TAC_PATTERNS", pillar: "TACTICAL", category: "Patterns", name: "Pattern Mastery", description: "Patronen beheersing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Elite" },
          { score: 1, label: "Emerging", observable: "Meesterlijk" },
          { score: 2, label: "Achieved", observable: "Volledige beheersing" },
        ]
      },
      { id: "Y1_TAC_MGMT", pillar: "TACTICAL", category: "Strategy", name: "Elite Match Mgmt", description: "Elite wedstrijd management",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Uitstekend" },
          { score: 2, label: "Achieved", observable: "Elite management" },
        ]
      },
      { id: "Y1_TAC_ADAPT", pillar: "TACTICAL", category: "Strategy", name: "Elite Adaptation", description: "Elite aanpassing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Snel" },
          { score: 1, label: "Emerging", observable: "Zeer snel" },
          { score: 2, label: "Achieved", observable: "Instant aanpassing" },
        ]
      },
      { id: "Y1_TAC_ANALYSIS", pillar: "TACTICAL", category: "Strategy", name: "Game Analysis", description: "Wedstrijd analyse",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Basis" },
          { score: 1, label: "Emerging", observable: "Diepgaand" },
          { score: 2, label: "Achieved", observable: "Elite analyse" },
        ]
      },
      { id: "Y1_TAC_DOUBLES", pillar: "TACTICAL", category: "Doubles", name: "Elite Doubles Mastery", description: "Elite dubbel beheersing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Zeer goed" },
          { score: 2, label: "Achieved", observable: "Elite dubbel" },
        ]
      },
      { id: "Y1_TAC_ALL_SURFACE", pillar: "TACTICAL", category: "Strategy", name: "All Surface Master", description: "Alle ondergronden",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed op alle" },
          { score: 1, label: "Emerging", observable: "Sterk op alle" },
          { score: 2, label: "Achieved", observable: "Elite op alle ondergronden" },
        ]
      },
      { id: "Y1_TAC_CONDITIONS", pillar: "TACTICAL", category: "Strategy", name: "All Conditions", description: "Alle condities",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Past aan" },
          { score: 1, label: "Emerging", observable: "Sterk" },
          { score: 2, label: "Achieved", observable: "Elite in alle condities" },
        ]
      },
      { id: "Y1_TAC_IQ", pillar: "TACTICAL", category: "Strategy", name: "Elite Tennis IQ", description: "Elite tennis IQ",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Hoog" },
          { score: 1, label: "Emerging", observable: "Zeer hoog" },
          { score: 2, label: "Achieved", observable: "Elite tennis IQ" },
        ]
      },
      { id: "Y1_TAC_INNOVATION", pillar: "TACTICAL", category: "Strategy", name: "Tactical Innovation", description: "Tactische innovatie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Volgt patronen" },
          { score: 1, label: "Emerging", observable: "Soms creatief" },
          { score: 2, label: "Achieved", observable: "Creatieve tactiek" },
        ]
      },

      // PHYSICAL (8 skills)
      { id: "Y1_PHY_ENDURANCE", pillar: "PHYSICAL", category: "Fitness", name: "5 Set Match", description: "Houdt 5 set wedstrijd vol",
        rubric: [
          { score: 0, label: "Not Yet", observable: "3 sets" },
          { score: 1, label: "Emerging", observable: "4 sets" },
          { score: 2, label: "Achieved", observable: "5 sets" },
        ]
      },
      { id: "Y1_PHY_SPEED", pillar: "PHYSICAL", category: "Movement", name: "Elite Court Speed", description: "Elite baan snelheid",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zeer goed" },
          { score: 1, label: "Emerging", observable: "Elite" },
          { score: 2, label: "Achieved", observable: "Top elite snelheid" },
        ]
      },
      { id: "Y1_PHY_POWER", pillar: "PHYSICAL", category: "Strength", name: "Elite Power", description: "Elite kracht",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zeer goed" },
          { score: 1, label: "Emerging", observable: "Elite" },
          { score: 2, label: "Achieved", observable: "Top elite kracht" },
        ]
      },
      { id: "Y1_PHY_COMPLETE", pillar: "PHYSICAL", category: "Fitness", name: "Complete Athlete", description: "Complete atleet",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Bijna compleet" },
          { score: 1, label: "Emerging", observable: "Compleet" },
          { score: 2, label: "Achieved", observable: "Elite complete atleet" },
        ]
      },
      { id: "Y1_PHY_RECOVERY", pillar: "PHYSICAL", category: "Recovery", name: "Elite Recovery", description: "Elite herstel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Zeer goed" },
          { score: 2, label: "Achieved", observable: "Elite herstel" },
        ]
      },
      { id: "Y1_PHY_HEALTH", pillar: "PHYSICAL", category: "Health", name: "Optimal Health", description: "Optimale gezondheid",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Gezond" },
          { score: 1, label: "Emerging", observable: "Zeer gezond" },
          { score: 2, label: "Achieved", observable: "Optimale gezondheid" },
        ]
      },
      { id: "Y1_PHY_LONGEVITY", pillar: "PHYSICAL", category: "Health", name: "Career Longevity", description: "Carrière duurzaamheid",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen focus" },
          { score: 1, label: "Emerging", observable: "Aandacht" },
          { score: 2, label: "Achieved", observable: "Focus op duurzaamheid" },
        ]
      },
      { id: "Y1_PHY_TRAINING", pillar: "PHYSICAL", category: "Training", name: "Elite Training", description: "Elite training regime",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed regime" },
          { score: 1, label: "Emerging", observable: "Sterk regime" },
          { score: 2, label: "Achieved", observable: "Elite training regime" },
        ]
      },

      // MENTAL (10 skills)
      { id: "Y1_MEN_COMPETE", pillar: "MENTAL", category: "Competition", name: "Elite Competitor", description: "Elite competitor",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zeer sterk" },
          { score: 1, label: "Emerging", observable: "Elite" },
          { score: 2, label: "Achieved", observable: "Top elite competitor" },
        ]
      },
      { id: "Y1_MEN_PRESSURE", pillar: "MENTAL", category: "Pressure", name: "Pressure Master", description: "Druk meester",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Gedijt" },
          { score: 1, label: "Emerging", observable: "Verhoogt niveau" },
          { score: 2, label: "Achieved", observable: "Beste onder druk" },
        ]
      },
      { id: "Y1_MEN_FOCUS", pillar: "MENTAL", category: "Focus", name: "Unbreakable Focus", description: "Onbreekbare focus",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Elite" },
          { score: 1, label: "Emerging", observable: "Zeer sterk" },
          { score: 2, label: "Achieved", observable: "Onbreekbare focus" },
        ]
      },
      { id: "Y1_MEN_RESILIENCE", pillar: "MENTAL", category: "Resilience", name: "Elite Resilience", description: "Elite veerkracht",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zeer goed" },
          { score: 1, label: "Emerging", observable: "Elite" },
          { score: 2, label: "Achieved", observable: "Onbreekbare veerkracht" },
        ]
      },
      { id: "Y1_MEN_STRATEGY", pillar: "MENTAL", category: "Strategy", name: "Strategic Genius", description: "Strategisch genie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Elite" },
          { score: 1, label: "Emerging", observable: "Meesterlijk" },
          { score: 2, label: "Achieved", observable: "Strategisch genie" },
        ]
      },
      { id: "Y1_MEN_CONFIDENCE", pillar: "MENTAL", category: "Confidence", name: "Unshakeable Belief", description: "Onwankelbaar geloof",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Sterk" },
          { score: 1, label: "Emerging", observable: "Zeer sterk" },
          { score: 2, label: "Achieved", observable: "Onwankelbaar" },
        ]
      },
      { id: "Y1_MEN_PROFESSIONAL", pillar: "MENTAL", category: "Attitude", name: "Pro Mentality", description: "Pro mentaliteit",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Professioneel" },
          { score: 1, label: "Emerging", observable: "Zeer professioneel" },
          { score: 2, label: "Achieved", observable: "Volledige pro mentaliteit" },
        ]
      },
      { id: "Y1_MEN_GOALS", pillar: "MENTAL", category: "Goals", name: "Elite Goals", description: "Elite doelen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Ambitieus" },
          { score: 1, label: "Emerging", observable: "Zeer ambitieus" },
          { score: 2, label: "Achieved", observable: "Elite ambitieuze doelen" },
        ]
      },
      { id: "Y1_MEN_MINDSET", pillar: "MENTAL", category: "Mindset", name: "Champion Mindset", description: "Kampioen mindset",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Sterk" },
          { score: 1, label: "Emerging", observable: "Zeer sterk" },
          { score: 2, label: "Achieved", observable: "Kampioen mindset" },
        ]
      },
      { id: "Y1_MEN_GROWTH", pillar: "MENTAL", category: "Mindset", name: "Continuous Growth", description: "Continue groei",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Groeit" },
          { score: 1, label: "Emerging", observable: "Actief groeiend" },
          { score: 2, label: "Achieved", observable: "Altijd groeiend" },
        ]
      },

      // SOCIAL (4 skills)
      { id: "Y1_SOC_LEADER", pillar: "SOCIAL", category: "Leadership", name: "Sport Leader", description: "Sport leider",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Leider" },
          { score: 1, label: "Emerging", observable: "Sterke leider" },
          { score: 2, label: "Achieved", observable: "Inspirerend leider" },
        ]
      },
      { id: "Y1_SOC_AMBASSADOR", pillar: "SOCIAL", category: "Leadership", name: "Tennis Ambassador", description: "Tennis ambassadeur",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Nationaal" },
          { score: 1, label: "Emerging", observable: "Sterk nationaal" },
          { score: 2, label: "Achieved", observable: "Ware tennis ambassadeur" },
        ]
      },
      { id: "Y1_SOC_IMPACT", pillar: "SOCIAL", category: "Leadership", name: "Positive Impact", description: "Positieve impact",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Impact" },
          { score: 1, label: "Emerging", observable: "Sterke impact" },
          { score: 2, label: "Achieved", observable: "Grote positieve impact" },
        ]
      },
      { id: "Y1_SOC_NETWORK", pillar: "SOCIAL", category: "Network", name: "Elite Network", description: "Elite netwerk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Sterk" },
          { score: 1, label: "Emerging", observable: "Zeer sterk" },
          { score: 2, label: "Achieved", observable: "Elite netwerk" },
        ]
      },

      // MATCH (10 skills)
      { id: "Y1_MAT_NATIONAL", pillar: "MATCH", category: "Competition", name: "National Champion", description: "Nationaal kampioen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Top nationaal" },
          { score: 1, label: "Emerging", observable: "Finalist" },
          { score: 2, label: "Achieved", observable: "Kampioen" },
        ]
      },
      { id: "Y1_MAT_RANKING", pillar: "MATCH", category: "Competition", name: "Top Ranking", description: "Top ranking",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Sterk" },
          { score: 1, label: "Emerging", observable: "Zeer sterk" },
          { score: 2, label: "Achieved", observable: "Top ranking" },
        ]
      },
      { id: "Y1_MAT_INTERNATIONAL", pillar: "MATCH", category: "Competition", name: "International Level", description: "Internationaal niveau",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Begint" },
          { score: 1, label: "Emerging", observable: "Actief internationaal" },
          { score: 2, label: "Achieved", observable: "Sterk internationaal" },
        ]
      },
      { id: "Y1_MAT_BIG", pillar: "MATCH", category: "Match Play", name: "Big Stage Player", description: "Grote podium speler",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Sterk" },
          { score: 2, label: "Achieved", observable: "Verhoogt niveau op groot podium" },
        ]
      },
      { id: "Y1_MAT_CLUTCH", pillar: "MATCH", category: "Match Play", name: "Elite Clutch", description: "Elite clutch",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Clutch" },
          { score: 1, label: "Emerging", observable: "Zeer clutch" },
          { score: 2, label: "Achieved", observable: "Elite clutch speler" },
        ]
      },
      { id: "Y1_MAT_COMEBACK", pillar: "MATCH", category: "Match Play", name: "Epic Comebacks", description: "Epische comebacks",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Sterke comebacks" },
          { score: 1, label: "Emerging", observable: "Grote comebacks" },
          { score: 2, label: "Achieved", observable: "Epische comebacks" },
        ]
      },
      { id: "Y1_MAT_CLOSE", pillar: "MATCH", category: "Match Play", name: "Elite Closer", description: "Elite closer",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Sluit af" },
          { score: 1, label: "Emerging", observable: "Sterk sluiten" },
          { score: 2, label: "Achieved", observable: "Elite closer" },
        ]
      },
      { id: "Y1_MAT_DOUBLES", pillar: "MATCH", category: "Doubles", name: "Elite Doubles Player", description: "Elite dubbel speler",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Sterk" },
          { score: 1, label: "Emerging", observable: "Zeer sterk" },
          { score: 2, label: "Achieved", observable: "Elite dubbel speler" },
        ]
      },
      { id: "Y1_MAT_PRO_READY", pillar: "MATCH", category: "Readiness", name: "Pro Ready", description: "Klaar voor pro niveau",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Ontwikkelt" },
          { score: 1, label: "Emerging", observable: "Bijna" },
          { score: 2, label: "Achieved", observable: "Klaar voor pro niveau" },
        ]
      },
      { id: "Y1_MAT_FUTURE", pillar: "MATCH", category: "Readiness", name: "Bright Future", description: "Heldere toekomst",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Potentieel" },
          { score: 1, label: "Emerging", observable: "Sterk potentieel" },
          { score: 2, label: "Achieved", observable: "Heldere toekomst in tennis" },
        ]
      },
    ],
  },
};

// Helper functions
export function getOrderedYellowLevelIds(): string[] {
  return ["YELLOW_3", "YELLOW_2", "YELLOW_1"];
}

export function getYellowSkillsByPillar(levelId: string, pillar: string): YellowSkill[] {
  const level = YELLOW_STAGE_SKILLS_BY_LEVEL[levelId];
  if (!level) return [];
  return level.skills.filter(s => s.pillar === pillar.toUpperCase());
}

export function countYellowSkillsPerLevel(levelId: string): number {
  const level = YELLOW_STAGE_SKILLS_BY_LEVEL[levelId];
  return level ? level.skills.length : 0;
}

export function getYellowPillarWeighting(levelId: string): PillarWeighting | null {
  const level = YELLOW_STAGE_SKILLS_BY_LEVEL[levelId];
  return level ? level.pillarWeighting : null;
}
