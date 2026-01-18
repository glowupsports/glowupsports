/**
 * GREEN STAGE Skills - Full Court Development (ages 9-12)
 * 
 * GREEN 3 → GREEN 2 → GREEN 1
 * Focus: Full court tennis, advanced tactics, competition preparation
 * Ball: Green ball (75% compression)
 * Court: Full court (23.77m x 8.23m)
 * 
 * KNLTB-style: 1 = best/ready for next stage, 3 = just starting
 */

interface SkillRubric {
  score: number;
  label: string;
  observable: string;
}

interface GreenSkill {
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

interface GreenLevelConfig {
  levelId: string;
  rank: number;
  name: string;
  subtitle: string;
  abilitySnapshot: string;
  philosophy: string;
  pillarWeighting: PillarWeighting;
  promotionRequirements: PromotionRequirements;
  skills: GreenSkill[];
}

export const GREEN_STAGE_SKILLS_BY_LEVEL: Record<string, GreenLevelConfig> = {
  "GREEN_3": {
    levelId: "GREEN_3",
    rank: 3,
    name: "Court Master",
    subtitle: "Full Court Transition",
    abilitySnapshot: "Ik leer op de volledige baan te spelen!",
    philosophy: "Aanpassen aan volle baan, volledige bal snelheid, competitie ontwikkeling.",
    pillarWeighting: {
      technique: 30,
      tactical: 25,
      physical: 20,
      mental: 15,
      social: 5,
      match: 5,
    },
    promotionRequirements: {
      techniqueMinPercent: 65,
      tacticalMinPercent: 60,
      physicalMinPercent: 65,
      coachConfirmation: true,
      minSessions: 16,
    },
    skills: [
      // TECHNIQUE - GROUNDSTROKES (14 skills)
      { id: "G3_FH_FULL_COURT", pillar: "TECHNIQUE", category: "Forehand", name: "FH Full Court", description: "Forehand over volledige baan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Bereikt achterlijn niet" },
          { score: 1, label: "Emerging", observable: "Soms vol" },
          { score: 2, label: "Achieved", observable: "Consistente volle baan FH" },
        ]
      },
      { id: "G3_FH_HEAVY", pillar: "TECHNIQUE", category: "Forehand", name: "Heavy Topspin FH", description: "Zware topspin forehand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Lichte spin" },
          { score: 1, label: "Emerging", observable: "Soms zware spin" },
          { score: 2, label: "Achieved", observable: "Consistente heavy topspin" },
        ]
      },
      { id: "G3_FH_INSIDE_OUT", pillar: "TECHNIQUE", category: "Forehand", name: "Inside Out Mastery", description: "Inside out beheerst",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Nog niet effectief" },
          { score: 1, label: "Emerging", observable: "Soms effectief" },
          { score: 2, label: "Achieved", observable: "Betrouwbare inside out" },
        ]
      },
      { id: "G3_FH_INSIDE_IN", pillar: "TECHNIQUE", category: "Forehand", name: "Inside In FH", description: "Inside in forehand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kent slag niet" },
          { score: 1, label: "Emerging", observable: "Probeert" },
          { score: 2, label: "Achieved", observable: "Effectieve inside in" },
        ]
      },
      { id: "G3_FH_ANGLES", pillar: "TECHNIQUE", category: "Forehand", name: "FH Sharp Angles", description: "Scherpe hoeken FH",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen scherpe hoeken" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Scherpe hoeken op commando" },
        ]
      },
      { id: "G3_FH_WINNER", pillar: "TECHNIQUE", category: "Forehand", name: "FH Winner Ability", description: "Maakt FH winners",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen winners" },
          { score: 1, label: "Emerging", observable: "Soms winner" },
          { score: 2, label: "Achieved", observable: "Regelmatige winners" },
        ]
      },
      { id: "G3_FH_DEFENSE", pillar: "TECHNIQUE", category: "Forehand", name: "Defensive FH", description: "Verdedigende FH",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Alleen aanval" },
          { score: 1, label: "Emerging", observable: "Kan verdedigen" },
          { score: 2, label: "Achieved", observable: "Sterke verdedigende FH" },
        ]
      },
      { id: "G3_BH_FULL_COURT", pillar: "TECHNIQUE", category: "Backhand", name: "BH Full Court", description: "Backhand over volle baan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Bereikt niet" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Consistente volle baan BH" },
        ]
      },
      { id: "G3_BH_TOPSPIN", pillar: "TECHNIQUE", category: "Backhand", name: "Heavy BH Topspin", description: "Zware topspin BH",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Lichte spin" },
          { score: 1, label: "Emerging", observable: "Soms zwaar" },
          { score: 2, label: "Achieved", observable: "Consistente heavy topspin BH" },
        ]
      },
      { id: "G3_BH_CROSSCOURT", pillar: "TECHNIQUE", category: "Backhand", name: "BH Crosscourt Deep", description: "Diepe crosscourt BH",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Te kort" },
          { score: 1, label: "Emerging", observable: "Soms diep" },
          { score: 2, label: "Achieved", observable: "Consistente diepe CC BH" },
        ]
      },
      { id: "G3_BH_DOWNLINE", pillar: "TECHNIQUE", category: "Backhand", name: "BH Down The Line", description: "BH down the line",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen controle DTL" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Betrouwbare DTL BH" },
        ]
      },
      { id: "G3_BH_SLICE", pillar: "TECHNIQUE", category: "Backhand", name: "Effective Slice", description: "Effectieve slice",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwakke slice" },
          { score: 1, label: "Emerging", observable: "Basis slice" },
          { score: 2, label: "Achieved", observable: "Effectieve penetrerende slice" },
        ]
      },
      { id: "G3_BH_WINNER", pillar: "TECHNIQUE", category: "Backhand", name: "BH Winner Ability", description: "Maakt BH winners",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen winners" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Regelmatige BH winners" },
        ]
      },
      { id: "G3_BH_DEFENSE", pillar: "TECHNIQUE", category: "Backhand", name: "Defensive BH", description: "Verdedigende BH",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Breekt onder druk" },
          { score: 1, label: "Emerging", observable: "Kan verdedigen" },
          { score: 2, label: "Achieved", observable: "Sterke verdedigende BH" },
        ]
      },

      // TECHNIQUE - SERVE (10 skills)
      { id: "G3_SV_FULL_COURT", pillar: "TECHNIQUE", category: "Serve", name: "Full Court Serve", description: "Serve op volle baan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Inconsistent" },
          { score: 1, label: "Emerging", observable: "Aanpassing gaande" },
          { score: 2, label: "Achieved", observable: "Consistente volle baan serve" },
        ]
      },
      { id: "G3_SV_FLAT_POWER", pillar: "TECHNIQUE", category: "Serve", name: "Power Flat Serve", description: "Krachtige platte serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weinig kracht" },
          { score: 1, label: "Emerging", observable: "Soms krachtig" },
          { score: 2, label: "Achieved", observable: "Krachtige flat serve" },
        ]
      },
      { id: "G3_SV_SLICE", pillar: "TECHNIQUE", category: "Serve", name: "Slice Serve Dev", description: "Slice serve ontwikkeling",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen slice" },
          { score: 1, label: "Emerging", observable: "Basis slice" },
          { score: 2, label: "Achieved", observable: "Effectieve slice serve" },
        ]
      },
      { id: "G3_SV_KICK", pillar: "TECHNIQUE", category: "Serve", name: "Kick Serve Dev", description: "Kick serve ontwikkeling",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen kick" },
          { score: 1, label: "Emerging", observable: "Probeert kick" },
          { score: 2, label: "Achieved", observable: "Effectieve kick serve" },
        ]
      },
      { id: "G3_SV_70PCT", pillar: "TECHNIQUE", category: "Serve", name: "70% First Serve", description: "70%+ eerste serve in",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onder 55%" },
          { score: 1, label: "Emerging", observable: "55-70%" },
          { score: 2, label: "Achieved", observable: "70%+ in" },
        ]
      },
      { id: "G3_SV_PLACEMENT", pillar: "TECHNIQUE", category: "Serve", name: "Serve Placement", description: "Serve plaatsing beheersing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Random plaatsing" },
          { score: 1, label: "Emerging", observable: "Soms gericht" },
          { score: 2, label: "Achieved", observable: "T/Wide/Body op commando" },
        ]
      },
      { id: "G3_SV_SECOND", pillar: "TECHNIQUE", category: "Serve", name: "Reliable 2nd", description: "Betrouwbare tweede serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Veel dubbele fouten" },
          { score: 1, label: "Emerging", observable: "Soms betrouwbaar" },
          { score: 2, label: "Achieved", observable: "Zeer betrouwbaar met spin" },
        ]
      },
      { id: "G3_SV_VARIATION", pillar: "TECHNIQUE", category: "Serve", name: "Serve Variation", description: "Variatie in serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Eén type" },
          { score: 1, label: "Emerging", observable: "Twee types" },
          { score: 2, label: "Achieved", observable: "Drie+ types" },
        ]
      },
      { id: "G3_SV_PRESSURE", pillar: "TECHNIQUE", category: "Serve", name: "Serve Under Pressure", description: "Serveert onder druk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkrampt" },
          { score: 1, label: "Emerging", observable: "Soms stabiel" },
          { score: 2, label: "Achieved", observable: "Stabiel onder druk" },
        ]
      },
      { id: "G3_SV_RHYTHM", pillar: "TECHNIQUE", category: "Serve", name: "Serve Rhythm", description: "Serve ritme",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onregelmatig" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Consistent ritme" },
        ]
      },

      // TECHNIQUE - RETURN & NET (8 skills)
      { id: "G3_RET_FIRST", pillar: "TECHNIQUE", category: "Return", name: "First Serve Return", description: "Return op eerste serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Mist vaak" },
          { score: 1, label: "Emerging", observable: "Blok return" },
          { score: 2, label: "Achieved", observable: "Agressieve return" },
        ]
      },
      { id: "G3_RET_SECOND", pillar: "TECHNIQUE", category: "Return", name: "Attack 2nd Serve", description: "Aanval tweede serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Passief" },
          { score: 1, label: "Emerging", observable: "Soms agressief" },
          { score: 2, label: "Achieved", observable: "Consistent agressief" },
        ]
      },
      { id: "G3_VL_PUNCH", pillar: "TECHNIQUE", category: "Volley", name: "Full Court Volley", description: "Volley volle baan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onstabiel" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Stabiele volley" },
        ]
      },
      { id: "G3_VL_WINNER", pillar: "TECHNIQUE", category: "Volley", name: "Volley Winners", description: "Volley winners",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen winners" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Regelmatige winners" },
        ]
      },
      { id: "G3_OH_SMASH", pillar: "TECHNIQUE", category: "Overhead", name: "Full Court Smash", description: "Smash volle baan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Mist vaak" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Betrouwbare smash" },
        ]
      },
      { id: "G3_APP_SHOT", pillar: "TECHNIQUE", category: "Transition", name: "Approach Shots", description: "Approach slagen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwakke approach" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Effectieve approach" },
        ]
      },
      { id: "G3_DROP_SHOT", pillar: "TECHNIQUE", category: "Specialty", name: "Drop Shot", description: "Dropshot",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen dropshot" },
          { score: 1, label: "Emerging", observable: "Basis" },
          { score: 2, label: "Achieved", observable: "Effectieve dropshot" },
        ]
      },
      { id: "G3_LOB", pillar: "TECHNIQUE", category: "Specialty", name: "Lob", description: "Lob slag",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen lob" },
          { score: 1, label: "Emerging", observable: "Basis lob" },
          { score: 2, label: "Achieved", observable: "Effectieve offensieve lob" },
        ]
      },

      // TACTICAL (12 skills)
      { id: "G3_TAC_DEPTH", pillar: "TACTICAL", category: "Court", name: "Depth Control", description: "Diepte controle",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Korte ballen" },
          { score: 1, label: "Emerging", observable: "Soms diep" },
          { score: 2, label: "Achieved", observable: "Consistente diepte" },
        ]
      },
      { id: "G3_TAC_WIDTH", pillar: "TACTICAL", category: "Court", name: "Width Control", description: "Breedte controle",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Speelt centraal" },
          { score: 1, label: "Emerging", observable: "Soms breed" },
          { score: 2, label: "Achieved", observable: "Gebruikt hele breedte" },
        ]
      },
      { id: "G3_TAC_PATTERNS", pillar: "TACTICAL", category: "Patterns", name: "Pattern Play", description: "Speelt patronen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen patronen" },
          { score: 1, label: "Emerging", observable: "Basis patronen" },
          { score: 2, label: "Achieved", observable: "Meerdere patronen" },
        ]
      },
      { id: "G3_TAC_BUILD", pillar: "TACTICAL", category: "Construction", name: "Build Point", description: "Bouwt punt op",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen opbouw" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Tactische opbouw" },
        ]
      },
      { id: "G3_TAC_SERVE_T", pillar: "TACTICAL", category: "Serve", name: "Serve Tactics", description: "Serve tactiek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen plan" },
          { score: 1, label: "Emerging", observable: "Basis plan" },
          { score: 2, label: "Achieved", observable: "Slimme serve keuzes" },
        ]
      },
      { id: "G3_TAC_RETURN_T", pillar: "TACTICAL", category: "Return", name: "Return Position", description: "Return positie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkeerde positie" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Optimale positie" },
        ]
      },
      { id: "G3_TAC_NET", pillar: "TACTICAL", category: "Net Play", name: "Net Approach", description: "Net aanval",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Komt nooit naar net" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Strategische net aanval" },
        ]
      },
      { id: "G3_TAC_DEFENSE", pillar: "TACTICAL", category: "Defense", name: "Defensive Play", description: "Verdedigend spel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen verdediging" },
          { score: 1, label: "Emerging", observable: "Basis" },
          { score: 2, label: "Achieved", observable: "Sterk verdedigend" },
        ]
      },
      { id: "G3_TAC_ADAPT", pillar: "TACTICAL", category: "Strategy", name: "Adaptation", description: "Aanpassing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Past niet aan" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Past effectief aan" },
        ]
      },
      { id: "G3_TAC_OPPONENT", pillar: "TACTICAL", category: "Strategy", name: "Reads Opponent", description: "Leest tegenstander",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen observatie" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Leest goed" },
        ]
      },
      { id: "G3_TAC_WEAK", pillar: "TACTICAL", category: "Strategy", name: "Attacks Weakness", description: "Speelt naar zwakte",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen focus" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Benut zwaktes" },
        ]
      },
      { id: "G3_TAC_RISK", pillar: "TACTICAL", category: "Risk", name: "Risk Management", description: "Risico beheer",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Te risicovol/passief" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Goede risico inschatting" },
        ]
      },

      // PHYSICAL (8 skills)
      { id: "G3_PHY_ENDURANCE", pillar: "PHYSICAL", category: "Fitness", name: "90 Min Session", description: "Houdt 90 min vol",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moe binnen 60" },
          { score: 1, label: "Emerging", observable: "70-85 min" },
          { score: 2, label: "Achieved", observable: "Actief 90 min" },
        ]
      },
      { id: "G3_PHY_SPEED", pillar: "PHYSICAL", category: "Movement", name: "Full Court Speed", description: "Snelheid volle baan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Te traag" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Snelle dekking" },
        ]
      },
      { id: "G3_PHY_EXPLOSIVE", pillar: "PHYSICAL", category: "Movement", name: "Explosive Start", description: "Explosieve start",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Trage start" },
          { score: 1, label: "Emerging", observable: "Soms explosief" },
          { score: 2, label: "Achieved", observable: "Altijd explosief" },
        ]
      },
      { id: "G3_PHY_SLIDE", pillar: "PHYSICAL", category: "Movement", name: "Slide Steps", description: "Glijpas",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan niet glijden" },
          { score: 1, label: "Emerging", observable: "Probeert" },
          { score: 2, label: "Achieved", observable: "Effectieve slide" },
        ]
      },
      { id: "G3_PHY_RECOVERY", pillar: "PHYSICAL", category: "Movement", name: "Recovery Speed", description: "Herstel snelheid",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Traag herstel" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Snel herstel" },
        ]
      },
      { id: "G3_PHY_POWER", pillar: "PHYSICAL", category: "Strength", name: "Shot Power", description: "Slagkracht",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weinig kracht" },
          { score: 1, label: "Emerging", observable: "Groeit" },
          { score: 2, label: "Achieved", observable: "Goede slagkracht" },
        ]
      },
      { id: "G3_PHY_BALANCE", pillar: "PHYSICAL", category: "Balance", name: "Dynamic Balance", description: "Dynamische balans",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Uit balans" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Uitstekende balans" },
        ]
      },
      { id: "G3_PHY_FLEXIBILITY", pillar: "PHYSICAL", category: "Flexibility", name: "Flexibility", description: "Flexibiliteit",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Stijf" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Goed flexibel" },
        ]
      },

      // MENTAL (7 skills)
      { id: "G3_MEN_FOCUS", pillar: "MENTAL", category: "Focus", name: "Match Focus", description: "Focus tijdens wedstrijd",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest focus" },
          { score: 1, label: "Emerging", observable: "Wisselend" },
          { score: 2, label: "Achieved", observable: "Sterke focus" },
        ]
      },
      { id: "G3_MEN_PRESSURE", pillar: "MENTAL", category: "Resilience", name: "Pressure Handling", description: "Omgaan met druk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkrampt" },
          { score: 1, label: "Emerging", observable: "Soms kalm" },
          { score: 2, label: "Achieved", observable: "Blijft kalm" },
        ]
      },
      { id: "G3_MEN_COMPETE", pillar: "MENTAL", category: "Competition", name: "Competitive Drive", description: "Competitie drang",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen strijdlust" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Sterke strijdlust" },
        ]
      },
      { id: "G3_MEN_MISTAKES", pillar: "MENTAL", category: "Resilience", name: "Error Recovery", description: "Herstelt van fouten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Gefrustreerd" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Herstelt snel" },
        ]
      },
      { id: "G3_MEN_ROUTINE", pillar: "MENTAL", category: "Rituals", name: "Match Rituals", description: "Wedstrijd rituelen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen rituelen" },
          { score: 1, label: "Emerging", observable: "Basis" },
          { score: 2, label: "Achieved", observable: "Consistente rituelen" },
        ]
      },
      { id: "G3_MEN_PLAN", pillar: "MENTAL", category: "Strategy", name: "Game Plan", description: "Wedstrijdplan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen plan" },
          { score: 1, label: "Emerging", observable: "Basis plan" },
          { score: 2, label: "Achieved", observable: "Duidelijk plan" },
        ]
      },
      { id: "G3_MEN_CONFIDENCE", pillar: "MENTAL", category: "Confidence", name: "Self Belief", description: "Zelfvertrouwen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen vertrouwen" },
          { score: 1, label: "Emerging", observable: "Wisselend" },
          { score: 2, label: "Achieved", observable: "Sterk zelfvertrouwen" },
        ]
      },

      // SOCIAL (4 skills)
      { id: "G3_SOC_FAIR", pillar: "SOCIAL", category: "Sportsmanship", name: "Fair Play", description: "Eerlijk spel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Oneerlijk" },
          { score: 1, label: "Emerging", observable: "Meestal eerlijk" },
          { score: 2, label: "Achieved", observable: "Altijd fair" },
        ]
      },
      { id: "G3_SOC_CALLS", pillar: "SOCIAL", category: "Rules", name: "Line Calls", description: "Eerlijke calls",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Foute calls" },
          { score: 1, label: "Emerging", observable: "Meestal goed" },
          { score: 2, label: "Achieved", observable: "Altijd eerlijk" },
        ]
      },
      { id: "G3_SOC_ETIQUETTE", pillar: "SOCIAL", category: "Etiquette", name: "Tennis Etiquette", description: "Tennis etiquette",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kent niet" },
          { score: 1, label: "Emerging", observable: "Meeste regels" },
          { score: 2, label: "Achieved", observable: "Volledige etiquette" },
        ]
      },
      { id: "G3_SOC_DOUBLES", pillar: "SOCIAL", category: "Doubles", name: "Doubles Partner", description: "Dubbel partner",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moeilijke partner" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Goede partner" },
        ]
      },

      // MATCH (6 skills)
      { id: "G3_MAT_COMPLETE", pillar: "MATCH", category: "Match Play", name: "Full Match", description: "Speelt volledige wedstrijd",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Maakt niet af" },
          { score: 1, label: "Emerging", observable: "Met moeite" },
          { score: 2, label: "Achieved", observable: "Speelt volledig" },
        ]
      },
      { id: "G3_MAT_TOURNEY", pillar: "MATCH", category: "Competition", name: "Tournament Play", description: "Speelt toernooien",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen toernooien" },
          { score: 1, label: "Emerging", observable: "Eerste toernooien" },
          { score: 2, label: "Achieved", observable: "Regelmatig toernooien" },
        ]
      },
      { id: "G3_MAT_WIN", pillar: "MATCH", category: "Match Play", name: "Winning Matches", description: "Wint wedstrijden",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wint zelden" },
          { score: 1, label: "Emerging", observable: "Soms winnen" },
          { score: 2, label: "Achieved", observable: "Wint regelmatig" },
        ]
      },
      { id: "G3_MAT_SERVE_GAME", pillar: "MATCH", category: "Match Play", name: "Holds Serve", description: "Houdt service",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest vaak" },
          { score: 1, label: "Emerging", observable: "Soms houden" },
          { score: 2, label: "Achieved", observable: "Houdt regelmatig" },
        ]
      },
      { id: "G3_MAT_BREAK", pillar: "MATCH", category: "Match Play", name: "Breaks Serve", description: "Breekt service",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Breekt nooit" },
          { score: 1, label: "Emerging", observable: "Soms breken" },
          { score: 2, label: "Achieved", observable: "Breekt regelmatig" },
        ]
      },
      { id: "G3_MAT_DOUBLES", pillar: "MATCH", category: "Doubles", name: "Doubles Play", description: "Speelt dubbel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen dubbel" },
          { score: 1, label: "Emerging", observable: "Basis dubbel" },
          { score: 2, label: "Achieved", observable: "Goed dubbelspel" },
        ]
      },
    ],
  },

  "GREEN_2": {
    levelId: "GREEN_2",
    rank: 2,
    name: "Competitor",
    subtitle: "Competition Ready",
    abilitySnapshot: "Ik ben wedstrijdklaar en ontwikkel mijn speelstijl!",
    philosophy: "Focus op competitie, speelstijl ontwikkeling, en mentale sterkte.",
    pillarWeighting: {
      technique: 25,
      tactical: 30,
      physical: 20,
      mental: 15,
      social: 5,
      match: 5,
    },
    promotionRequirements: {
      techniqueMinPercent: 75,
      tacticalMinPercent: 70,
      matchMinPercent: 70,
      coachConfirmation: true,
      minSessions: 20,
    },
    skills: [
      // TECHNIQUE - WEAPONS (12 skills)
      { id: "G2_FH_WEAPON", pillar: "TECHNIQUE", category: "Forehand", name: "FH as Weapon", description: "FH is betrouwbaar wapen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Neutrale FH" },
          { score: 1, label: "Emerging", observable: "Soms wapen" },
          { score: 2, label: "Achieved", observable: "FH is primair wapen" },
        ]
      },
      { id: "G2_FH_AGGRESSIVE", pillar: "TECHNIQUE", category: "Forehand", name: "Aggressive FH", description: "Agressieve forehand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Passief" },
          { score: 1, label: "Emerging", observable: "Soms agressief" },
          { score: 2, label: "Achieved", observable: "Consistent agressief" },
        ]
      },
      { id: "G2_FH_VARIETY", pillar: "TECHNIQUE", category: "Forehand", name: "FH Variety", description: "Variatie in FH",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Eén type" },
          { score: 1, label: "Emerging", observable: "Twee types" },
          { score: 2, label: "Achieved", observable: "Volledige variatie" },
        ]
      },
      { id: "G2_BH_WEAPON", pillar: "TECHNIQUE", category: "Backhand", name: "BH Development", description: "BH wordt wapen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwakke BH" },
          { score: 1, label: "Emerging", observable: "Stabiele BH" },
          { score: 2, label: "Achieved", observable: "BH als wapen" },
        ]
      },
      { id: "G2_BH_AGGRESSIVE", pillar: "TECHNIQUE", category: "Backhand", name: "Aggressive BH", description: "Agressieve backhand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Passief" },
          { score: 1, label: "Emerging", observable: "Soms agressief" },
          { score: 2, label: "Achieved", observable: "Kan agressief BH spelen" },
        ]
      },
      { id: "G2_BH_VARIETY", pillar: "TECHNIQUE", category: "Backhand", name: "BH Variety", description: "Variatie in BH",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Beperkt" },
          { score: 1, label: "Emerging", observable: "Groeit" },
          { score: 2, label: "Achieved", observable: "Volledige variatie" },
        ]
      },
      { id: "G2_SV_WEAPON", pillar: "TECHNIQUE", category: "Serve", name: "Serve as Weapon", description: "Serve is wapen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Neutrale serve" },
          { score: 1, label: "Emerging", observable: "Soms effectief" },
          { score: 2, label: "Achieved", observable: "Serve is wapen" },
        ]
      },
      { id: "G2_SV_75PCT", pillar: "TECHNIQUE", category: "Serve", name: "75% First Serve", description: "75%+ eerste serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onder 60%" },
          { score: 1, label: "Emerging", observable: "60-75%" },
          { score: 2, label: "Achieved", observable: "75%+" },
        ]
      },
      { id: "G2_SV_ALL_TYPES", pillar: "TECHNIQUE", category: "Serve", name: "All Serve Types", description: "Alle serve types",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Mist types" },
          { score: 1, label: "Emerging", observable: "Meeste types" },
          { score: 2, label: "Achieved", observable: "Flat, slice, kick" },
        ]
      },
      { id: "G2_RET_WEAPON", pillar: "TECHNIQUE", category: "Return", name: "Return Strength", description: "Sterke return",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwakke return" },
          { score: 1, label: "Emerging", observable: "Stabiele return" },
          { score: 2, label: "Achieved", observable: "Return is sterk punt" },
        ]
      },
      { id: "G2_NET_COMPLETE", pillar: "TECHNIQUE", category: "Net Play", name: "Complete Net Game", description: "Volledig netspel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Beperkt" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Volledig netspel" },
        ]
      },
      { id: "G2_SPECIALTY", pillar: "TECHNIQUE", category: "Specialty", name: "Specialty Shots", description: "Speciale slagen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Mist slagen" },
          { score: 1, label: "Emerging", observable: "Meeste" },
          { score: 2, label: "Achieved", observable: "Alle speciale slagen" },
        ]
      },

      // TACTICAL - ADVANCED (14 skills)
      { id: "G2_TAC_STYLE", pillar: "TACTICAL", category: "Style", name: "Game Style", description: "Heeft speelstijl",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen stijl" },
          { score: 1, label: "Emerging", observable: "Ontwikkelt" },
          { score: 2, label: "Achieved", observable: "Duidelijke speelstijl" },
        ]
      },
      { id: "G2_TAC_PATTERNS", pillar: "TACTICAL", category: "Patterns", name: "Pattern Mastery", description: "Beheerst patronen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weinig patronen" },
          { score: 1, label: "Emerging", observable: "Meerdere" },
          { score: 2, label: "Achieved", observable: "Beheerst alle patronen" },
        ]
      },
      { id: "G2_TAC_CONSTRUCT", pillar: "TACTICAL", category: "Construction", name: "Point Construction", description: "Punt constructie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen plan" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Systematische opbouw" },
        ]
      },
      { id: "G2_TAC_SERVE_T", pillar: "TACTICAL", category: "Serve", name: "Complete Serve Game", description: "Volledig serve spel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Basis" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Sterk serve spel" },
        ]
      },
      { id: "G2_TAC_RETURN_T", pillar: "TACTICAL", category: "Return", name: "Return Tactics", description: "Return tactiek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Passief" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Sterke return tactiek" },
        ]
      },
      { id: "G2_TAC_NET", pillar: "TACTICAL", category: "Net Play", name: "Net Tactics", description: "Net tactiek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Vermijdt net" },
          { score: 1, label: "Emerging", observable: "Soms naar net" },
          { score: 2, label: "Achieved", observable: "Slim netspel" },
        ]
      },
      { id: "G2_TAC_DEFENSE", pillar: "TACTICAL", category: "Defense", name: "Defense Tactics", description: "Verdedigings tactiek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen verdediging" },
          { score: 1, label: "Emerging", observable: "Basis" },
          { score: 2, label: "Achieved", observable: "Sterke verdediging" },
        ]
      },
      { id: "G2_TAC_ADAPT", pillar: "TACTICAL", category: "Strategy", name: "Match Adaptation", description: "Aanpassing in wedstrijd",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Past niet aan" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Past effectief aan" },
        ]
      },
      { id: "G2_TAC_MOMENTUM", pillar: "TACTICAL", category: "Strategy", name: "Momentum Control", description: "Momentum beheersing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen bewustzijn" },
          { score: 1, label: "Emerging", observable: "Voelt momentum" },
          { score: 2, label: "Achieved", observable: "Beheerst momentum" },
        ]
      },
      { id: "G2_TAC_CLUTCH", pillar: "TACTICAL", category: "Strategy", name: "Big Point Tactics", description: "Tactiek op grote punten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen plan" },
          { score: 1, label: "Emerging", observable: "Soms effectief" },
          { score: 2, label: "Achieved", observable: "Sterk op grote punten" },
        ]
      },
      { id: "G2_TAC_SURFACE", pillar: "TACTICAL", category: "Strategy", name: "Surface Awareness", description: "Ondergrond bewustzijn",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen aanpassing" },
          { score: 1, label: "Emerging", observable: "Begint te begrijpen" },
          { score: 2, label: "Achieved", observable: "Past aan per ondergrond" },
        ]
      },
      { id: "G2_TAC_WEATHER", pillar: "TACTICAL", category: "Strategy", name: "Weather Adaptation", description: "Weer aanpassing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen aanpassing" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Past aan op condities" },
        ]
      },
      { id: "G2_TAC_DOUBLES", pillar: "TACTICAL", category: "Doubles", name: "Doubles Tactics", description: "Dubbel tactiek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen tactiek" },
          { score: 1, label: "Emerging", observable: "Basis" },
          { score: 2, label: "Achieved", observable: "Sterke dubbel tactiek" },
        ]
      },
      { id: "G2_TAC_MATCH_MGMT", pillar: "TACTICAL", category: "Strategy", name: "Match Management", description: "Wedstrijd management",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen strategie" },
          { score: 1, label: "Emerging", observable: "Basis" },
          { score: 2, label: "Achieved", observable: "Sterk management" },
        ]
      },

      // PHYSICAL (8 skills)
      { id: "G2_PHY_ENDURANCE", pillar: "PHYSICAL", category: "Fitness", name: "2 Hour Match", description: "Houdt 2 uur wedstrijd vol",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moe binnen 90 min" },
          { score: 1, label: "Emerging", observable: "90-110 min" },
          { score: 2, label: "Achieved", observable: "Actief 2+ uur" },
        ]
      },
      { id: "G2_PHY_SPEED", pillar: "PHYSICAL", category: "Movement", name: "Elite Speed", description: "Elite snelheid",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Gemiddeld" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Uitstekende snelheid" },
        ]
      },
      { id: "G2_PHY_POWER", pillar: "PHYSICAL", category: "Strength", name: "Shot Power", description: "Slagkracht",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Matig" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Sterke slagkracht" },
        ]
      },
      { id: "G2_PHY_FOOTWORK", pillar: "PHYSICAL", category: "Movement", name: "Elite Footwork", description: "Elite voetenwerk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Basis" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Elite voetenwerk" },
        ]
      },
      { id: "G2_PHY_AGILITY", pillar: "PHYSICAL", category: "Movement", name: "Agility", description: "Wendbaarheid",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Traag" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Zeer wendbaar" },
        ]
      },
      { id: "G2_PHY_CORE", pillar: "PHYSICAL", category: "Strength", name: "Core Strength", description: "Romp sterkte",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwak" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Sterke romp" },
        ]
      },
      { id: "G2_PHY_RECOVERY", pillar: "PHYSICAL", category: "Recovery", name: "Between Points", description: "Herstel tussen punten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Traag" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Snel herstel" },
        ]
      },
      { id: "G2_PHY_INJURY_PREV", pillar: "PHYSICAL", category: "Health", name: "Injury Prevention", description: "Blessure preventie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen aandacht" },
          { score: 1, label: "Emerging", observable: "Basis warming up" },
          { score: 2, label: "Achieved", observable: "Volledige preventie routine" },
        ]
      },

      // MENTAL (8 skills)
      { id: "G2_MEN_COMPETE", pillar: "MENTAL", category: "Competition", name: "Competitive Edge", description: "Competitieve instelling",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen strijdlust" },
          { score: 1, label: "Emerging", observable: "Goede strijdlust" },
          { score: 2, label: "Achieved", observable: "Elite strijdlust" },
        ]
      },
      { id: "G2_MEN_PRESSURE", pillar: "MENTAL", category: "Pressure", name: "Thrives Pressure", description: "Gedijt onder druk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkrampt" },
          { score: 1, label: "Emerging", observable: "Blijft kalm" },
          { score: 2, label: "Achieved", observable: "Gedijt onder druk" },
        ]
      },
      { id: "G2_MEN_FOCUS", pillar: "MENTAL", category: "Focus", name: "Long Match Focus", description: "Focus lange wedstrijd",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest focus" },
          { score: 1, label: "Emerging", observable: "Meestal gefocust" },
          { score: 2, label: "Achieved", observable: "Altijd gefocust" },
        ]
      },
      { id: "G2_MEN_COMEBACK", pillar: "MENTAL", category: "Resilience", name: "Comeback Mentality", description: "Comeback mentaliteit",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geeft op" },
          { score: 1, label: "Emerging", observable: "Soms comeback" },
          { score: 2, label: "Achieved", observable: "Sterke comebacks" },
        ]
      },
      { id: "G2_MEN_PLAN", pillar: "MENTAL", category: "Strategy", name: "Strategic Thinking", description: "Strategisch denken",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen strategie" },
          { score: 1, label: "Emerging", observable: "Basis" },
          { score: 2, label: "Achieved", observable: "Sterk strategisch" },
        ]
      },
      { id: "G2_MEN_CONFIDENCE", pillar: "MENTAL", category: "Confidence", name: "Self Belief", description: "Zelfvertrouwen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen vertrouwen" },
          { score: 1, label: "Emerging", observable: "Wisselend" },
          { score: 2, label: "Achieved", observable: "Sterk zelfvertrouwen" },
        ]
      },
      { id: "G2_MEN_PROFESSIONAL", pillar: "MENTAL", category: "Attitude", name: "Professional Attitude", description: "Professionele houding",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onprofessioneel" },
          { score: 1, label: "Emerging", observable: "Meestal" },
          { score: 2, label: "Achieved", observable: "Altijd professioneel" },
        ]
      },
      { id: "G2_MEN_BODY_LANG", pillar: "MENTAL", category: "Attitude", name: "Body Language", description: "Lichaamstaal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Negatief" },
          { score: 1, label: "Emerging", observable: "Wisselend" },
          { score: 2, label: "Achieved", observable: "Altijd positief" },
        ]
      },

      // SOCIAL (4 skills)
      { id: "G2_SOC_LEADER", pillar: "SOCIAL", category: "Leadership", name: "Leadership", description: "Leiderschap",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen leiderschap" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Natuurlijke leider" },
        ]
      },
      { id: "G2_SOC_AMBASSADOR", pillar: "SOCIAL", category: "Leadership", name: "Club Ambassador", description: "Club ambassadeur",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen ambassadeur" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Ware ambassadeur" },
        ]
      },
      { id: "G2_SOC_MENTOR", pillar: "SOCIAL", category: "Leadership", name: "Mentors Juniors", description: "Helpt jongeren",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Helpt niet" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Actief mentor" },
        ]
      },
      { id: "G2_SOC_SPORTSMANSHIP", pillar: "SOCIAL", category: "Sportsmanship", name: "Elite Sportsmanship", description: "Elite sportiviteit",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Basis" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Elite sportiviteit" },
        ]
      },

      // MATCH (8 skills)
      { id: "G2_MAT_TOURNEY", pillar: "MATCH", category: "Competition", name: "Tournament Success", description: "Toernooi succes",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen succes" },
          { score: 1, label: "Emerging", observable: "Soms rondes" },
          { score: 2, label: "Achieved", observable: "Regelmatig succes" },
        ]
      },
      { id: "G2_MAT_BIG_MATCH", pillar: "MATCH", category: "Match Play", name: "Big Match Player", description: "Grote wedstrijd speler",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkrampt" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Sterk in grote wedstrijden" },
        ]
      },
      { id: "G2_MAT_COMEBACK", pillar: "MATCH", category: "Match Play", name: "Match Comebacks", description: "Wedstrijd comebacks",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen comebacks" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Sterke comebacks" },
        ]
      },
      { id: "G2_MAT_CLOSE", pillar: "MATCH", category: "Match Play", name: "Closes Out", description: "Maakt af",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Maakt niet af" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Sluit wedstrijden af" },
        ]
      },
      { id: "G2_MAT_TIGHT", pillar: "MATCH", category: "Match Play", name: "Tight Match Win", description: "Wint krappe wedstrijden",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest vaak" },
          { score: 1, label: "Emerging", observable: "Soms winnen" },
          { score: 2, label: "Achieved", observable: "Wint krappe wedstrijden" },
        ]
      },
      { id: "G2_MAT_DOUBLES", pillar: "MATCH", category: "Doubles", name: "Doubles Champion", description: "Sterk dubbelspel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwak dubbel" },
          { score: 1, label: "Emerging", observable: "Goed dubbel" },
          { score: 2, label: "Achieved", observable: "Sterk dubbelspel" },
        ]
      },
      { id: "G2_MAT_RANKING", pillar: "MATCH", category: "Competition", name: "Ranking Focus", description: "Ranking focus",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen ranking" },
          { score: 1, label: "Emerging", observable: "Begint" },
          { score: 2, label: "Achieved", observable: "Actief ranking bouwen" },
        ]
      },
      { id: "G2_MAT_NATIONAL", pillar: "MATCH", category: "Competition", name: "National Aspirations", description: "Nationale aspiraties",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Lokaal" },
          { score: 1, label: "Emerging", observable: "Regionaal" },
          { score: 2, label: "Achieved", observable: "Nationaal niveau" },
        ]
      },
    ],
  },

  "GREEN_1": {
    levelId: "GREEN_1",
    rank: 1,
    name: "Elite",
    subtitle: "Ready for Yellow",
    abilitySnapshot: "Ik beheers green ball tennis en ben klaar voor gele bal!",
    philosophy: "Alle vaardigheden op Green niveau beheerst, klaar voor competitie op hoogste jeugdniveau.",
    pillarWeighting: {
      technique: 25,
      tactical: 30,
      physical: 20,
      mental: 15,
      social: 5,
      match: 5,
    },
    promotionRequirements: {
      techniqueMinPercent: 85,
      tacticalMinPercent: 80,
      matchMinPercent: 80,
      coachConfirmation: true,
      minSessions: 24,
    },
    skills: [
      // TECHNIQUE - COMPLETE MASTERY (10 skills)
      { id: "G1_STROKES", pillar: "TECHNIQUE", category: "Groundstrokes", name: "Complete Strokes", description: "Volledige grondslag techniek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwakke punten" },
          { score: 1, label: "Emerging", observable: "Bijna compleet" },
          { score: 2, label: "Achieved", observable: "Volledige techniek" },
        ]
      },
      { id: "G1_WEAPONS", pillar: "TECHNIQUE", category: "Weapons", name: "Multiple Weapons", description: "Meerdere wapens",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Eén wapen" },
          { score: 1, label: "Emerging", observable: "Twee wapens" },
          { score: 2, label: "Achieved", observable: "Meerdere wapens" },
        ]
      },
      { id: "G1_SERVE", pillar: "TECHNIQUE", category: "Serve", name: "Complete Serve", description: "Volledige serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Beperkt" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Volledig serve arsenaal" },
        ]
      },
      { id: "G1_SV_80PCT", pillar: "TECHNIQUE", category: "Serve", name: "80% First Serve", description: "80%+ eerste serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onder 65%" },
          { score: 1, label: "Emerging", observable: "65-80%" },
          { score: 2, label: "Achieved", observable: "80%+" },
        ]
      },
      { id: "G1_RETURN", pillar: "TECHNIQUE", category: "Return", name: "Complete Return", description: "Volledige return",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwak" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Volledig return spel" },
        ]
      },
      { id: "G1_NET", pillar: "TECHNIQUE", category: "Net Play", name: "Complete Net Game", description: "Volledig netspel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Beperkt" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Volledig netspel" },
        ]
      },
      { id: "G1_SPECIALTY", pillar: "TECHNIQUE", category: "Specialty", name: "All Specialty Shots", description: "Alle speciale slagen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Mist slagen" },
          { score: 1, label: "Emerging", observable: "Meeste" },
          { score: 2, label: "Achieved", observable: "Alle speciale slagen" },
        ]
      },
      { id: "G1_PRESSURE", pillar: "TECHNIQUE", category: "Execution", name: "Technique Under Pressure", description: "Techniek onder druk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Breekt" },
          { score: 1, label: "Emerging", observable: "Soms stabiel" },
          { score: 2, label: "Achieved", observable: "Stabiel onder druk" },
        ]
      },
      { id: "G1_CONSISTENCY", pillar: "TECHNIQUE", category: "Execution", name: "Elite Consistency", description: "Elite consistentie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Inconsistent" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Elite consistentie" },
        ]
      },
      { id: "G1_VARIETY", pillar: "TECHNIQUE", category: "Execution", name: "Shot Variety", description: "Slag variatie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Beperkt" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Volledige variatie" },
        ]
      },

      // TACTICAL - ELITE (12 skills)
      { id: "G1_TAC_STYLE", pillar: "TACTICAL", category: "Style", name: "Defined Style", description: "Gedefinieerde speelstijl",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onduidelijk" },
          { score: 1, label: "Emerging", observable: "Ontwikkelt" },
          { score: 2, label: "Achieved", observable: "Duidelijke eigen stijl" },
        ]
      },
      { id: "G1_TAC_PATTERNS", pillar: "TACTICAL", category: "Patterns", name: "Elite Patterns", description: "Elite patronen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Basis" },
          { score: 1, label: "Emerging", observable: "Gevorderd" },
          { score: 2, label: "Achieved", observable: "Elite patronen" },
        ]
      },
      { id: "G1_TAC_CONSTRUCT", pillar: "TACTICAL", category: "Construction", name: "Elite Construction", description: "Elite punt opbouw",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Inconsistent" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Elite constructie" },
        ]
      },
      { id: "G1_TAC_SERVE", pillar: "TACTICAL", category: "Serve", name: "Elite Serve Game", description: "Elite serve spel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Matig" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Elite serve spel" },
        ]
      },
      { id: "G1_TAC_RETURN", pillar: "TACTICAL", category: "Return", name: "Elite Return Game", description: "Elite return spel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Matig" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Elite return spel" },
        ]
      },
      { id: "G1_TAC_NET", pillar: "TACTICAL", category: "Net Play", name: "Elite Net Tactics", description: "Elite net tactiek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Basis" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Elite net tactiek" },
        ]
      },
      { id: "G1_TAC_DEFENSE", pillar: "TACTICAL", category: "Defense", name: "Elite Defense", description: "Elite verdediging",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Basis" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Elite verdediging" },
        ]
      },
      { id: "G1_TAC_MGMT", pillar: "TACTICAL", category: "Strategy", name: "Elite Match Mgmt", description: "Elite wedstrijd management",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Matig" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Elite management" },
        ]
      },
      { id: "G1_TAC_ADAPT", pillar: "TACTICAL", category: "Strategy", name: "Elite Adaptation", description: "Elite aanpassing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Traag" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Snelle elite aanpassing" },
        ]
      },
      { id: "G1_TAC_DOUBLES", pillar: "TACTICAL", category: "Doubles", name: "Elite Doubles", description: "Elite dubbel tactiek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Basis" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Elite dubbel tactiek" },
        ]
      },
      { id: "G1_TAC_SURFACE", pillar: "TACTICAL", category: "Strategy", name: "All Surface Play", description: "Speelt op alle ondergronden",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Eén ondergrond" },
          { score: 1, label: "Emerging", observable: "Twee" },
          { score: 2, label: "Achieved", observable: "Alle ondergronden" },
        ]
      },
      { id: "G1_TAC_IQ", pillar: "TACTICAL", category: "Strategy", name: "Tennis IQ", description: "Tennis IQ",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Gemiddeld" },
          { score: 1, label: "Emerging", observable: "Hoog" },
          { score: 2, label: "Achieved", observable: "Elite tennis IQ" },
        ]
      },

      // PHYSICAL (8 skills)
      { id: "G1_PHY_ENDURANCE", pillar: "PHYSICAL", category: "Fitness", name: "3 Hour Match", description: "Houdt 3 uur wedstrijd vol",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Max 2 uur" },
          { score: 1, label: "Emerging", observable: "2-2.5 uur" },
          { score: 2, label: "Achieved", observable: "3+ uur" },
        ]
      },
      { id: "G1_PHY_SPEED", pillar: "PHYSICAL", category: "Movement", name: "Elite Court Speed", description: "Elite baan snelheid",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Zeer goed" },
          { score: 2, label: "Achieved", observable: "Elite snelheid" },
        ]
      },
      { id: "G1_PHY_POWER", pillar: "PHYSICAL", category: "Strength", name: "Elite Power", description: "Elite kracht",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Zeer goed" },
          { score: 2, label: "Achieved", observable: "Elite kracht" },
        ]
      },
      { id: "G1_PHY_FOOTWORK", pillar: "PHYSICAL", category: "Movement", name: "Elite Footwork", description: "Elite voetenwerk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Zeer goed" },
          { score: 2, label: "Achieved", observable: "Elite voetenwerk" },
        ]
      },
      { id: "G1_PHY_AGILITY", pillar: "PHYSICAL", category: "Movement", name: "Elite Agility", description: "Elite wendbaarheid",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Zeer goed" },
          { score: 2, label: "Achieved", observable: "Elite wendbaarheid" },
        ]
      },
      { id: "G1_PHY_FITNESS", pillar: "PHYSICAL", category: "Fitness", name: "Complete Fitness", description: "Volledige fitheid",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwakke punten" },
          { score: 1, label: "Emerging", observable: "Bijna compleet" },
          { score: 2, label: "Achieved", observable: "Volledige fitheid" },
        ]
      },
      { id: "G1_PHY_RECOVERY", pillar: "PHYSICAL", category: "Recovery", name: "Elite Recovery", description: "Elite herstel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Traag" },
          { score: 1, label: "Emerging", observable: "Goed" },
          { score: 2, label: "Achieved", observable: "Elite herstel" },
        ]
      },
      { id: "G1_PHY_HEALTH", pillar: "PHYSICAL", category: "Health", name: "Injury Free", description: "Blessurevrij",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Vaak blessures" },
          { score: 1, label: "Emerging", observable: "Weinig blessures" },
          { score: 2, label: "Achieved", observable: "Blessurevrij" },
        ]
      },

      // MENTAL (8 skills)
      { id: "G1_MEN_COMPETE", pillar: "MENTAL", category: "Competition", name: "Elite Competitor", description: "Elite competitie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Zeer goed" },
          { score: 2, label: "Achieved", observable: "Elite competitor" },
        ]
      },
      { id: "G1_MEN_PRESSURE", pillar: "MENTAL", category: "Pressure", name: "Thrives Pressure", description: "Gedijt onder druk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Blijft kalm" },
          { score: 1, label: "Emerging", observable: "Presteert" },
          { score: 2, label: "Achieved", observable: "Gedijt volledig" },
        ]
      },
      { id: "G1_MEN_FOCUS", pillar: "MENTAL", category: "Focus", name: "Elite Focus", description: "Elite focus",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Zeer goed" },
          { score: 2, label: "Achieved", observable: "Elite focus" },
        ]
      },
      { id: "G1_MEN_RESILIENCE", pillar: "MENTAL", category: "Resilience", name: "Elite Resilience", description: "Elite veerkracht",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Zeer goed" },
          { score: 2, label: "Achieved", observable: "Elite veerkracht" },
        ]
      },
      { id: "G1_MEN_STRATEGY", pillar: "MENTAL", category: "Strategy", name: "Strategic Mind", description: "Strategische geest",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Basis" },
          { score: 1, label: "Emerging", observable: "Gevorderd" },
          { score: 2, label: "Achieved", observable: "Elite strategisch denken" },
        ]
      },
      { id: "G1_MEN_CONFIDENCE", pillar: "MENTAL", category: "Confidence", name: "Elite Confidence", description: "Elite zelfvertrouwen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Sterk" },
          { score: 2, label: "Achieved", observable: "Elite zelfvertrouwen" },
        ]
      },
      { id: "G1_MEN_PROFESSIONAL", pillar: "MENTAL", category: "Attitude", name: "Professional", description: "Professioneel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Ontwikkelt" },
          { score: 1, label: "Emerging", observable: "Meestal" },
          { score: 2, label: "Achieved", observable: "Volledig professioneel" },
        ]
      },
      { id: "G1_MEN_GOALS", pillar: "MENTAL", category: "Goals", name: "Goal Setting", description: "Doelen stellen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen doelen" },
          { score: 1, label: "Emerging", observable: "Basis doelen" },
          { score: 2, label: "Achieved", observable: "Duidelijke ambitieuze doelen" },
        ]
      },

      // SOCIAL (4 skills)
      { id: "G1_SOC_LEADER", pillar: "SOCIAL", category: "Leadership", name: "Team Leader", description: "Team leider",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen leider" },
          { score: 1, label: "Emerging", observable: "Soms leider" },
          { score: 2, label: "Achieved", observable: "Natuurlijke leider" },
        ]
      },
      { id: "G1_SOC_AMBASSADOR", pillar: "SOCIAL", category: "Leadership", name: "Sport Ambassador", description: "Sport ambassadeur",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen ambassadeur" },
          { score: 1, label: "Emerging", observable: "Club level" },
          { score: 2, label: "Achieved", observable: "Sport ambassadeur" },
        ]
      },
      { id: "G1_SOC_MENTOR", pillar: "SOCIAL", category: "Leadership", name: "Active Mentor", description: "Actief mentor",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Helpt niet" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Actief mentor voor jongeren" },
        ]
      },
      { id: "G1_SOC_NETWORK", pillar: "SOCIAL", category: "Network", name: "Tennis Network", description: "Tennis netwerk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Beperkt" },
          { score: 1, label: "Emerging", observable: "Groeit" },
          { score: 2, label: "Achieved", observable: "Sterk tennis netwerk" },
        ]
      },

      // MATCH (8 skills)
      { id: "G1_MAT_NATIONAL", pillar: "MATCH", category: "Competition", name: "National Level", description: "Nationaal niveau",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Regionaal" },
          { score: 1, label: "Emerging", observable: "Top regionaal" },
          { score: 2, label: "Achieved", observable: "Nationaal niveau" },
        ]
      },
      { id: "G1_MAT_RANKING", pillar: "MATCH", category: "Competition", name: "National Ranking", description: "Nationale ranking",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen ranking" },
          { score: 1, label: "Emerging", observable: "Begint" },
          { score: 2, label: "Achieved", observable: "Goede nationale ranking" },
        ]
      },
      { id: "G1_MAT_TOURNEY", pillar: "MATCH", category: "Competition", name: "Tournament Success", description: "Toernooi succes",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weinig succes" },
          { score: 1, label: "Emerging", observable: "Regelmatig rondes" },
          { score: 2, label: "Achieved", observable: "Wint toernooien" },
        ]
      },
      { id: "G1_MAT_BIG", pillar: "MATCH", category: "Match Play", name: "Big Match Winner", description: "Wint grote wedstrijden",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest vaak" },
          { score: 1, label: "Emerging", observable: "Soms winnen" },
          { score: 2, label: "Achieved", observable: "Wint grote wedstrijden" },
        ]
      },
      { id: "G1_MAT_CLUTCH", pillar: "MATCH", category: "Match Play", name: "Clutch Player", description: "Clutch speler",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkrampt" },
          { score: 1, label: "Emerging", observable: "Soms clutch" },
          { score: 2, label: "Achieved", observable: "Clutch speler" },
        ]
      },
      { id: "G1_MAT_DOUBLES", pillar: "MATCH", category: "Doubles", name: "Elite Doubles", description: "Elite dubbelspel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Goed" },
          { score: 1, label: "Emerging", observable: "Zeer goed" },
          { score: 2, label: "Achieved", observable: "Elite dubbelspel" },
        ]
      },
      { id: "G1_MAT_YELLOW_READY", pillar: "MATCH", category: "Readiness", name: "Yellow Ready", description: "Klaar voor Yellow",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Nog niet klaar" },
          { score: 1, label: "Emerging", observable: "Bijna klaar" },
          { score: 2, label: "Achieved", observable: "Volledig klaar voor Yellow" },
        ]
      },
      { id: "G1_MAT_TRANSITION", pillar: "MATCH", category: "Readiness", name: "Adult Transition", description: "Overgang naar volwassen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Niet klaar" },
          { score: 1, label: "Emerging", observable: "Bijna" },
          { score: 2, label: "Achieved", observable: "Klaar voor volwassen tennis" },
        ]
      },
    ],
  },
};

// Helper functions
export function getOrderedGreenLevelIds(): string[] {
  return ["GREEN_3", "GREEN_2", "GREEN_1"];
}

export function getGreenSkillsByPillar(levelId: string, pillar: string): GreenSkill[] {
  const level = GREEN_STAGE_SKILLS_BY_LEVEL[levelId];
  if (!level) return [];
  return level.skills.filter(s => s.pillar === pillar.toUpperCase());
}

export function countGreenSkillsPerLevel(levelId: string): number {
  const level = GREEN_STAGE_SKILLS_BY_LEVEL[levelId];
  return level ? level.skills.length : 0;
}

export function getGreenPillarWeighting(levelId: string): PillarWeighting | null {
  const level = GREEN_STAGE_SKILLS_BY_LEVEL[levelId];
  return level ? level.pillarWeighting : null;
}
