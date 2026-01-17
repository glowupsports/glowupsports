/**
 * Adult Glow Rank Skills - Complete Skills per Level
 * 
 * Based on GLOW RANK SYSTEM — ULTRA DEEP VERSION
 * Glow 9 → Glow 1 (9 = Absolute Beginner, 1 = Elite/Semi-Pro)
 * 
 * For EVERY Glow Rank:
 * - All 6 pillars must be at minimum "Meets Standard"
 * - 1 pillar too low = NO promotion
 * - Match results + behavior + technique = together decisive
 */

interface SkillRubric {
  score: number;
  label: string;
  observable: string;
}

interface GlowSkill {
  id: string;
  pillar: "TECHNIQUE" | "TACTICAL" | "PHYSICAL" | "MENTAL" | "SOCIAL" | "MATCH";
  name: string;
  description: string;
  rubric: SkillRubric[];
}

interface LevelSkillsConfig {
  levelId: string;
  rank: number;
  name: string;
  abilitySnapshot: string;
  promotionRequirements: {
    minTrainings?: number;
    minMatches?: number;
    winrateMin?: number;
    winrateMax?: number;
    coachConfirmation?: boolean;
  };
  skills: GlowSkill[];
}

export const ADULT_GLOW_SKILLS_BY_LEVEL: Record<string, LevelSkillsConfig> = {
  "GLOW_9": {
    levelId: "GLOW_9",
    rank: 9,
    name: "Absolute Beginner",
    abilitySnapshot: "Ik speel tennis, maar heb geen controle.",
    promotionRequirements: {
      minTrainings: 3,
      minMatches: 1,
    },
    skills: [
      // TECHNIQUE
      { id: "G9_FH_BASIC", pillar: "TECHNIQUE", name: "Forehand Basic", description: "Duwt bal, geen swingpad",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan bal niet consistent raken" },
          { score: 1, label: "Emerging", observable: "Raakt bal maar zonder controle of richting" },
          { score: 2, label: "Achieved", observable: "3 ballen achter elkaar over net met herkenbare grip" },
        ]
      },
      { id: "G9_BH_BASIC", pillar: "TECHNIQUE", name: "Backhand Basic", description: "Vaak one-hand push",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Mist backhand of slaat wild" },
          { score: 1, label: "Emerging", observable: "Push of bump, bal komt soms over" },
          { score: 2, label: "Achieved", observable: "Kan bal stilstaand raken met herkenbare backhand" },
        ]
      },
      { id: "G9_SERVE_BASIC", pillar: "TECHNIQUE", name: "Serve Basic", description: "Onderhands of incorrect bovenhands",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan niet serveren in het juiste vak" },
          { score: 1, label: "Emerging", observable: "Onderhands serve komt soms in" },
          { score: 2, label: "Achieved", observable: "Serve komt regelmatig in het vak" },
        ]
      },
      { id: "G9_CONTACT", pillar: "TECHNIQUE", name: "Contact Point", description: "Contactpunt inconsistent",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Raakt bal op willekeurige punten" },
          { score: 1, label: "Emerging", observable: "Soms goed contactpunt" },
          { score: 2, label: "Achieved", observable: "Kan bal stilstaand op juist punt raken" },
        ]
      },
      // TACTICAL
      { id: "G9_INTENT", pillar: "TACTICAL", name: "Intent", description: "Geen intentie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Slaat zonder doel" },
          { score: 1, label: "Emerging", observable: "Probeert bal over net te krijgen" },
          { score: 2, label: "Achieved", observable: "Begrijpt doel: bal over net naar andere kant" },
        ]
      },
      { id: "G9_SCORE_AWARENESS", pillar: "TACTICAL", name: "Score Awareness", description: "Geen begrip van score",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Begrijpt scoring niet" },
          { score: 1, label: "Emerging", observable: "Kent basis scoring met hulp" },
          { score: 2, label: "Achieved", observable: "Kan score bijhouden met hulp" },
        ]
      },
      // PHYSICAL
      { id: "G9_MOVEMENT", pillar: "PHYSICAL", name: "Movement", description: "Beweging recht op bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Staat stil of rent recht op bal" },
          { score: 1, label: "Emerging", observable: "Beweegt maar niet efficiënt" },
          { score: 2, label: "Achieved", observable: "Kan naar bal bewegen en stoppen" },
        ]
      },
      { id: "G9_ENDURANCE", pillar: "PHYSICAL", name: "Endurance", description: "Snel vermoeid (15-20 min)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Vermoeid na 10 minuten" },
          { score: 1, label: "Emerging", observable: "Kan 15-20 minuten spelen" },
          { score: 2, label: "Achieved", observable: "Kan sessie van 30 min volhouden" },
        ]
      },
      // MENTAL
      { id: "G9_FOCUS", pillar: "MENTAL", name: "Focus", description: "Focus < 5 min",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan niet focussen, afgeleid" },
          { score: 1, label: "Emerging", observable: "Focus 3-5 minuten" },
          { score: 2, label: "Achieved", observable: "Kan 10+ minuten gefocust oefenen" },
        ]
      },
      { id: "G9_FRUSTRATION", pillar: "MENTAL", name: "Frustration Control", description: "Frustratie bij fouten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Raakt gefrustreerd, stopt" },
          { score: 1, label: "Emerging", observable: "Soms gefrustreerd maar gaat door" },
          { score: 2, label: "Achieved", observable: "Accepteert fouten, probeert opnieuw" },
        ]
      },
      // SOCIAL
      { id: "G9_RULES", pillar: "SOCIAL", name: "Rules", description: "Volgt regels",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kent of volgt regels niet" },
          { score: 1, label: "Emerging", observable: "Kent basis regels" },
          { score: 2, label: "Achieved", observable: "Volgt regels en respecteert anderen" },
        ]
      },
      { id: "G9_COOPERATION", pillar: "SOCIAL", name: "Cooperation", description: "Kan samenwerken",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Werkt niet samen" },
          { score: 1, label: "Emerging", observable: "Probeert samen te werken" },
          { score: 2, label: "Achieved", observable: "Werkt goed samen in oefeningen" },
        ]
      },
      // MATCH
      { id: "G9_PLAY", pillar: "MATCH", name: "Match Play", description: "Recreatief spel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan geen punten spelen" },
          { score: 1, label: "Emerging", observable: "Speelt recreatief, geen echte wedstrijden" },
          { score: 2, label: "Achieved", observable: "Kan informele match spelen" },
        ]
      },
    ]
  },

  "GLOW_8": {
    levelId: "GLOW_8",
    rank: 8,
    name: "Beginner",
    abilitySnapshot: "Ik kan rallyen, maar zonder stabiliteit.",
    promotionRequirements: {
      minMatches: 10,
      winrateMin: 30,
      winrateMax: 70,
    },
    skills: [
      // TECHNIQUE
      { id: "G8_FH_SWING", pillar: "TECHNIQUE", name: "Forehand Swing", description: "FH/BH met basale swing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen herkenbare swing" },
          { score: 1, label: "Emerging", observable: "Basale swing, inconsistent" },
          { score: 2, label: "Achieved", observable: "Consistente FH met swing" },
        ]
      },
      { id: "G8_BH_SWING", pillar: "TECHNIQUE", name: "Backhand Swing", description: "Backhand met basis techniek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen backhand swing" },
          { score: 1, label: "Emerging", observable: "Slice of two-hand ontwikkelt" },
          { score: 2, label: "Achieved", observable: "Consistente BH swing" },
        ]
      },
      { id: "G8_RALLY", pillar: "TECHNIQUE", name: "Rally 5-7", description: "5-7 ballen rally",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan geen 5 ballen rally houden" },
          { score: 1, label: "Emerging", observable: "3-5 ballen rally" },
          { score: 2, label: "Achieved", observable: "Kan 5-7 ballen rally houden" },
        ]
      },
      { id: "G8_SERVE_OVERHEAD", pillar: "TECHNIQUE", name: "Overhead Serve", description: "Serve bovenhands ±50%",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen overhead serve" },
          { score: 1, label: "Emerging", observable: "30-50% overhead serves in" },
          { score: 2, label: "Achieved", observable: "50%+ overhead serves in" },
        ]
      },
      { id: "G8_VOLLEY", pillar: "TECHNIQUE", name: "Volley Basic", description: "Volley mogelijk zonder richting",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan niet volleyen" },
          { score: 1, label: "Emerging", observable: "Volley komt soms terug" },
          { score: 2, label: "Achieved", observable: "Volley terug maar nog geen richting" },
        ]
      },
      // TACTICAL
      { id: "G8_DIRECTION", pillar: "TACTICAL", name: "Direction", description: "Begrijpt links/rechts spelen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen richting bewustzijn" },
          { score: 1, label: "Emerging", observable: "Kent links/rechts concept" },
          { score: 2, label: "Achieved", observable: "Kan bewust links of rechts spelen" },
        ]
      },
      { id: "G8_SCORE", pillar: "TACTICAL", name: "Score Knowledge", description: "Basis scorekennis",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kent scoring niet" },
          { score: 1, label: "Emerging", observable: "Kent 15-30-40, soms verward" },
          { score: 2, label: "Achieved", observable: "Kent scoring, kan bijhouden" },
        ]
      },
      { id: "G8_SHORT_BALL", pillar: "TACTICAL", name: "Short Ball Recognition", description: "Herkent korte bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Herkent korte bal niet" },
          { score: 1, label: "Emerging", observable: "Ziet korte bal soms" },
          { score: 2, label: "Achieved", observable: "Herkent en beweegt naar korte bal" },
        ]
      },
      // PHYSICAL
      { id: "G8_LATERAL", pillar: "PHYSICAL", name: "Lateral Movement", description: "Zijwaarts bewegen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Beweegt alleen vooruit" },
          { score: 1, label: "Emerging", observable: "Kan zijwaarts maar traag" },
          { score: 2, label: "Achieved", observable: "Goede laterale beweging" },
        ]
      },
      { id: "G8_ENDURANCE_45", pillar: "PHYSICAL", name: "45 Min Endurance", description: "45 min spelen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moe na 30 min" },
          { score: 1, label: "Emerging", observable: "Kan 30-40 min spelen" },
          { score: 2, label: "Achieved", observable: "Kan 45 min doorspelen" },
        ]
      },
      { id: "G8_SPLIT_STEP", pillar: "PHYSICAL", name: "Split Step Intro", description: "Split step af en toe",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen split step" },
          { score: 1, label: "Emerging", observable: "Soms split step na reminder" },
          { score: 2, label: "Achieved", observable: "Gebruikt split step regelmatig" },
        ]
      },
      // MENTAL
      { id: "G8_ERROR_ACCEPT", pillar: "MENTAL", name: "Error Acceptance", description: "Accepteert fouten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Boos bij fouten" },
          { score: 1, label: "Emerging", observable: "Soms gefrustreerd maar herstelt" },
          { score: 2, label: "Achieved", observable: "Accepteert fouten, probeert opnieuw" },
        ]
      },
      { id: "G8_FEEDBACK", pillar: "MENTAL", name: "Feedback Reception", description: "Luistert naar feedback",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Negeert feedback" },
          { score: 1, label: "Emerging", observable: "Luistert maar past niet toe" },
          { score: 2, label: "Achieved", observable: "Luistert en past feedback toe" },
        ]
      },
      // SOCIAL
      { id: "G8_DOUBLES", pillar: "SOCIAL", name: "Doubles Play", description: "Speelt dubbel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan geen dubbel spelen" },
          { score: 1, label: "Emerging", observable: "Begrijpt dubbel posities" },
          { score: 2, label: "Achieved", observable: "Speelt dubbel met partner" },
        ]
      },
      { id: "G8_FAIR_PLAY", pillar: "SOCIAL", name: "Fair Play", description: "Positieve communicatie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Negatief of onrespectful" },
          { score: 1, label: "Emerging", observable: "Meestal positief" },
          { score: 2, label: "Achieved", observable: "Altijd positief, fair play" },
        ]
      },
      // MATCH
      { id: "G8_MATCH_PLAY", pillar: "MATCH", name: "Informal Matches", description: "Kan score bijhouden",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan geen wedstrijd spelen" },
          { score: 1, label: "Emerging", observable: "Speelt informeel, hulp bij score" },
          { score: 2, label: "Achieved", observable: "Speelt punten uit, houdt score bij" },
        ]
      },
    ]
  },

  "GLOW_7": {
    levelId: "GLOW_7",
    rank: 7,
    name: "Low Intermediate",
    abilitySnapshot: "Consistente FH/BH, topspin zichtbaar, speelt sets.",
    promotionRequirements: {
      minMatches: 20,
      winrateMin: 40,
      winrateMax: 45,
      coachConfirmation: true,
    },
    skills: [
      // TECHNIQUE
      { id: "G7_FH_CONSISTENT", pillar: "TECHNIQUE", name: "Consistent Forehand", description: "Consistente FH met topspin",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Inconsistente forehand" },
          { score: 1, label: "Emerging", observable: "Soms topspin, niet consistent" },
          { score: 2, label: "Achieved", observable: "Consistente FH met zichtbare topspin" },
        ]
      },
      { id: "G7_BH_CONSISTENT", pillar: "TECHNIQUE", name: "Consistent Backhand", description: "Betrouwbare backhand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onbetrouwbare backhand" },
          { score: 1, label: "Emerging", observable: "Soms goed, soms fout" },
          { score: 2, label: "Achieved", observable: "Consistente BH met controle" },
        ]
      },
      { id: "G7_SERVE_RHYTHM", pillar: "TECHNIQUE", name: "Serve Rhythm", description: "Serve met ritme",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen ritme in serve" },
          { score: 1, label: "Emerging", observable: "Soms vloeiend ritme" },
          { score: 2, label: "Achieved", observable: "Vloeiende serve met ritme" },
        ]
      },
      { id: "G7_VOLLEY_CONTROL", pillar: "TECHNIQUE", name: "Volley Control", description: "Volley met controle",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen volley controle" },
          { score: 1, label: "Emerging", observable: "Volley komt terug maar zonder richting" },
          { score: 2, label: "Achieved", observable: "Volley met controle en richting" },
        ]
      },
      { id: "G7_RALLY_10", pillar: "TECHNIQUE", name: "Rally 10+", description: "10+ ballen rally",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan geen 10 ballen rally" },
          { score: 1, label: "Emerging", observable: "7-10 ballen rally" },
          { score: 2, label: "Achieved", observable: "10+ ballen rally consistent" },
        ]
      },
      // TACTICAL
      { id: "G7_DEPTH", pillar: "TACTICAL", name: "Depth Usage", description: "Diepte gebruiken",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Ballen landen kort" },
          { score: 1, label: "Emerging", observable: "Soms diep, soms kort" },
          { score: 2, label: "Achieved", observable: "Speelt bewust diep" },
        ]
      },
      { id: "G7_ATTACK_DEFEND", pillar: "TACTICAL", name: "Attack vs Defend", description: "Aanval vs verdediging",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kent verschil niet" },
          { score: 1, label: "Emerging", observable: "Begrijpt concept" },
          { score: 2, label: "Achieved", observable: "Kan switchen tussen aanval/verdediging" },
        ]
      },
      { id: "G7_WEAKNESS", pillar: "TACTICAL", name: "Weakness Recognition", description: "Herkent zwakke kant",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Speelt random" },
          { score: 1, label: "Emerging", observable: "Ziet soms zwakke kant" },
          { score: 2, label: "Achieved", observable: "Speelt bewust naar zwakke kant" },
        ]
      },
      // PHYSICAL
      { id: "G7_FITNESS", pillar: "PHYSICAL", name: "Base Fitness", description: "Goede basisconditie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Slechte conditie" },
          { score: 1, label: "Emerging", observable: "Matige conditie" },
          { score: 2, label: "Achieved", observable: "Goede basisconditie" },
        ]
      },
      { id: "G7_FOOTWORK", pillar: "PHYSICAL", name: "Correct Footwork", description: "Correct voetenwerk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Slecht voetenwerk" },
          { score: 1, label: "Emerging", observable: "Soms correct" },
          { score: 2, label: "Achieved", observable: "Correct voetenwerk consistent" },
        ]
      },
      { id: "G7_SET_PLAY", pillar: "PHYSICAL", name: "Set Endurance", description: "Kan 1 set spelen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan geen set afmaken" },
          { score: 1, label: "Emerging", observable: "Moe aan eind van set" },
          { score: 2, label: "Achieved", observable: "Speelt volle set door" },
        ]
      },
      // MENTAL
      { id: "G7_STABLE", pillar: "MENTAL", name: "Emotional Stability", description: "Emotioneel stabiel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Emotioneel instabiel" },
          { score: 1, label: "Emerging", observable: "Soms emotioneel" },
          { score: 2, label: "Achieved", observable: "Blijft kalm tijdens set" },
        ]
      },
      { id: "G7_FINISH_SET", pillar: "MENTAL", name: "Set Completion", description: "Kan set afmaken",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geeft op" },
          { score: 1, label: "Emerging", observable: "Maakt set af maar moeizaam" },
          { score: 2, label: "Achieved", observable: "Maakt set af met focus" },
        ]
      },
      { id: "G7_POSITIVE_BEHIND", pillar: "MENTAL", name: "Positive When Behind", description: "Blijft positief bij achterstand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geeft op bij achterstand" },
          { score: 1, label: "Emerging", observable: "Worstelt maar blijft proberen" },
          { score: 2, label: "Achieved", observable: "Blijft positief en vecht terug" },
        ]
      },
      // SOCIAL
      { id: "G7_COACHABLE", pillar: "SOCIAL", name: "Coachability", description: "Coachbaar",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Neemt feedback niet aan" },
          { score: 1, label: "Emerging", observable: "Soms coachbaar" },
          { score: 2, label: "Achieved", observable: "Zeer coachbaar, past toe" },
        ]
      },
      { id: "G7_TEAM", pillar: "SOCIAL", name: "Team Behavior", description: "Teamgedrag",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen teamspeler" },
          { score: 1, label: "Emerging", observable: "Soms teamgericht" },
          { score: 2, label: "Achieved", observable: "Goed teamgedrag" },
        ]
      },
      // MATCH
      { id: "G7_COMPETITION", pillar: "MATCH", name: "Competition Play", description: "Speelt competitie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen competitie ervaring" },
          { score: 1, label: "Emerging", observable: "Eerste competitie wedstrijden" },
          { score: 2, label: "Achieved", observable: "Speelt regelmatig competitie" },
        ]
      },
      { id: "G7_BEAT_BEGINNERS", pillar: "MATCH", name: "Beats Beginners", description: "Wint van beginners",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest van beginners" },
          { score: 1, label: "Emerging", observable: "Wint soms van beginners" },
          { score: 2, label: "Achieved", observable: "Wint consistent van beginners" },
        ]
      },
    ]
  },

  "GLOW_6": {
    levelId: "GLOW_6",
    rank: 6,
    name: "Intermediate",
    abilitySnapshot: "FH/BH variatie, slice, serve met richting.",
    promotionRequirements: {
      minMatches: 25,
      winrateMin: 50,
      coachConfirmation: true,
    },
    skills: [
      // TECHNIQUE
      { id: "G6_FH_VARIATION", pillar: "TECHNIQUE", name: "FH Variation", description: "Forehand variatie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Alleen één type FH" },
          { score: 1, label: "Emerging", observable: "Probeert variatie" },
          { score: 2, label: "Achieved", observable: "FH met snelheid/spin variatie" },
        ]
      },
      { id: "G6_SLICE", pillar: "TECHNIQUE", name: "Slice Shot", description: "Slice inzetbaar",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen slice" },
          { score: 1, label: "Emerging", observable: "Slice ontwikkelt" },
          { score: 2, label: "Achieved", observable: "Effectieve slice als wapen" },
        ]
      },
      { id: "G6_SERVE_DIRECTION", pillar: "TECHNIQUE", name: "Serve Direction", description: "Serve met richting",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen controle over richting" },
          { score: 1, label: "Emerging", observable: "Soms naar doel" },
          { score: 2, label: "Achieved", observable: "Kan links/rechts serveren" },
        ]
      },
      { id: "G6_OVERHEAD", pillar: "TECHNIQUE", name: "Overhead Reliable", description: "Smash betrouwbaar",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Mist smashes" },
          { score: 1, label: "Emerging", observable: "Soms goed, soms fout" },
          { score: 2, label: "Achieved", observable: "Betrouwbare overhead" },
        ]
      },
      // TACTICAL
      { id: "G6_POINT_BUILD", pillar: "TACTICAL", name: "Point Construction", description: "Puntopbouw",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Speelt random punten" },
          { score: 1, label: "Emerging", observable: "Soms puntopbouw" },
          { score: 2, label: "Achieved", observable: "Bouwt punten op met plan" },
        ]
      },
      { id: "G6_PATTERNS", pillar: "TACTICAL", name: "Pattern Recognition", description: "Herkent patronen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Ziet geen patronen" },
          { score: 1, label: "Emerging", observable: "Herkent basis patronen" },
          { score: 2, label: "Achieved", observable: "Gebruikt 2+ patronen bewust" },
        ]
      },
      { id: "G6_PLAN_CHANGE", pillar: "TACTICAL", name: "Plan Adjustment", description: "Verandert plan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Houdt vast aan 1 plan" },
          { score: 1, label: "Emerging", observable: "Soms aanpassing" },
          { score: 2, label: "Achieved", observable: "Past plan aan op tegenstander" },
        ]
      },
      // PHYSICAL
      { id: "G6_90MIN", pillar: "PHYSICAL", name: "90 Min Intensity", description: "90 min intensief",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moe na 60 min" },
          { score: 1, label: "Emerging", observable: "60-80 min ok" },
          { score: 2, label: "Achieved", observable: "90 min intensief spelen" },
        ]
      },
      { id: "G6_RECOVERY", pillar: "PHYSICAL", name: "Quick Recovery", description: "Snelle recovery",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Traag herstel" },
          { score: 1, label: "Emerging", observable: "Matig herstel" },
          { score: 2, label: "Achieved", observable: "Snel herstel tussen punten" },
        ]
      },
      { id: "G6_CORE", pillar: "PHYSICAL", name: "Core Stability", description: "Goede core stability",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwakke core" },
          { score: 1, label: "Emerging", observable: "Basis core kracht" },
          { score: 2, label: "Achieved", observable: "Sterke, stabiele core" },
        ]
      },
      // MENTAL
      { id: "G6_PRESSURE", pillar: "MENTAL", name: "Calm Under Pressure", description: "Rustig onder druk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkrampt onder druk" },
          { score: 1, label: "Emerging", observable: "Soms rustig" },
          { score: 2, label: "Achieved", observable: "Blijft kalm onder druk" },
        ]
      },
      { id: "G6_FOCUS_MATCH", pillar: "MENTAL", name: "Match Focus", description: "Focus hele match",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Focus daalt snel" },
          { score: 1, label: "Emerging", observable: "Focus soms weg" },
          { score: 2, label: "Achieved", observable: "Houdt focus hele match" },
        ]
      },
      { id: "G6_SELF_REG", pillar: "MENTAL", name: "Self Regulation", description: "Zelfregulatie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen emotie controle" },
          { score: 1, label: "Emerging", observable: "Probeert te reguleren" },
          { score: 2, label: "Achieved", observable: "Goede zelfregulatie" },
        ]
      },
      // SOCIAL
      { id: "G6_LEADERSHIP", pillar: "SOCIAL", name: "Leadership", description: "Leiderschap",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Volger" },
          { score: 1, label: "Emerging", observable: "Soms initiatief" },
          { score: 2, label: "Achieved", observable: "Toont leiderschap" },
        ]
      },
      { id: "G6_INFLUENCE", pillar: "SOCIAL", name: "Positive Influence", description: "Positieve invloed",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Negatieve invloed" },
          { score: 1, label: "Emerging", observable: "Neutraal" },
          { score: 2, label: "Achieved", observable: "Positieve invloed op anderen" },
        ]
      },
      // MATCH
      { id: "G6_TOURNAMENTS", pillar: "MATCH", name: "Tournament Play", description: "Competitie + toernooien",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen toernooi ervaring" },
          { score: 1, label: "Emerging", observable: "Eerste toernooien" },
          { score: 2, label: "Achieved", observable: "Regelmatig toernooien" },
        ]
      },
      { id: "G6_REGULAR_WINS", pillar: "MATCH", name: "Regular Wins", description: "Regelmatig winst",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest meestal" },
          { score: 1, label: "Emerging", observable: "Wint soms" },
          { score: 2, label: "Achieved", observable: "Wint regelmatig op niveau" },
        ]
      },
    ]
  },

  "GLOW_5": {
    levelId: "GLOW_5",
    rank: 5,
    name: "Advanced Intermediate",
    abilitySnapshot: "Wapen ontwikkeld, serve +1 bal, netspel effectief.",
    promotionRequirements: {
      minMatches: 30,
      winrateMin: 60,
      coachConfirmation: true,
    },
    skills: [
      // TECHNIQUE
      { id: "G5_WEAPON", pillar: "TECHNIQUE", name: "Weapon Developed", description: "Wapen ontwikkeld",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen duidelijk wapen" },
          { score: 1, label: "Emerging", observable: "Potentieel wapen zichtbaar" },
          { score: 2, label: "Achieved", observable: "Sterk wapen (FH/serve/etc)" },
        ]
      },
      { id: "G5_SERVE_PLUS1", pillar: "TECHNIQUE", name: "Serve +1", description: "Serve +1 bal tactiek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen serve+1 plan" },
          { score: 1, label: "Emerging", observable: "Soms serve+1" },
          { score: 2, label: "Achieved", observable: "Consistent serve+1 patroon" },
        ]
      },
      { id: "G5_NET_EFFECTIVE", pillar: "TECHNIQUE", name: "Effective Net Play", description: "Netspel effectief",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Vermijdt net" },
          { score: 1, label: "Emerging", observable: "Komt soms naar net" },
          { score: 2, label: "Achieved", observable: "Effectief netspel, wint punten" },
        ]
      },
      // TACTICAL
      { id: "G5_GAMEPLAN", pillar: "TACTICAL", name: "Game Plan", description: "Gameplan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Speelt zonder plan" },
          { score: 1, label: "Emerging", observable: "Basis plan" },
          { score: 2, label: "Achieved", observable: "Duidelijk gameplan per tegenstander" },
        ]
      },
      { id: "G5_EXPLOIT", pillar: "TACTICAL", name: "Exploit Weakness", description: "Exploiteert zwaktes",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Speelt niet op zwaktes" },
          { score: 1, label: "Emerging", observable: "Ziet zwaktes" },
          { score: 2, label: "Achieved", observable: "Exploiteert zwaktes systematisch" },
        ]
      },
      { id: "G5_TEMPO", pillar: "TACTICAL", name: "Tempo Control", description: "Tempo controle",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Reageert alleen" },
          { score: 1, label: "Emerging", observable: "Soms tempo controle" },
          { score: 2, label: "Achieved", observable: "Dicteert tempo van rally" },
        ]
      },
      // PHYSICAL
      { id: "G5_EXPLOSIVE", pillar: "PHYSICAL", name: "Explosiveness", description: "Explosief",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Traag, geen explosiviteit" },
          { score: 1, label: "Emerging", observable: "Soms explosief" },
          { score: 2, label: "Achieved", observable: "Explosieve eerste stap" },
        ]
      },
      { id: "G5_INJURY_AWARE", pillar: "PHYSICAL", name: "Injury Awareness", description: "Blessurebewust",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Negeert lichaam signalen" },
          { score: 1, label: "Emerging", observable: "Soms bewust" },
          { score: 2, label: "Achieved", observable: "Warmt goed op, blessurebewust" },
        ]
      },
      { id: "G5_TOP_FITNESS", pillar: "PHYSICAL", name: "Top Fitness", description: "Conditie top",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Matige conditie" },
          { score: 1, label: "Emerging", observable: "Goede conditie" },
          { score: 2, label: "Achieved", observable: "Uitstekende conditie" },
        ]
      },
      // MENTAL
      { id: "G5_PRESSURE_RESISTANT", pillar: "MENTAL", name: "Pressure Resistant", description: "Drukbestendig",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Bezwijkt onder druk" },
          { score: 1, label: "Emerging", observable: "Soms goed onder druk" },
          { score: 2, label: "Achieved", observable: "Presteert onder druk" },
        ]
      },
      { id: "G5_MOMENTUM", pillar: "MENTAL", name: "Momentum Switch", description: "Momentum omdraaien",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest momentum vaak" },
          { score: 1, label: "Emerging", observable: "Soms comeback" },
          { score: 2, label: "Achieved", observable: "Kan momentum omdraaien" },
        ]
      },
      // SOCIAL
      { id: "G5_ROLE_MODEL", pillar: "SOCIAL", name: "Role Model", description: "Rolmodel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen voorbeeld" },
          { score: 1, label: "Emerging", observable: "Soms positief voorbeeld" },
          { score: 2, label: "Achieved", observable: "Rolmodel voor anderen" },
        ]
      },
      { id: "G5_PROFESSIONAL", pillar: "SOCIAL", name: "Professional Behavior", description: "Professioneel gedrag",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onprofessioneel" },
          { score: 1, label: "Emerging", observable: "Meestal professioneel" },
          { score: 2, label: "Achieved", observable: "Altijd professioneel" },
        ]
      },
      // MATCH
      { id: "G5_STRONG_COMP", pillar: "MATCH", name: "Strong Competition", description: "Sterke competitie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Speelt laag niveau" },
          { score: 1, label: "Emerging", observable: "Soms hoger niveau" },
          { score: 2, label: "Achieved", observable: "Speelt structureel sterke competitie" },
        ]
      },
      { id: "G5_CONSISTENT_WINS", pillar: "MATCH", name: "Consistent Wins", description: "Structureel winnen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wint niet consistent" },
          { score: 1, label: "Emerging", observable: "Wint regelmatig" },
          { score: 2, label: "Achieved", observable: "Wint structureel op niveau" },
        ]
      },
    ]
  },

  "GLOW_4": {
    levelId: "GLOW_4",
    rank: 4,
    name: "Performance",
    abilitySnapshot: "Alles betrouwbaar, tactisch volwassen, fysiek top, mentaal ijzersterk.",
    promotionRequirements: {
      minMatches: 40,
      winrateMin: 65,
      winrateMax: 70,
      coachConfirmation: true,
    },
    skills: [
      { id: "G4_ALL_RELIABLE", pillar: "TECHNIQUE", name: "All Shots Reliable", description: "Alle slagen betrouwbaar",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwakke slagen aanwezig" },
          { score: 1, label: "Emerging", observable: "Meeste slagen goed" },
          { score: 2, label: "Achieved", observable: "Alle slagen betrouwbaar" },
        ]
      },
      { id: "G4_SECOND_SPIN", pillar: "TECHNIQUE", name: "Spin Second Serve", description: "Tweede service met spin",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwakke tweede service" },
          { score: 1, label: "Emerging", observable: "Soms spin" },
          { score: 2, label: "Achieved", observable: "Kick/slice tweede service" },
        ]
      },
      { id: "G4_TACTICAL_MATURE", pillar: "TACTICAL", name: "Tactically Mature", description: "Tactisch volwassen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Tactisch onvolwassen" },
          { score: 1, label: "Emerging", observable: "Groeiend tactisch inzicht" },
          { score: 2, label: "Achieved", observable: "Volledig tactisch volwassen" },
        ]
      },
      { id: "G4_DEFENSIVE", pillar: "TACTICAL", name: "Defensive Patterns", description: "Defensieve patronen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan niet verdedigen" },
          { score: 1, label: "Emerging", observable: "1 defensief patroon" },
          { score: 2, label: "Achieved", observable: "2+ defensieve patronen" },
        ]
      },
      { id: "G4_PHYSICAL_TOP", pillar: "PHYSICAL", name: "Physical Peak", description: "Fysiek top",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Fysiek gemiddeld" },
          { score: 1, label: "Emerging", observable: "Boven gemiddeld" },
          { score: 2, label: "Achieved", observable: "Fysiek top niveau" },
        ]
      },
      { id: "G4_NET_TRANSITION", pillar: "PHYSICAL", name: "Net Transition", description: "Transitie naar net",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen net transitie" },
          { score: 1, label: "Emerging", observable: "Soms naar net" },
          { score: 2, label: "Achieved", observable: "1+ netpunt per game" },
        ]
      },
      { id: "G4_IRON_MENTAL", pillar: "MENTAL", name: "Iron Mental", description: "Mentaal ijzersterk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Mentaal kwetsbaar" },
          { score: 1, label: "Emerging", observable: "Meestal mentaal sterk" },
          { score: 2, label: "Achieved", observable: "Mentaal ijzersterk" },
        ]
      },
      { id: "G4_TIEBREAK", pillar: "MENTAL", name: "Tiebreak Stable", description: "Stabiel in tiebreak",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkrampt in tiebreak" },
          { score: 1, label: "Emerging", observable: "Soms goed in tiebreak" },
          { score: 2, label: "Achieved", observable: "Stabiel in tiebreaks" },
        ]
      },
      { id: "G4_MENTOR", pillar: "SOCIAL", name: "Mentor Others", description: "Helpt anderen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Helpt niet" },
          { score: 1, label: "Emerging", observable: "Soms tips" },
          { score: 2, label: "Achieved", observable: "Mentort jongere spelers" },
        ]
      },
      { id: "G4_MULTIPLE_STYLES", pillar: "MATCH", name: "Beats Multiple Styles", description: "Verslaat meerdere stijlen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moeite met bepaalde stijlen" },
          { score: 1, label: "Emerging", observable: "Wint van sommige stijlen" },
          { score: 2, label: "Achieved", observable: "Verslaat diverse speelstijlen" },
        ]
      },
    ]
  },

  "GLOW_3": {
    levelId: "GLOW_3",
    rank: 3,
    name: "High Performance",
    abilitySnapshot: "Elite consistency, wedstrijdintelligentie, topsport mentaliteit.",
    promotionRequirements: {
      minMatches: 50,
      winrateMin: 70,
      coachConfirmation: true,
    },
    skills: [
      { id: "G3_ELITE_CONSISTENCY", pillar: "TECHNIQUE", name: "Elite Consistency", description: "Elite consistentie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Inconsistent" },
          { score: 1, label: "Emerging", observable: "Meestal consistent" },
          { score: 2, label: "Achieved", observable: "Elite niveau consistentie" },
        ]
      },
      { id: "G3_SERVE_PLUS1_DOM", pillar: "TECHNIQUE", name: "Serve+1 Dominance", description: "Serve+1 dominantie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen serve+1 dominantie" },
          { score: 1, label: "Emerging", observable: "Soms dominant" },
          { score: 2, label: "Achieved", observable: "Domineert met serve+1" },
        ]
      },
      { id: "G3_BH_NO_EXPLOIT", pillar: "TECHNIQUE", name: "BH No Exploit", description: "Backhand niet exploiteerbaar",
        rubric: [
          { score: 0, label: "Not Yet", observable: "BH is zwakte" },
          { score: 1, label: "Emerging", observable: "BH verbetert" },
          { score: 2, label: "Achieved", observable: "BH is betrouwbaar, geen zwakte" },
        ]
      },
      { id: "G3_MATCH_INTELLIGENCE", pillar: "TACTICAL", name: "Match Intelligence", description: "Wedstrijdintelligentie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Beperkt tactisch" },
          { score: 1, label: "Emerging", observable: "Groeiend inzicht" },
          { score: 2, label: "Achieved", observable: "Hoge wedstrijdintelligentie" },
        ]
      },
      { id: "G3_FITNESS_TEST", pillar: "PHYSICAL", name: "Fitness Baseline", description: "Conditie + snelheid test",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Faalt fitness test" },
          { score: 1, label: "Emerging", observable: "Haalt minimum" },
          { score: 2, label: "Achieved", observable: "Haalt hoge fitness standaard" },
        ]
      },
      { id: "G3_TOPSPORT_MENTAL", pillar: "MENTAL", name: "Elite Mentality", description: "Topsport mentaliteit",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Amateur mentaliteit" },
          { score: 1, label: "Emerging", observable: "Groeit naar topsport" },
          { score: 2, label: "Achieved", observable: "Topsport mentaliteit" },
        ]
      },
      { id: "G3_AMBASSADOR", pillar: "SOCIAL", name: "Club Ambassador", description: "Ambassadeur",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen ambassadeur" },
          { score: 1, label: "Emerging", observable: "Soms representatief" },
          { score: 2, label: "Achieved", observable: "Representeert club positief" },
        ]
      },
      { id: "G3_BEAT_RANK4", pillar: "MATCH", name: "Beat Rank 4 60%", description: "Wint 60% van Glow 4",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest van Glow 4" },
          { score: 1, label: "Emerging", observable: "50-50 tegen Glow 4" },
          { score: 2, label: "Achieved", observable: "Wint 60%+ van Glow 4" },
        ]
      },
    ]
  },

  "GLOW_2": {
    levelId: "GLOW_2",
    rank: 2,
    name: "National Top",
    abilitySnapshot: "Near-pro intensity, tactisch volwassen.",
    promotionRequirements: {
      minMatches: 60,
      coachConfirmation: true,
    },
    skills: [
      { id: "G2_MULTI_STYLE", pillar: "TECHNIQUE", name: "Multi-Style", description: "Multi-stijl competent",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Eén stijl" },
          { score: 1, label: "Emerging", observable: "Leert tweede stijl" },
          { score: 2, label: "Achieved", observable: "Aanval + verdediging beide sterk" },
        ]
      },
      { id: "G2_NEAR_PRO", pillar: "TECHNIQUE", name: "Near Pro Technique", description: "Bijna pro niveau techniek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Clubniveau techniek" },
          { score: 1, label: "Emerging", observable: "Hoog clubniveau" },
          { score: 2, label: "Achieved", observable: "Near-pro techniek" },
        ]
      },
      { id: "G2_HIGH_PRESSURE", pillar: "TACTICAL", name: "High Pressure Tactics", description: "Tactieken onder hoge druk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest tactiek onder druk" },
          { score: 1, label: "Emerging", observable: "Soms tactisch onder druk" },
          { score: 2, label: "Achieved", observable: "Tactisch sterk onder hoge druk" },
        ]
      },
      { id: "G2_STRENGTH_PREVENTION", pillar: "PHYSICAL", name: "Strength + Prevention", description: "Kracht + blessurepreventie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen preventie routine" },
          { score: 1, label: "Emerging", observable: "Basis routine" },
          { score: 2, label: "Achieved", observable: "Volledige S&C + preventie" },
        ]
      },
      { id: "G2_TILT_CONTROL", pillar: "MENTAL", name: "Tilt Control", description: "Tilt controle onder druk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Tilt onder druk" },
          { score: 1, label: "Emerging", observable: "Soms tilt" },
          { score: 2, label: "Achieved", observable: "Geen tilt, altijd gefocust" },
        ]
      },
      { id: "G2_RESPECT", pillar: "SOCIAL", name: "National Respect", description: "Nationaal gerespecteerd",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onbekend" },
          { score: 1, label: "Emerging", observable: "Regionaal bekend" },
          { score: 2, label: "Achieved", observable: "Nationaal gerespecteerd" },
        ]
      },
      { id: "G2_BEAT_RANK3", pillar: "MATCH", name: "Beat Rank 3 Multiple", description: "Wint meervoudig van Glow 3",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest van Glow 3" },
          { score: 1, label: "Emerging", observable: "Wint soms van Glow 3" },
          { score: 2, label: "Achieved", observable: "Wint regelmatig van Glow 3" },
        ]
      },
    ]
  },

  "GLOW_1": {
    levelId: "GLOW_1",
    rank: 1,
    name: "Elite / Semi-Pro",
    abilitySnapshot: "ITF / College / Pro niveau - alleen fine-tuning.",
    promotionRequirements: {
      coachConfirmation: true,
    },
    skills: [
      { id: "G1_FULL_TOOLKIT", pillar: "TECHNIQUE", name: "Full Toolkit", description: "Volledig arsenaal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Ontbreekt slagen" },
          { score: 1, label: "Emerging", observable: "Bijna compleet" },
          { score: 2, label: "Achieved", observable: "Volledig arsenaal, alle slagen op niveau" },
        ]
      },
      { id: "G1_PRO_LEVEL", pillar: "TECHNIQUE", name: "Pro Level Execution", description: "Pro niveau uitvoering",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onder pro niveau" },
          { score: 1, label: "Emerging", observable: "Bijna pro niveau" },
          { score: 2, label: "Achieved", observable: "Pro niveau uitvoering" },
        ]
      },
      { id: "G1_INTERNATIONAL_TACTICS", pillar: "TACTICAL", name: "International Tactics", description: "Internationale tactieken",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Nationale tactieken" },
          { score: 1, label: "Emerging", observable: "Leert internationale stijl" },
          { score: 2, label: "Achieved", observable: "Internationale tactische volwassenheid" },
        ]
      },
      { id: "G1_ELITE_FITNESS", pillar: "PHYSICAL", name: "Elite Fitness", description: "Elite fitheid",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onder elite niveau" },
          { score: 1, label: "Emerging", observable: "Bijna elite niveau" },
          { score: 2, label: "Achieved", observable: "Elite fitheid voor internationale competitie" },
        ]
      },
      { id: "G1_CHAMPION_MENTAL", pillar: "MENTAL", name: "Champion Mentality", description: "Kampioen mentaliteit",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen kampioen mindset" },
          { score: 1, label: "Emerging", observable: "Groeit naar kampioen" },
          { score: 2, label: "Achieved", observable: "Kampioen mentaliteit" },
        ]
      },
      { id: "G1_AMBASSADOR_SPORT", pillar: "SOCIAL", name: "Sport Ambassador", description: "Ambassadeur van de sport",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen ambassadeur" },
          { score: 1, label: "Emerging", observable: "Lokaal ambassadeur" },
          { score: 2, label: "Achieved", observable: "Ambassadeur van de sport" },
        ]
      },
      { id: "G1_ITF_RESULTS", pillar: "MATCH", name: "ITF/College Results", description: "ITF/College resultaten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen internationale resultaten" },
          { score: 1, label: "Emerging", observable: "Eerste ITF/college wedstrijden" },
          { score: 2, label: "Achieved", observable: "Sterke ITF/college resultaten" },
        ]
      },
    ]
  },
};

export function getAdultGlowSkillsByPillar(levelId: string): Record<string, any[]> {
  const config = ADULT_GLOW_SKILLS_BY_LEVEL[levelId];
  if (!config) return {};
  
  const skillsByPillar: Record<string, any[]> = {};
  
  for (const skill of config.skills) {
    if (!skillsByPillar[skill.pillar]) {
      skillsByPillar[skill.pillar] = [];
    }
    skillsByPillar[skill.pillar].push({
      id: skill.id,
      name: skill.name,
      pillar: skill.pillar,
      stage: "GLOW",
      description: skill.description,
      targetScore: 2,
      weight: 1,
      isRequired: true,
      rubric: skill.rubric,
    });
  }
  
  return skillsByPillar;
}

export function getAdultLevelConfig(levelId: string): LevelSkillsConfig | null {
  return ADULT_GLOW_SKILLS_BY_LEVEL[levelId] || null;
}
