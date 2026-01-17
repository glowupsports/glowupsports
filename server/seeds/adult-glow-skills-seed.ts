/**
 * Adult Glow Rank Skills - Complete Skills per Level
 * 
 * Based on GLOW RANK COACH CHECKLIST — ADULT / PERFORMANCE TRACK
 * Glow 9 → Glow 1 (9 = Absolute Beginner, 1 = Elite/Semi-Pro)
 * 
 * PILLAR WEIGHTINGS SHIFT:
 * - Glow 9-8: Technique heavy (60% tech, 10% match)
 * - Glow 7: Balanced (35% tech, 25% tactical, 20% mental)
 * - Glow 6: Tactical/Mental focus (30% tech, 30% tactical, 25% mental)
 * - Glow 5-1: Match/Mental dominant (10-15% tech, 25-40% match, 25-30% mental)
 */

interface SkillRubric {
  score: number;
  label: string;
  observable: string;
}

interface GlowSkill {
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
  minTrainings?: number;
  minMatches?: number;
  winrateMin?: number;
  winrateMax?: number;
  coachConfirmation?: boolean;
  techniqueMinPercent?: number;
  matchDataRequired?: boolean;
  consistencyMonths?: number;
}

interface LevelSkillsConfig {
  levelId: string;
  rank: number;
  name: string;
  subtitle: string;
  abilitySnapshot: string;
  philosophy: string;
  pillarWeighting: PillarWeighting;
  promotionRequirements: PromotionRequirements;
  isDataDriven?: boolean;
  skills: GlowSkill[];
}

export const ADULT_GLOW_SKILLS_BY_LEVEL: Record<string, LevelSkillsConfig> = {
  "GLOW_9": {
    levelId: "GLOW_9",
    rank: 9,
    name: "Absolute Beginner",
    subtitle: "Tennis-Ready Check",
    abilitySnapshot: "Ik speel tennis, maar heb geen controle.",
    philosophy: "Doel: bepalen of speler überhaupt tennis-klaar is.",
    pillarWeighting: {
      technique: 60,
      tactical: 5,
      physical: 10,
      mental: 10,
      social: 10,
      match: 5,
    },
    promotionRequirements: {
      minTrainings: 3,
      techniqueMinPercent: 60,
      coachConfirmation: true,
    },
    skills: [
      // TECHNIQUE - FOREHAND
      { id: "G9_FH_GRIP", pillar: "TECHNIQUE", category: "Forehand", name: "Grip Knowledge", description: "Kent juiste grip (Eastern/Semi)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kent geen grip, houdt racket verkeerd" },
          { score: 1, label: "Emerging", observable: "Probeert Eastern grip te gebruiken" },
          { score: 2, label: "Achieved", observable: "Gebruikt consistente Eastern/Semi-Western grip" },
        ]
      },
      { id: "G9_FH_MOVING", pillar: "TECHNIQUE", category: "Forehand", name: "Moving Contact", description: "Kan bal raken zonder volledig stil te staan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moet stil staan om bal te raken" },
          { score: 1, label: "Emerging", observable: "Kan soms bewegen en raken" },
          { score: 2, label: "Achieved", observable: "Raakt bal terwijl in beweging" },
        ]
      },
      { id: "G9_FH_SWING", pillar: "TECHNIQUE", category: "Forehand", name: "Swing Path", description: "Swing bestaat uit backswing → contact → follow-through",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen herkenbare swing, alleen duwen" },
          { score: 1, label: "Emerging", observable: "Probeert backswing maar inconsistent" },
          { score: 2, label: "Achieved", observable: "Herkenbare swing met alle 3 fases" },
        ]
      },
      { id: "G9_FH_OVER_NET", pillar: "TECHNIQUE", category: "Forehand", name: "Over Net", description: "≥3 ballen over net (geen richting vereist)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan bal niet over net krijgen" },
          { score: 1, label: "Emerging", observable: "1-2 ballen over net" },
          { score: 2, label: "Achieved", observable: "3+ ballen achter elkaar over net" },
        ]
      },
      // TECHNIQUE - BACKHAND
      { id: "G9_BH_PREFERENCE", pillar: "TECHNIQUE", category: "Backhand", name: "Hand Preference", description: "Heeft voorkeur (1H / 2H)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen duidelijke voorkeur, wisselt steeds" },
          { score: 1, label: "Emerging", observable: "Begint voorkeur te tonen" },
          { score: 2, label: "Achieved", observable: "Duidelijke 1H of 2H voorkeur" },
        ]
      },
      { id: "G9_BH_STABLE", pillar: "TECHNIQUE", category: "Backhand", name: "Stable Contact", description: "Kan bal raken met beide handen / stabiel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Mist bal of volledig instabiel" },
          { score: 1, label: "Emerging", observable: "Raakt bal maar wankel" },
          { score: 2, label: "Achieved", observable: "Stabiel contact bij backhand" },
        ]
      },
      { id: "G9_BH_NO_PUSH", pillar: "TECHNIQUE", category: "Backhand", name: "Not Push-Only", description: "Geen volledig 'push-only' beweging",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Alleen duwen, geen swing" },
          { score: 1, label: "Emerging", observable: "Soms swing, soms duw" },
          { score: 2, label: "Achieved", observable: "Herkenbare swing beweging" },
        ]
      },
      // TECHNIQUE - SERVE
      { id: "G9_SV_TOSS", pillar: "TECHNIQUE", category: "Serve", name: "Ball Toss", description: "Kan bal omhoog gooien",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan geen goede toss maken" },
          { score: 1, label: "Emerging", observable: "Toss gaat omhoog maar ongecontroleerd" },
          { score: 2, label: "Achieved", observable: "Consistente toss voor lichaam" },
        ]
      },
      { id: "G9_SV_OVERHEAD", pillar: "TECHNIQUE", category: "Serve", name: "Overhead Concept", description: "Begrijpt bovenhands concept",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Alleen onderhands of slaat als forehand" },
          { score: 1, label: "Emerging", observable: "Probeert bovenhands" },
          { score: 2, label: "Achieved", observable: "Begrijpt en probeert overhead serve" },
        ]
      },
      { id: "G9_SV_MOTION", pillar: "TECHNIQUE", category: "Serve", name: "Service Motion", description: "Servicebeweging herkenbaar (ook al fout)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen herkenbare servicebeweging" },
          { score: 1, label: "Emerging", observable: "Probeert service beweging" },
          { score: 2, label: "Achieved", observable: "Herkenbare service beweging" },
        ]
      },
      // TECHNIQUE - ALGEMEEN
      { id: "G9_BOUNCE_HIT", pillar: "TECHNIQUE", category: "General", name: "Bounce Hit", description: "Kan bal stuit laten komen en raken",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Raakt bal voor of na stuit verkeerd" },
          { score: 1, label: "Emerging", observable: "Soms goede timing" },
          { score: 2, label: "Achieved", observable: "Consistent bal na stuit raken" },
        ]
      },
      { id: "G9_HAND_EYE", pillar: "TECHNIQUE", category: "General", name: "Hand-Eye Coordination", description: "Basis hand-oog coördinatie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Slechte hand-oog coördinatie" },
          { score: 1, label: "Emerging", observable: "Ontwikkelende coördinatie" },
          { score: 2, label: "Achieved", observable: "Goede basis coördinatie" },
        ]
      },
      // TACTICAL
      { id: "G9_TAC_OVER_NET", pillar: "TACTICAL", name: "Over Net = Good", description: "Begrijpt 'over het net = goed'",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen begrip van doel" },
          { score: 1, label: "Emerging", observable: "Begint te begrijpen" },
          { score: 2, label: "Achieved", observable: "Snapt dat bal over net moet" },
        ]
      },
      { id: "G9_TAC_TRAIN_VS_POINT", pillar: "TACTICAL", name: "Training vs Point", description: "Kent verschil training vs punt",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen verschil training/wedstrijd" },
          { score: 1, label: "Emerging", observable: "Begint onderscheid te maken" },
          { score: 2, label: "Achieved", observable: "Kent verschil en past gedrag aan" },
        ]
      },
      { id: "G9_TAC_RETURN", pillar: "TACTICAL", name: "Ball Must Return", description: "Begrijpt dat bal terug moet",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weet niet wat te doen met bal" },
          { score: 1, label: "Emerging", observable: "Probeert bal terug te slaan" },
          { score: 2, label: "Achieved", observable: "Actief bezig bal terug te krijgen" },
        ]
      },
      // PHYSICAL
      { id: "G9_PHY_LATERAL", pillar: "PHYSICAL", name: "Lateral Movement", description: "Kan zijwaarts bewegen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Beweegt alleen naar voren" },
          { score: 1, label: "Emerging", observable: "Kan zijwaarts maar traag" },
          { score: 2, label: "Achieved", observable: "Goede zijwaartse beweging" },
        ]
      },
      { id: "G9_PHY_BALANCE", pillar: "PHYSICAL", name: "Balance", description: "Basis balans bij slaan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Valt uit balans bij slaan" },
          { score: 1, label: "Emerging", observable: "Soms in balans" },
          { score: 2, label: "Achieved", observable: "Blijft in balans bij slagen" },
        ]
      },
      { id: "G9_PHY_20MIN", pillar: "PHYSICAL", name: "20 Min Training", description: "Kan 20 min actief trainen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moe na 10 minuten" },
          { score: 1, label: "Emerging", observable: "Kan 15 minuten volhouden" },
          { score: 2, label: "Achieved", observable: "Traint 20+ minuten actief" },
        ]
      },
      // MENTAL
      { id: "G9_MEN_RETRY", pillar: "MENTAL", name: "Retry After Error", description: "Probeert opnieuw na fout",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geeft op na fouten" },
          { score: 1, label: "Emerging", observable: "Soms gefrustreerd maar gaat door" },
          { score: 2, label: "Achieved", observable: "Probeert direct opnieuw na fout" },
        ]
      },
      { id: "G9_MEN_STAY", pillar: "MENTAL", name: "Stays On Court", description: "Blijft op baan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wil weg of stopt" },
          { score: 1, label: "Emerging", observable: "Blijft maar onwillig" },
          { score: 2, label: "Achieved", observable: "Blijft actief op de baan" },
        ]
      },
      { id: "G9_MEN_LISTEN", pillar: "MENTAL", name: "Listens to Instruction", description: "Luistert naar instructie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Negeert instructies" },
          { score: 1, label: "Emerging", observable: "Luistert soms" },
          { score: 2, label: "Achieved", observable: "Luistert aandachtig en probeert" },
        ]
      },
      // SOCIAL
      { id: "G9_SOC_COACH", pillar: "SOCIAL", name: "Respects Coach", description: "Respecteert coach",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onrespectful naar coach" },
          { score: 1, label: "Emerging", observable: "Meestal respectvol" },
          { score: 2, label: "Achieved", observable: "Altijd respectvol" },
        ]
      },
      { id: "G9_SOC_PLAYERS", pillar: "SOCIAL", name: "Respects Players", description: "Respecteert andere spelers",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Negatief naar andere spelers" },
          { score: 1, label: "Emerging", observable: "Meestal positief" },
          { score: 2, label: "Achieved", observable: "Respectvol naar iedereen" },
        ]
      },
      { id: "G9_SOC_RULES", pillar: "SOCIAL", name: "Follows Rules", description: "Volgt simpele regels",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Volgt regels niet" },
          { score: 1, label: "Emerging", observable: "Volgt met reminders" },
          { score: 2, label: "Achieved", observable: "Volgt regels zelfstandig" },
        ]
      },
      // MATCH
      { id: "G9_MAT_POINT", pillar: "MATCH", name: "Understands Point", description: "Begrijpt wat 'punt' is",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weet niet wat punt is" },
          { score: 1, label: "Emerging", observable: "Begint concept te snappen" },
          { score: 2, label: "Achieved", observable: "Begrijpt punten scoren" },
        ]
      },
      { id: "G9_MAT_SCORE", pillar: "MATCH", name: "Can Repeat Score", description: "Kan score herhalen na uitleg",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan score niet onthouden" },
          { score: 1, label: "Emerging", observable: "Onthoudt met hulp" },
          { score: 2, label: "Achieved", observable: "Kan score herhalen" },
        ]
      },
      { id: "G9_MAT_PRACTICE", pillar: "MATCH", name: "Practice Points", description: "Speelt oefenpunten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan geen punten spelen" },
          { score: 1, label: "Emerging", observable: "Probeert oefenpunten" },
          { score: 2, label: "Achieved", observable: "Speelt oefenpunten actief" },
        ]
      },
    ]
  },

  "GLOW_8": {
    levelId: "GLOW_8",
    rank: 8,
    name: "Beginner+",
    subtitle: "Foundation Builder",
    abilitySnapshot: "Ik kan rallyen, maar zonder stabiliteit.",
    philosophy: "De speler begrijpt tennis, maar beheerst zichzelf nog niet. Focus = controle, herhaalbaarheid, basisbeslissingen.",
    pillarWeighting: {
      technique: 50,
      tactical: 10,
      physical: 10,
      mental: 15,
      social: 10,
      match: 5,
    },
    promotionRequirements: {
      minMatches: 5,
      techniqueMinPercent: 70,
      coachConfirmation: true,
    },
    skills: [
      // TECHNIQUE - FOREHAND FUNDAMENT
      { id: "G8_FH_GRIP_CONSISTENT", pillar: "TECHNIQUE", category: "Forehand", name: "Consistent Grip", description: "Consistente grip (Eastern / Semi-Western)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wisselt grip constant" },
          { score: 1, label: "Emerging", observable: "Meestal juiste grip" },
          { score: 2, label: "Achieved", observable: "Consistente grip, kan benoemen" },
        ]
      },
      { id: "G8_FH_CONTACT", pillar: "TECHNIQUE", category: "Forehand", name: "Contact Point", description: "Contactpunt meestal vóór lichaam",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Slaat te laat, naast lichaam" },
          { score: 1, label: "Emerging", observable: "Soms goed contactpunt" },
          { score: 2, label: "Achieved", observable: "Contactpunt consequent voor lichaam" },
        ]
      },
      // TECHNIQUE - FOREHAND BEWEGING
      { id: "G8_FH_BACKSWING", pillar: "TECHNIQUE", category: "Forehand", name: "Backswing", description: "Backswing bestaat (niet alleen tikken)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen backswing, alleen tikken" },
          { score: 1, label: "Emerging", observable: "Kleine backswing" },
          { score: 2, label: "Achieved", observable: "Volledige backswing" },
        ]
      },
      { id: "G8_FH_FOLLOW", pillar: "TECHNIQUE", category: "Forehand", name: "Follow-Through", description: "Follow-through eindigt boven schouder",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Stopt beweging na contact" },
          { score: 1, label: "Emerging", observable: "Soms follow-through" },
          { score: 2, label: "Achieved", observable: "Follow-through boven schouder" },
        ]
      },
      { id: "G8_FH_WEIGHT", pillar: "TECHNIQUE", category: "Forehand", name: "Weight Transfer", description: "Gewicht verplaatst van achter → voor",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen gewichtsverplaatsing" },
          { score: 1, label: "Emerging", observable: "Soms gewicht naar voren" },
          { score: 2, label: "Achieved", observable: "Consistente gewichtsverplaatsing" },
        ]
      },
      // TECHNIQUE - FOREHAND CONTROLE
      { id: "G8_FH_RALLY_10", pillar: "TECHNIQUE", category: "Forehand", name: "10-Ball Rally", description: "10-ball rally crosscourt mogelijk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan geen 5 ballen houden" },
          { score: 1, label: "Emerging", observable: "5-8 ballen rally" },
          { score: 2, label: "Achieved", observable: "10+ ballen rally crosscourt" },
        ]
      },
      { id: "G8_FH_DEPTH", pillar: "TECHNIQUE", category: "Forehand", name: "Depth Control", description: "Bal gaat ≥60% diep (achter service lijn)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Meeste ballen kort" },
          { score: 1, label: "Emerging", observable: "40-60% diep" },
          { score: 2, label: "Achieved", observable: "60%+ ballen diep" },
        ]
      },
      { id: "G8_FH_SLOW", pillar: "TECHNIQUE", category: "Forehand", name: "Tempo Control", description: "Kan tempo verlagen zonder volledig fout te slaan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Alleen één snelheid" },
          { score: 1, label: "Emerging", observable: "Probeert langzamer" },
          { score: 2, label: "Achieved", observable: "Kan tempo bewust aanpassen" },
        ]
      },
      // TECHNIQUE - FOREHAND FOUTENPATROON
      { id: "G8_FH_ERROR_AWARE", pillar: "TECHNIQUE", category: "Forehand", name: "Error Awareness", description: "Weet waarom fout ging (net / lang / mishit)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weet niet waarom fout" },
          { score: 1, label: "Emerging", observable: "Soms correcte analyse" },
          { score: 2, label: "Achieved", observable: "Kan fouten analyseren" },
        ]
      },
      { id: "G8_FH_CORRECTION", pillar: "TECHNIQUE", category: "Forehand", name: "Correction Attempt", description: "Probeert correctie na feedback",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Past niets aan" },
          { score: 1, label: "Emerging", observable: "Probeert soms" },
          { score: 2, label: "Achieved", observable: "Past actief feedback toe" },
        ]
      },
      // TECHNIQUE - BACKHAND
      { id: "G8_BH_CHOICE", pillar: "TECHNIQUE", category: "Backhand", name: "Clear Choice", description: "Duidelijke voorkeur (1H / 2H)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wisselt steeds" },
          { score: 1, label: "Emerging", observable: "Voorkeur ontwikkelt" },
          { score: 2, label: "Achieved", observable: "Duidelijke 1H of 2H keuze" },
        ]
      },
      { id: "G8_BH_GRIP_STABLE", pillar: "TECHNIQUE", category: "Backhand", name: "Stable Grip", description: "Geen wisselende grips per slag",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wisselt grip constant" },
          { score: 1, label: "Emerging", observable: "Soms stabiel" },
          { score: 2, label: "Achieved", observable: "Consistente grip per slag" },
        ]
      },
      { id: "G8_BH_HANDS", pillar: "TECHNIQUE", category: "Backhand", name: "Active Hands", description: "Beide handen actief (bij 2H)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Eén hand doet al het werk" },
          { score: 1, label: "Emerging", observable: "Beide handen betrokken" },
          { score: 2, label: "Achieved", observable: "Beide handen actief samenwerken" },
        ]
      },
      { id: "G8_BH_ROTATION", pillar: "TECHNIQUE", category: "Backhand", name: "Shoulder Rotation", description: "Schouderrotatie zichtbaar",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen rotatie, alleen armen" },
          { score: 1, label: "Emerging", observable: "Soms rotatie" },
          { score: 2, label: "Achieved", observable: "Consistente schouderrotatie" },
        ]
      },
      { id: "G8_BH_FOLLOW", pillar: "TECHNIQUE", category: "Backhand", name: "BH Follow-Through", description: "Follow-through aanwezig",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen follow-through" },
          { score: 1, label: "Emerging", observable: "Korte follow-through" },
          { score: 2, label: "Achieved", observable: "Volledige follow-through" },
        ]
      },
      { id: "G8_BH_RALLY_8", pillar: "TECHNIQUE", category: "Backhand", name: "8-Ball Rally BH", description: "8+ ballen rally BH ↔ BH",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan geen 4 ballen BH rally" },
          { score: 1, label: "Emerging", observable: "4-7 ballen" },
          { score: 2, label: "Achieved", observable: "8+ ballen BH rally" },
        ]
      },
      { id: "G8_BH_CROSS", pillar: "TECHNIQUE", category: "Backhand", name: "Crosscourt BH", description: "Kan crosscourt spelen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Random richting" },
          { score: 1, label: "Emerging", observable: "Soms crosscourt" },
          { score: 2, label: "Achieved", observable: "Kan bewust crosscourt BH" },
        ]
      },
      { id: "G8_BH_HEIGHT", pillar: "TECHNIQUE", category: "Backhand", name: "Height Control", description: "Kan hoogte controleren (niet alleen flat)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Alleen flat of random" },
          { score: 1, label: "Emerging", observable: "Probeert hoogte" },
          { score: 2, label: "Achieved", observable: "Kan hoogte bewust variëren" },
        ]
      },
      // TECHNIQUE - SERVE
      { id: "G8_SV_OVERHEAD", pillar: "TECHNIQUE", category: "Serve", name: "Overhead Service", description: "Bovenhands service (geen onderhands fallback)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Valt terug op onderhands" },
          { score: 1, label: "Emerging", observable: "Meestal bovenhands" },
          { score: 2, label: "Achieved", observable: "Altijd bovenhands" },
        ]
      },
      { id: "G8_SV_TOSS_STABLE", pillar: "TECHNIQUE", category: "Serve", name: "Reproducible Toss", description: "Toss is reproduceerbaar (± zelfde plek)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Toss overal" },
          { score: 1, label: "Emerging", observable: "Soms consistent" },
          { score: 2, label: "Achieved", observable: "Reproduceerbare toss" },
        ]
      },
      { id: "G8_SV_SEQUENCE", pillar: "TECHNIQUE", category: "Serve", name: "Service Sequence", description: "Servicebeweging in volgorde: Toss → Trophy → Swing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen herkenbare volgorde" },
          { score: 1, label: "Emerging", observable: "Probeert sequentie" },
          { score: 2, label: "Achieved", observable: "Correcte Toss-Trophy-Swing volgorde" },
        ]
      },
      { id: "G8_SV_CONTACT_HIGH", pillar: "TECHNIQUE", category: "Serve", name: "High Contact", description: "Contact boven hoofd",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Slaat te laag" },
          { score: 1, label: "Emerging", observable: "Soms hoog contact" },
          { score: 2, label: "Achieved", observable: "Consistent hoog contactpunt" },
        ]
      },
      { id: "G8_SV_55_IN", pillar: "TECHNIQUE", category: "Serve", name: "55-60% First In", description: "≥55–60% eerste services in",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Minder dan 40% in" },
          { score: 1, label: "Emerging", observable: "40-55% in" },
          { score: 2, label: "Achieved", observable: "55-60%+ eerste service in" },
        ]
      },
      { id: "G8_SV_DF_CALM", pillar: "TECHNIQUE", category: "Serve", name: "DF No Panic", description: "Dubbele fout ≠ paniek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Paniek bij dubbele fout" },
          { score: 1, label: "Emerging", observable: "Soms gefrustreerd" },
          { score: 2, label: "Achieved", observable: "Blijft kalm bij DF" },
        ]
      },
      { id: "G8_SV_BOTH_SIDES", pillar: "TECHNIQUE", category: "Serve", name: "Both Sides Serve", description: "Kan van rechts en links serveren",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Alleen één kant" },
          { score: 1, label: "Emerging", observable: "Moeite met deuce/ad" },
          { score: 2, label: "Achieved", observable: "Comfortabel beide kanten" },
        ]
      },
      // TECHNIQUE - VOLLEY & NET
      { id: "G8_VOL_READY", pillar: "TECHNIQUE", category: "Volley", name: "Ready Position", description: "Basis ready position",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen ready position" },
          { score: 1, label: "Emerging", observable: "Soms in ready" },
          { score: 2, label: "Achieved", observable: "Goede ready position aan net" },
        ]
      },
      { id: "G8_VOL_NO_SWING", pillar: "TECHNIQUE", category: "Volley", name: "No Big Swing", description: "Geen grote swing aan net",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Swingt volleys" },
          { score: 1, label: "Emerging", observable: "Soms te veel swing" },
          { score: 2, label: "Achieved", observable: "Compact blokken" },
        ]
      },
      { id: "G8_VOL_BLOCK", pillar: "TECHNIQUE", category: "Volley", name: "Block Return", description: "Kan bal blokken terugspelen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Mist volleys" },
          { score: 1, label: "Emerging", observable: "Soms terug" },
          { score: 2, label: "Achieved", observable: "Blokkeert bal consistent terug" },
        ]
      },
      { id: "G8_VOL_FH_BH", pillar: "TECHNIQUE", category: "Volley", name: "FH/BH Volley", description: "Begrijpt verschil FH/BH volley",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen onderscheid" },
          { score: 1, label: "Emerging", observable: "Kent verschil" },
          { score: 2, label: "Achieved", observable: "Correct FH en BH volley" },
        ]
      },
      // TECHNIQUE - OVERHEAD
      { id: "G8_OH_RECOGNIZE", pillar: "TECHNIQUE", category: "Overhead", name: "Lob Recognition", description: "Herkent lob",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Ziet lob niet aankomen" },
          { score: 1, label: "Emerging", observable: "Herkent soms" },
          { score: 2, label: "Achieved", observable: "Herkent lob direct" },
        ]
      },
      { id: "G8_OH_SIDEWAYS", pillar: "TECHNIQUE", category: "Overhead", name: "Turn Sideways", description: "Draait zijwaarts",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Blijft frontaal staan" },
          { score: 1, label: "Emerging", observable: "Soms zijwaarts" },
          { score: 2, label: "Achieved", observable: "Draait zijwaarts voor smash" },
        ]
      },
      { id: "G8_OH_HIGH", pillar: "TECHNIQUE", category: "Overhead", name: "High Contact", description: "Raakt bal boven hoofd (geen paniek-slag)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Paniek, slaat te laag" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Consistent hoog contact" },
        ]
      },
      // TACTICAL
      { id: "G8_TAC_CROSS_SAFE", pillar: "TACTICAL", name: "Crosscourt = Safe", description: "Begrijpt crosscourt = veilig",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Speelt random" },
          { score: 1, label: "Emerging", observable: "Kent concept" },
          { score: 2, label: "Achieved", observable: "Gebruikt crosscourt bewust" },
        ]
      },
      { id: "G8_TAC_NOT_EVERY", pillar: "TACTICAL", name: "Doesn't Force Every Ball", description: "Probeert niet elke bal te winnen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Forceert alles" },
          { score: 1, label: "Emerging", observable: "Soms geduldig" },
          { score: 2, label: "Achieved", observable: "Speelt geduldig punt" },
        ]
      },
      { id: "G8_TAC_SHORT", pillar: "TACTICAL", name: "Short Ball Recognition", description: "Herkent korte bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Ziet korte bal niet" },
          { score: 1, label: "Emerging", observable: "Herkent soms" },
          { score: 2, label: "Achieved", observable: "Herkent en reageert op korte bal" },
        ]
      },
      { id: "G8_TAC_DIRECTION", pillar: "TACTICAL", name: "Direction Choice", description: "Probeert richting te kiezen (links/rechts)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen richtingskeuze" },
          { score: 1, label: "Emerging", observable: "Probeert" },
          { score: 2, label: "Achieved", observable: "Kiest bewust richting" },
        ]
      },
      { id: "G8_TAC_ATT_DEF", pillar: "TACTICAL", name: "Attack vs Defense", description: "Snapt verschil verdedigen vs aanvallen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen begrip" },
          { score: 1, label: "Emerging", observable: "Kent verschil conceptueel" },
          { score: 2, label: "Achieved", observable: "Begrijpt en probeert toe te passen" },
        ]
      },
      // PHYSICAL
      { id: "G8_PHY_SPLIT", pillar: "PHYSICAL", name: "Split Step", description: "Split step af en toe zichtbaar",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen split step" },
          { score: 1, label: "Emerging", observable: "Met reminder" },
          { score: 2, label: "Achieved", observable: "Af en toe automatisch" },
        ]
      },
      { id: "G8_PHY_LATERAL", pillar: "PHYSICAL", name: "Lateral Movement", description: "Kan zijwaarts bewegen zonder te kruisen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kruist voeten" },
          { score: 1, label: "Emerging", observable: "Soms correct" },
          { score: 2, label: "Achieved", observable: "Vloeiend zijwaarts" },
        ]
      },
      { id: "G8_PHY_BALANCE", pillar: "PHYSICAL", name: "Balance While Hitting", description: "Blijft in balans bij slagen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Valt uit balans" },
          { score: 1, label: "Emerging", observable: "Meestal in balans" },
          { score: 2, label: "Achieved", observable: "Consistent gebalanceerd" },
        ]
      },
      { id: "G8_PHY_45_60", pillar: "PHYSICAL", name: "45-60 Min Training", description: "Kan 45–60 min trainen zonder inzinking",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moe na 30 min" },
          { score: 1, label: "Emerging", observable: "30-45 min" },
          { score: 2, label: "Achieved", observable: "45-60 min doortrainen" },
        ]
      },
      { id: "G8_PHY_RECOVERY", pillar: "PHYSICAL", name: "Point Recovery", description: "Herstelt tussen punten (ademhaling)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen herstel" },
          { score: 1, label: "Emerging", observable: "Soms pauze nemen" },
          { score: 2, label: "Achieved", observable: "Bewust herstellen" },
        ]
      },
      // MENTAL
      { id: "G8_MEN_KEEP_TRY", pillar: "MENTAL", name: "Keeps Trying", description: "Blijft proberen na fout",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geeft op" },
          { score: 1, label: "Emerging", observable: "Soms gefrustreerd" },
          { score: 2, label: "Achieved", observable: "Blijft altijd proberen" },
        ]
      },
      { id: "G8_MEN_FEEDBACK", pillar: "MENTAL", name: "Accepts Correction", description: "Accepteert correctie van coach",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Negeert correctie" },
          { score: 1, label: "Emerging", observable: "Accepteert maar past niet toe" },
          { score: 2, label: "Achieved", observable: "Accepteert en probeert" },
        ]
      },
      { id: "G8_MEN_FOCUS_25", pillar: "MENTAL", name: "Focus 25-30 Min", description: "Focus ≥25–30 minuten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Focus < 15 min" },
          { score: 1, label: "Emerging", observable: "15-25 min" },
          { score: 2, label: "Achieved", observable: "25-30 min gefocust" },
        ]
      },
      { id: "G8_MEN_NO_EXTREME", pillar: "MENTAL", name: "No Extreme Reactions", description: "Reageert niet extreem op fouten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Extreme reacties" },
          { score: 1, label: "Emerging", observable: "Soms overdreven" },
          { score: 2, label: "Achieved", observable: "Beheerste reacties" },
        ]
      },
      { id: "G8_MEN_ERRORS_LEARN", pillar: "MENTAL", name: "Errors = Learning", description: "Begrijpt dat fouten onderdeel zijn van leren",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Ziet fouten als falen" },
          { score: 1, label: "Emerging", observable: "Begint te begrijpen" },
          { score: 2, label: "Achieved", observable: "Ziet fouten als leermomenten" },
        ]
      },
      // SOCIAL
      { id: "G8_SOC_POSITIVE", pillar: "SOCIAL", name: "Positive to Players", description: "Positief naar andere spelers",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Negatief gedrag" },
          { score: 1, label: "Emerging", observable: "Meestal positief" },
          { score: 2, label: "Achieved", observable: "Altijd positief" },
        ]
      },
      { id: "G8_SOC_DOUBLES", pillar: "SOCIAL", name: "Doubles Without Chaos", description: "Kan dubbel spelen zonder chaos",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Chaos in dubbel" },
          { score: 1, label: "Emerging", observable: "Soms georganiseerd" },
          { score: 2, label: "Achieved", observable: "Speelt dubbel geordend" },
        ]
      },
      { id: "G8_SOC_WAIT", pillar: "SOCIAL", name: "Waits Turn", description: "Wacht op beurt",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Dringt voor" },
          { score: 1, label: "Emerging", observable: "Meestal geduldig" },
          { score: 2, label: "Achieved", observable: "Wacht altijd op beurt" },
        ]
      },
      { id: "G8_SOC_LINES_SCORE", pillar: "SOCIAL", name: "Respects Lines/Score", description: "Respecteert lijnen, score, regels",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Discussieert over calls" },
          { score: 1, label: "Emerging", observable: "Meestal eerlijk" },
          { score: 2, label: "Achieved", observable: "Volledig eerlijk" },
        ]
      },
      { id: "G8_SOC_GROUP", pillar: "SOCIAL", name: "Group Manageable", description: "Coach kan groep sturen zonder conflict",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verstoort groep" },
          { score: 1, label: "Emerging", observable: "Soms lastig" },
          { score: 2, label: "Achieved", observable: "Coöperatief in groep" },
        ]
      },
      // MATCH
      { id: "G8_MAT_RULES", pillar: "MATCH", name: "Knows Rules", description: "Kent regels (dubbele fout, uit)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kent regels niet" },
          { score: 1, label: "Emerging", observable: "Basisregels met hulp" },
          { score: 2, label: "Achieved", observable: "Kent alle basisregels" },
        ]
      },
      { id: "G8_MAT_SCORE_KEEP", pillar: "MATCH", name: "Keeps Score", description: "Kan score bijhouden",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan score niet bijhouden" },
          { score: 1, label: "Emerging", observable: "Met hulp" },
          { score: 2, label: "Achieved", observable: "Houdt score zelfstandig bij" },
        ]
      },
      { id: "G8_MAT_FULL_GAMES", pillar: "MATCH", name: "Full Games", description: "Speelt volledige games",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Stopt halverwege" },
          { score: 1, label: "Emerging", observable: "Maakt games af met moeite" },
          { score: 2, label: "Achieved", observable: "Speelt games volledig uit" },
        ]
      },
      { id: "G8_MAT_BUILD", pillar: "MATCH", name: "Tries Point Building", description: "Probeert punt op te bouwen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen strategie" },
          { score: 1, label: "Emerging", observable: "Soms opbouw" },
          { score: 2, label: "Achieved", observable: "Probeert actief punt te bouwen" },
        ]
      },
      { id: "G8_MAT_PRACTICE", pillar: "MATCH", name: "Practice Match", description: "Speelt oefenwedstrijd zonder stoppen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Stopt steeds" },
          { score: 1, label: "Emerging", observable: "Soms onderbreken" },
          { score: 2, label: "Achieved", observable: "Speelt door zonder stoppen" },
        ]
      },
    ]
  },

  "GLOW_7": {
    levelId: "GLOW_7",
    rank: 7,
    name: "Intermediate",
    subtitle: "Control → Intent",
    abilitySnapshot: "Ik kan het uitvoeren. Nu leer ik kiezen wat ik doe.",
    philosophy: "De speler heeft controle, maar leert intentie. Minder toeval. Meer keuze. Minder chaos.",
    pillarWeighting: {
      technique: 35,
      tactical: 25,
      physical: 10,
      mental: 20,
      social: 5,
      match: 5,
    },
    promotionRequirements: {
      minMatches: 20,
      winrateMin: 40,
      winrateMax: 45,
      coachConfirmation: true,
    },
    skills: [
      // TECHNIQUE - FOREHAND STABILITEIT
      { id: "G7_FH_GRIP_STABLE", pillar: "TECHNIQUE", category: "Forehand", name: "Stable Grip Under Pressure", description: "Vaste grip (geen wisselen bij druk)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wisselt grip onder druk" },
          { score: 1, label: "Emerging", observable: "Meestal stabiel" },
          { score: 2, label: "Achieved", observable: "Grip altijd consistent" },
        ]
      },
      { id: "G7_FH_CONTACT_FRONT", pillar: "TECHNIQUE", category: "Forehand", name: "Consistent Contact", description: "Contactpunt consequent vóór lichaam",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wisselend contactpunt" },
          { score: 1, label: "Emerging", observable: "Meestal voor lichaam" },
          { score: 2, label: "Achieved", observable: "Altijd voor lichaam" },
        ]
      },
      { id: "G7_FH_TEMPO", pillar: "TECHNIQUE", category: "Forehand", name: "Controlled Tempo", description: "Swingtempo gecontroleerd (niet alleen hard)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Alleen hard slaan" },
          { score: 1, label: "Emerging", observable: "Probeert variatie" },
          { score: 2, label: "Achieved", observable: "Kan tempo bewust kiezen" },
        ]
      },
      // TECHNIQUE - FOREHAND RICHTING
      { id: "G7_FH_CROSS_DTL", pillar: "TECHNIQUE", category: "Forehand", name: "Cross & DTL", description: "Crosscourt én down-the-line mogelijk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Alleen één richting" },
          { score: 1, label: "Emerging", observable: "Probeert beide" },
          { score: 2, label: "Achieved", observable: "Kan beide richtingen" },
        ]
      },
      { id: "G7_FH_DIR_CHOICE", pillar: "TECHNIQUE", category: "Forehand", name: "Direction on Command", description: "Kan richting kiezen op opdracht",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Random richting" },
          { score: 1, label: "Emerging", observable: "Soms correct" },
          { score: 2, label: "Achieved", observable: "Kan op verzoek richting kiezen" },
        ]
      },
      { id: "G7_FH_70_ZONE", pillar: "TECHNIQUE", category: "Forehand", name: "70% Zone Accuracy", description: "≥70% ballen landt waar bedoeld (zone-based)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "< 50% in zone" },
          { score: 1, label: "Emerging", observable: "50-70% in zone" },
          { score: 2, label: "Achieved", observable: "70%+ in gewenste zone" },
        ]
      },
      // TECHNIQUE - FOREHAND SPIN & HOOGTE
      { id: "G7_FH_TOPSPIN", pillar: "TECHNIQUE", category: "Forehand", name: "Visible Topspin", description: "Topspin zichtbaar (net clearance)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Alleen flat" },
          { score: 1, label: "Emerging", observable: "Soms topspin" },
          { score: 2, label: "Achieved", observable: "Consistente topspin" },
        ]
      },
      { id: "G7_FH_HEIGHT", pillar: "TECHNIQUE", category: "Forehand", name: "Height Variation", description: "Kan bal hoger of lager slaan op verzoek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen hoogte controle" },
          { score: 1, label: "Emerging", observable: "Probeert variatie" },
          { score: 2, label: "Achieved", observable: "Kan hoogte bewust variëren" },
        ]
      },
      // TECHNIQUE - BACKHAND
      { id: "G7_BH_NOT_WEAK", pillar: "TECHNIQUE", category: "Backhand", name: "BH Not Weakness", description: "BH geen zwakke kant meer",
        rubric: [
          { score: 0, label: "Not Yet", observable: "BH duidelijk zwakker" },
          { score: 1, label: "Emerging", observable: "BH verbetert" },
          { score: 2, label: "Achieved", observable: "BH consistent met FH niveau" },
        ]
      },
      { id: "G7_BH_RALLY_12", pillar: "TECHNIQUE", category: "Backhand", name: "12-Ball BH Rally", description: "Rally BH↔BH ≥12 ballen mogelijk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "< 8 ballen" },
          { score: 1, label: "Emerging", observable: "8-12 ballen" },
          { score: 2, label: "Achieved", observable: "12+ ballen BH rally" },
        ]
      },
      { id: "G7_BH_CROSS_STABLE", pillar: "TECHNIQUE", category: "Backhand", name: "Stable Crosscourt", description: "Crosscourt stabiel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Inconsistent crosscourt" },
          { score: 1, label: "Emerging", observable: "Meestal crosscourt" },
          { score: 2, label: "Achieved", observable: "Stabiel crosscourt" },
        ]
      },
      { id: "G7_BH_DTL_TRY", pillar: "TECHNIQUE", category: "Backhand", name: "DTL Without Panic", description: "Down-the-line geprobeerd zonder paniek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Vermijdt DTL" },
          { score: 1, label: "Emerging", observable: "Probeert met spanning" },
          { score: 2, label: "Achieved", observable: "DTL zonder paniek" },
        ]
      },
      { id: "G7_BH_ROTATION", pillar: "TECHNIQUE", category: "Backhand", name: "Consistent Rotation", description: "Schouderrotatie consistent",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen rotatie" },
          { score: 1, label: "Emerging", observable: "Soms rotatie" },
          { score: 2, label: "Achieved", observable: "Altijd goede rotatie" },
        ]
      },
      { id: "G7_BH_FOLLOW", pillar: "TECHNIQUE", category: "Backhand", name: "Complete Follow-Through", description: "Follow-through compleet",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Korte afwerking" },
          { score: 1, label: "Emerging", observable: "Soms compleet" },
          { score: 2, label: "Achieved", observable: "Volledige follow-through" },
        ]
      },
      // TECHNIQUE - SERVE
      { id: "G7_SV_65", pillar: "TECHNIQUE", category: "Serve", name: "65% First In", description: "≥65% eerste service in",
        rubric: [
          { score: 0, label: "Not Yet", observable: "< 55%" },
          { score: 1, label: "Emerging", observable: "55-65%" },
          { score: 2, label: "Achieved", observable: "65%+ eerste service" },
        ]
      },
      { id: "G7_SV_DF_RARE", pillar: "TECHNIQUE", category: "Serve", name: "DF Rare in Games", description: "Dubbele fout zelden in games",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Regelmatig DF" },
          { score: 1, label: "Emerging", observable: "Af en toe DF" },
          { score: 2, label: "Achieved", observable: "DF zelden" },
        ]
      },
      { id: "G7_SV_TARGET", pillar: "TECHNIQUE", category: "Serve", name: "Left/Right Targeting", description: "Kan links/rechts targetten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Random plaatsing" },
          { score: 1, label: "Emerging", observable: "Probeert te richten" },
          { score: 2, label: "Achieved", observable: "Kan links/rechts kiezen" },
        ]
      },
      { id: "G7_SV_TEMPO", pillar: "TECHNIQUE", category: "Serve", name: "Tempo Adjustment", description: "Kan tempo aanpassen (veilig vs druk)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Alleen één snelheid" },
          { score: 1, label: "Emerging", observable: "Probeert variatie" },
          { score: 2, label: "Achieved", observable: "Kan bewust tempo wisselen" },
        ]
      },
      { id: "G7_SV_TOSS", pillar: "TECHNIQUE", category: "Serve", name: "Stable Toss", description: "Toss stabiel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wisselt toss" },
          { score: 1, label: "Emerging", observable: "Meestal consistent" },
          { score: 2, label: "Achieved", observable: "Stabiele reproduceerbare toss" },
        ]
      },
      { id: "G7_SV_RHYTHM", pillar: "TECHNIQUE", category: "Serve", name: "Recognizable Rhythm", description: "Ritme herkenbaar",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen ritme" },
          { score: 1, label: "Emerging", observable: "Soms vloeiend" },
          { score: 2, label: "Achieved", observable: "Herkenbaar persoonlijk ritme" },
        ]
      },
      // TECHNIQUE - RETURN
      { id: "G7_RET_READY", pillar: "TECHNIQUE", category: "Return", name: "Ready Position", description: "Ready position voor service",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen ready position" },
          { score: 1, label: "Emerging", observable: "Soms gereed" },
          { score: 2, label: "Achieved", observable: "Altijd ready voor return" },
        ]
      },
      { id: "G7_RET_NO_PANIC", pillar: "TECHNIQUE", category: "Return", name: "Return Without Panic", description: "Kan service terugbrengen zonder paniek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Paniek bij harde serve" },
          { score: 1, label: "Emerging", observable: "Soms kalm" },
          { score: 2, label: "Achieved", observable: "Kalm bij return" },
        ]
      },
      { id: "G7_RET_CROSS", pillar: "TECHNIQUE", category: "Return", name: "Cross Return", description: "Richt return bewust (crosscourt meestal)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Random return" },
          { score: 1, label: "Emerging", observable: "Probeert crosscourt" },
          { score: 2, label: "Achieved", observable: "Return crosscourt standaard" },
        ]
      },
      // TECHNIQUE - VOLLEY & TRANSITIE
      { id: "G7_VOL_BLOCK", pillar: "TECHNIQUE", category: "Volley", name: "Block Volley", description: "Volley met blok (geen swings)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Swingt volleys" },
          { score: 1, label: "Emerging", observable: "Soms compact" },
          { score: 2, label: "Achieved", observable: "Compact blokken" },
        ]
      },
      { id: "G7_VOL_APPROACH", pillar: "TECHNIQUE", category: "Volley", name: "Approach on Short Ball", description: "Beweegt door naar net na korte bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Blijft achter" },
          { score: 1, label: "Emerging", observable: "Soms naar voren" },
          { score: 2, label: "Achieved", observable: "Komt naar net bij korte bal" },
        ]
      },
      { id: "G7_VOL_PATTERN", pillar: "TECHNIQUE", category: "Volley", name: "Approach + Volley", description: "Begrijpt 'approach + volley'",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen transitie begrip" },
          { score: 1, label: "Emerging", observable: "Kent concept" },
          { score: 2, label: "Achieved", observable: "Voert approach + volley uit" },
        ]
      },
      // TECHNIQUE - OVERHEAD
      { id: "G7_OH_POSITION", pillar: "TECHNIQUE", category: "Overhead", name: "Positions Under Ball", description: "Positioneert onder bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Slechte positie" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Consistent onder bal" },
        ]
      },
      { id: "G7_OH_SCORE", pillar: "TECHNIQUE", category: "Overhead", name: "Scores in Training", description: "Kan overhead scoren in training",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Mist smashes" },
          { score: 1, label: "Emerging", observable: "Soms scorer" },
          { score: 2, label: "Achieved", observable: "Scoort consistent smash" },
        ]
      },
      { id: "G7_OH_CALM", pillar: "TECHNIQUE", category: "Overhead", name: "Less Panic", description: "Minder paniek bij hoge bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Paniek bij lob" },
          { score: 1, label: "Emerging", observable: "Soms kalm" },
          { score: 2, label: "Achieved", observable: "Kalm onder hoge bal" },
        ]
      },
      // TACTICAL
      { id: "G7_TAC_CROSS_PRESSURE", pillar: "TACTICAL", name: "Crosscourt Under Pressure", description: "Speelt crosscourt onder druk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Forceert DTL onder druk" },
          { score: 1, label: "Emerging", observable: "Meestal crosscourt" },
          { score: 2, label: "Achieved", observable: "Crosscourt consistent onder druk" },
        ]
      },
      { id: "G7_TAC_DTL_RIGHT", pillar: "TACTICAL", name: "DTL on Right Ball", description: "Gaat alleen DTL bij juiste bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "DTL op verkeerde bal" },
          { score: 1, label: "Emerging", observable: "Soms juiste keuze" },
          { score: 2, label: "Achieved", observable: "DTL alleen bij juiste bal" },
        ]
      },
      { id: "G7_TAC_SHORT_ATTACK", pillar: "TACTICAL", name: "Short Ball → Attack", description: "Herkent korte bal → aanval",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Ziet kans niet" },
          { score: 1, label: "Emerging", observable: "Herkent soms" },
          { score: 2, label: "Achieved", observable: "Herkent en valt aan" },
        ]
      },
      { id: "G7_TAC_DEEP_DEFEND", pillar: "TACTICAL", name: "Deep Ball → Defense", description: "Herkent diepe bal → verdediging",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Forceert bij diepe bal" },
          { score: 1, label: "Emerging", observable: "Soms juiste reactie" },
          { score: 2, label: "Achieved", observable: "Verdedigt correct bij diepe bal" },
        ]
      },
      { id: "G7_TAC_BUILD_34", pillar: "TACTICAL", name: "Build 3-4 Shots", description: "Probeert punt op te bouwen (3–4 slagen)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Forceert eerste bal" },
          { score: 1, label: "Emerging", observable: "Soms geduldig" },
          { score: 2, label: "Achieved", observable: "Bouwt punt op 3-4 slagen" },
        ]
      },
      // PHYSICAL
      { id: "G7_PHY_SPLIT_MOST", pillar: "PHYSICAL", name: "Split Step Most Shots", description: "Split step vóór meeste slagen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zelden split step" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Bij meeste slagen" },
        ]
      },
      { id: "G7_PHY_LATERAL_FLUID", pillar: "PHYSICAL", name: "Fluid Lateral", description: "Zijwaartse beweging vloeiend",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Houterig zijwaarts" },
          { score: 1, label: "Emerging", observable: "Soms vloeiend" },
          { score: 2, label: "Achieved", observable: "Vloeiend zijwaarts" },
        ]
      },
      { id: "G7_PHY_RECOVERY", pillar: "PHYSICAL", name: "Base Position Recovery", description: "Herstelt naar basispositie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Blijft staan na slag" },
          { score: 1, label: "Emerging", observable: "Soms terug" },
          { score: 2, label: "Achieved", observable: "Herstelt altijd naar midden" },
        ]
      },
      { id: "G7_PHY_60_75", pillar: "PHYSICAL", name: "60-75 Min Training", description: "Kan 60–75 min trainen op niveau",
        rubric: [
          { score: 0, label: "Not Yet", observable: "< 45 min" },
          { score: 1, label: "Emerging", observable: "45-60 min" },
          { score: 2, label: "Achieved", observable: "60-75 min volhouden" },
        ]
      },
      { id: "G7_PHY_FATIGUE_TECH", pillar: "PHYSICAL", name: "Technique Under Fatigue", description: "Vermoeidheid beïnvloedt techniek niet direct",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Techniek zakt bij vermoeidheid" },
          { score: 1, label: "Emerging", observable: "Soms impact" },
          { score: 2, label: "Achieved", observable: "Techniek blijft stabiel" },
        ]
      },
      // MENTAL
      { id: "G7_MEN_RESET_1", pillar: "MENTAL", name: "Reset in 1 Point", description: "Kan fouten resetten binnen 1 punt",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Meerdere punten last" },
          { score: 1, label: "Emerging", observable: "2-3 punten" },
          { score: 2, label: "Achieved", observable: "Reset binnen 1 punt" },
        ]
      },
      { id: "G7_MEN_NO_MELTDOWN", pillar: "MENTAL", name: "No Emotional Meltdown", description: "Geen emotionele meltdown",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Heeft meltdowns" },
          { score: 1, label: "Emerging", observable: "Zelden" },
          { score: 2, label: "Achieved", observable: "Geen meltdowns" },
        ]
      },
      { id: "G7_MEN_TASK", pillar: "MENTAL", name: "Task-Focused in Rally", description: "Blijft taakgericht tijdens rally",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest focus in rally" },
          { score: 1, label: "Emerging", observable: "Soms gefocust" },
          { score: 2, label: "Achieved", observable: "Taakgericht blijven" },
        ]
      },
      { id: "G7_MEN_TACTIC_AFTER_ERROR", pillar: "MENTAL", name: "Tactics After Error", description: "Volgt tactische opdracht ook na fout",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verlaat plan na fout" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Blijft bij tactiek" },
        ]
      },
      { id: "G7_MEN_TRAIN_VS_MATCH", pillar: "MENTAL", name: "Training vs Match Mindset", description: "Begrijpt verschil 'trainen' vs 'wedstrijd'",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zelfde aanpak" },
          { score: 1, label: "Emerging", observable: "Begint verschil te zien" },
          { score: 2, label: "Achieved", observable: "Past mentaliteit aan" },
        ]
      },
      // SOCIAL
      { id: "G7_SOC_COOP_GROUP", pillar: "SOCIAL", name: "Cooperative in Group", description: "Coöperatief in groep",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moeilijk in groep" },
          { score: 1, label: "Emerging", observable: "Meestal coöperatief" },
          { score: 2, label: "Achieved", observable: "Altijd coöperatief" },
        ]
      },
      { id: "G7_SOC_SPAR_NO_EGO", pillar: "SOCIAL", name: "Spar Without Ego", description: "Kan sparren zonder ego",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Ego probleem bij sparren" },
          { score: 1, label: "Emerging", observable: "Soms ego" },
          { score: 2, label: "Achieved", observable: "Sparren zonder ego" },
        ]
      },
      { id: "G7_SOC_RESPECT_OPP", pillar: "SOCIAL", name: "Respects Opponent", description: "Respecteert tegenstander",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen respect" },
          { score: 1, label: "Emerging", observable: "Meestal respectvol" },
          { score: 2, label: "Achieved", observable: "Altijd respect" },
        ]
      },
      { id: "G7_SOC_DOUBLES_STRUCT", pillar: "SOCIAL", name: "Doubles with Structure", description: "Kan dubbel spelen met structuur",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Chaos in dubbel" },
          { score: 1, label: "Emerging", observable: "Soms gestructureerd" },
          { score: 2, label: "Achieved", observable: "Gestructureerd dubbel" },
        ]
      },
      { id: "G7_SOC_RESPONSIBILITY", pillar: "SOCIAL", name: "Takes Responsibility", description: "Neemt verantwoordelijkheid (ballen, score)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Neemt geen verantwoordelijkheid" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Neemt altijd verantwoordelijkheid" },
        ]
      },
      // MATCH
      { id: "G7_MAT_SETS", pillar: "MATCH", name: "Plays Full Sets", description: "Speelt volledige sets (short sets ok)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan geen set afmaken" },
          { score: 1, label: "Emerging", observable: "Met moeite" },
          { score: 2, label: "Achieved", observable: "Speelt volledige sets" },
        ]
      },
      { id: "G7_MAT_SCORE_SELF", pillar: "MATCH", name: "Keeps Score Self", description: "Houdt score zelfstandig bij",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Hulp nodig" },
          { score: 1, label: "Emerging", observable: "Soms verward" },
          { score: 2, label: "Achieved", observable: "Zelfstandig score bijhouden" },
        ]
      },
      { id: "G7_MAT_TACTICAL", pillar: "MATCH", name: "Plays Tactically", description: "Speelt games tactisch (niet random)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Random tennis" },
          { score: 1, label: "Emerging", observable: "Soms tactisch" },
          { score: 2, label: "Achieved", observable: "Tactisch spelen" },
        ]
      },
      { id: "G7_MAT_PATTERN", pillar: "MATCH", name: "Tries Pattern", description: "Probeert patroon (bv. FH cross → open court)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen patronen" },
          { score: 1, label: "Emerging", observable: "Probeert soms" },
          { score: 2, label: "Achieved", observable: "Gebruikt patronen actief" },
        ]
      },
      { id: "G7_MAT_ACCEPT_LOSS", pillar: "MATCH", name: "Accepts Loss", description: "Accepteert verlies zonder gedrag",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Slecht verliezend" },
          { score: 1, label: "Emerging", observable: "Soms moeilijk" },
          { score: 2, label: "Achieved", observable: "Accepteert verlies sportief" },
        ]
      },
    ]
  },

  "GLOW_6": {
    levelId: "GLOW_6",
    rank: 6,
    name: "Competitive",
    subtitle: "Structure → Pressure",
    abilitySnapshot: "Ik weet wat ik wil doen en probeer het consequent. Ik blijf functioneren onder druk.",
    philosophy: "De speler weet wat hij wil doen, probeert het consequent, blijft functioneren onder druk. Hier ontstaat echte match-identiteit.",
    pillarWeighting: {
      technique: 30,
      tactical: 30,
      physical: 5,
      mental: 25,
      social: 5,
      match: 5,
    },
    promotionRequirements: {
      minMatches: 25,
      winrateMin: 50,
      coachConfirmation: true,
    },
    skills: [
      // TECHNIQUE - FOREHAND BETROUWBAARHEID
      { id: "G6_FH_STABLE_TEMPO", pillar: "TECHNIQUE", category: "Forehand", name: "Stable Under Tempo", description: "FH blijft stabiel bij tempoverhoging",
        rubric: [
          { score: 0, label: "Not Yet", observable: "FH instort bij tempo" },
          { score: 1, label: "Emerging", observable: "Soms stabiel" },
          { score: 2, label: "Achieved", observable: "FH blijft stabiel bij hoog tempo" },
        ]
      },
      { id: "G6_FH_NO_COLLAPSE", pillar: "TECHNIQUE", category: "Forehand", name: "No Technique Collapse", description: "Geen techniek-instorting bij fouten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Techniek zakt na fouten" },
          { score: 1, label: "Emerging", observable: "Soms herstel" },
          { score: 2, label: "Achieved", observable: "Techniek blijft constant" },
        ]
      },
      { id: "G6_FH_75_80", pillar: "TECHNIQUE", category: "Forehand", name: "75-80% Rally Safe", description: "≥75–80% rallyballen veilig",
        rubric: [
          { score: 0, label: "Not Yet", observable: "< 70% veilig" },
          { score: 1, label: "Emerging", observable: "70-75%" },
          { score: 2, label: "Achieved", observable: "75-80%+ veilig" },
        ]
      },
      // TECHNIQUE - FOREHAND VARIATIE
      { id: "G6_FH_TEMPO_VAR", pillar: "TECHNIQUE", category: "Forehand", name: "Tempo Variation", description: "Kan tempo wisselen (veilig ↔ druk)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Alleen één tempo" },
          { score: 1, label: "Emerging", observable: "Probeert variatie" },
          { score: 2, label: "Achieved", observable: "Wisselt tempo bewust" },
        ]
      },
      { id: "G6_FH_HEIGHT_TAC", pillar: "TECHNIQUE", category: "Forehand", name: "Tactical Height", description: "Kan hoogte aanpassen tactisch",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen hoogte variatie" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Hoogte tactisch ingezet" },
        ]
      },
      { id: "G6_FH_INSIDE_OUT", pillar: "TECHNIQUE", category: "Forehand", name: "Inside-Out", description: "Kan inside-out herkennen & gebruiken",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kent inside-out niet" },
          { score: 1, label: "Emerging", observable: "Probeert" },
          { score: 2, label: "Achieved", observable: "Gebruikt inside-out effectief" },
        ]
      },
      // TECHNIQUE - BACKHAND
      { id: "G6_BH_USED", pillar: "TECHNIQUE", category: "Backhand", name: "BH Used Actively", description: "BH wordt ingezet, niet verstopt",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Loopt om BH heen" },
          { score: 1, label: "Emerging", observable: "Soms BH gebruiken" },
          { score: 2, label: "Achieved", observable: "BH actief ingezet" },
        ]
      },
      { id: "G6_BH_RALLY_15", pillar: "TECHNIQUE", category: "Backhand", name: "15-Ball BH Rally", description: "Rally BH↔BH ≥15 ballen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "< 10 ballen" },
          { score: 1, label: "Emerging", observable: "10-15 ballen" },
          { score: 2, label: "Achieved", observable: "15+ ballen BH rally" },
        ]
      },
      { id: "G6_BH_BUILD", pillar: "TECHNIQUE", category: "Backhand", name: "Build Point with BH", description: "Kan BH gebruiken om punt op te bouwen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "BH alleen verdedigend" },
          { score: 1, label: "Emerging", observable: "Soms opbouw" },
          { score: 2, label: "Achieved", observable: "BH in puntopbouw" },
        ]
      },
      { id: "G6_BH_CROSS_RELIABLE", pillar: "TECHNIQUE", category: "Backhand", name: "Reliable Crosscourt", description: "Crosscourt betrouwbaar",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Inconsistent crosscourt" },
          { score: 1, label: "Emerging", observable: "Meestal goed" },
          { score: 2, label: "Achieved", observable: "Betrouwbaar crosscourt" },
        ]
      },
      { id: "G6_BH_DTL_SELECT", pillar: "TECHNIQUE", category: "Backhand", name: "Selective DTL", description: "DTL selectief & bewust",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Random DTL" },
          { score: 1, label: "Emerging", observable: "Soms bewust" },
          { score: 2, label: "Achieved", observable: "DTL selectief gebruikt" },
        ]
      },
      // TECHNIQUE - SERVE
      { id: "G6_SV_70", pillar: "TECHNIQUE", category: "Serve", name: "70% First In", description: "≥70% eerste service",
        rubric: [
          { score: 0, label: "Not Yet", observable: "< 65%" },
          { score: 1, label: "Emerging", observable: "65-70%" },
          { score: 2, label: "Achieved", observable: "70%+ eerste service" },
        ]
      },
      { id: "G6_SV_2ND_RELIABLE", pillar: "TECHNIQUE", category: "Serve", name: "Reliable Second", description: "Tweede service betrouwbaar (veilig spin)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onbetrouwbare 2nd" },
          { score: 1, label: "Emerging", observable: "Soms stabiel" },
          { score: 2, label: "Achieved", observable: "Betrouwbare 2nd serve" },
        ]
      },
      { id: "G6_SV_DF_LOW", pillar: "TECHNIQUE", category: "Serve", name: "Low DF Rate", description: "Minder dan 1 DF per game gemiddeld",
        rubric: [
          { score: 0, label: "Not Yet", observable: "> 2 DF per game" },
          { score: 1, label: "Emerging", observable: "1-2 DF per game" },
          { score: 2, label: "Achieved", observable: "< 1 DF per game" },
        ]
      },
      { id: "G6_SV_PLUS1", pillar: "TECHNIQUE", category: "Serve", name: "Serve +1 Aware", description: "Serve +1 bewust (volgende bal)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen +1 gedachte" },
          { score: 1, label: "Emerging", observable: "Soms +1 denken" },
          { score: 2, label: "Achieved", observable: "Serve +1 standaard" },
        ]
      },
      { id: "G6_SV_TARGET_WEAK", pillar: "TECHNIQUE", category: "Serve", name: "Target Weakness", description: "Richt serve op zwakke kant tegenstander",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Random richting" },
          { score: 1, label: "Emerging", observable: "Soms gericht" },
          { score: 2, label: "Achieved", observable: "Target zwakke kant" },
        ]
      },
      // TECHNIQUE - RETURN
      { id: "G6_RET_CONSISTENT", pillar: "TECHNIQUE", category: "Return", name: "Consistent Return", description: "Return consistent in spel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Veel return fouten" },
          { score: 1, label: "Emerging", observable: "Soms stabiel" },
          { score: 2, label: "Achieved", observable: "Consistent in spel" },
        ]
      },
      { id: "G6_RET_PRESSURE", pillar: "TECHNIQUE", category: "Return", name: "Pressure Return", description: "Kan druk terugleggen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Alleen defensief return" },
          { score: 1, label: "Emerging", observable: "Soms druk" },
          { score: 2, label: "Achieved", observable: "Legt druk terug" },
        ]
      },
      { id: "G6_RET_NO_FREE", pillar: "TECHNIQUE", category: "Return", name: "No Free Points", description: "Geen 'gratis punten' weggeven",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Veel gratis punten" },
          { score: 1, label: "Emerging", observable: "Soms gratis" },
          { score: 2, label: "Achieved", observable: "Geen gratis punten" },
        ]
      },
      // TECHNIQUE - NET/TRANSITIE
      { id: "G6_NET_INTENT", pillar: "TECHNIQUE", category: "Net", name: "Net with Intent", description: "Komt naar net met intentie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Random naar net" },
          { score: 1, label: "Emerging", observable: "Soms bewust" },
          { score: 2, label: "Achieved", observable: "Altijd met intentie naar net" },
        ]
      },
      { id: "G6_VOL_CONTROL", pillar: "TECHNIQUE", category: "Net", name: "Controlled Volley", description: "Volley gecontroleerd, geen paniek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Paniek volleys" },
          { score: 1, label: "Emerging", observable: "Soms gecontroleerd" },
          { score: 2, label: "Achieved", observable: "Gecontroleerde volleys" },
        ]
      },
      { id: "G6_FINISH_NET", pillar: "TECHNIQUE", category: "Net", name: "Finish at Net", description: "Kan punt afronden aan net",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Mist kansen aan net" },
          { score: 1, label: "Emerging", observable: "Soms afronden" },
          { score: 2, label: "Achieved", observable: "Rondt af aan net" },
        ]
      },
      // TECHNIQUE - DEFENSIEF
      { id: "G6_LOB_PRESSURE", pillar: "TECHNIQUE", category: "Defense", name: "Lob Under Pressure", description: "Kan lobben onder druk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan niet lobben" },
          { score: 1, label: "Emerging", observable: "Soms effectief" },
          { score: 2, label: "Achieved", observable: "Effectieve lob onder druk" },
        ]
      },
      { id: "G6_STAY_IN", pillar: "TECHNIQUE", category: "Defense", name: "Stay in Point", description: "Kan bal terugbrengen i.p.v. forceren",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Forceert altijd" },
          { score: 1, label: "Emerging", observable: "Soms geduldig" },
          { score: 2, label: "Achieved", observable: "Blijft in punt" },
        ]
      },
      { id: "G6_STAY_CONCEPT", pillar: "TECHNIQUE", category: "Defense", name: "Understands 'Stay in Point'", description: "Begrijpt 'stay in the point'",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen begrip" },
          { score: 1, label: "Emerging", observable: "Kent concept" },
          { score: 2, label: "Achieved", observable: "Past actief toe" },
        ]
      },
      // TACTICAL
      { id: "G6_TAC_PATTERNS", pillar: "TACTICAL", name: "Recognizes Patterns", description: "Herkent patronen van tegenstander",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Ziet patronen niet" },
          { score: 1, label: "Emerging", observable: "Soms herkenning" },
          { score: 2, label: "Achieved", observable: "Herkent patronen actief" },
        ]
      },
      { id: "G6_TAC_PLAN", pillar: "TACTICAL", name: "Plays with Plan", description: "Speelt punten volgens plan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen plan" },
          { score: 1, label: "Emerging", observable: "Soms plan" },
          { score: 2, label: "Achieved", observable: "Speelt met plan" },
        ]
      },
      { id: "G6_TAC_ADAPT_SET", pillar: "TACTICAL", name: "Adapts Within Set", description: "Past tactiek aan binnen set",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen aanpassing" },
          { score: 1, label: "Emerging", observable: "Soms aanpassen" },
          { score: 2, label: "Achieved", observable: "Past tactiek aan" },
        ]
      },
      { id: "G6_TAC_HIGH_PCT", pillar: "TACTICAL", name: "High Percentage Tennis", description: "Speelt hoog percentage tennis",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Veel risico slagen" },
          { score: 1, label: "Emerging", observable: "Soms verstandig" },
          { score: 2, label: "Achieved", observable: "Hoog percentage spel" },
        ]
      },
      { id: "G6_TAC_LOW_PCT_AVOID", pillar: "TACTICAL", name: "Avoids Low % at Crucial", description: "Vermijdt low-percentage slagen op cruciale momenten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Risico op cruciale momenten" },
          { score: 1, label: "Emerging", observable: "Soms te risicovol" },
          { score: 2, label: "Achieved", observable: "Vermijdt risico op cruciale momenten" },
        ]
      },
      // PHYSICAL
      { id: "G6_PHY_90MIN", pillar: "PHYSICAL", name: "90 Min Competitive", description: "Kan ≥90 min competitief spelen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "< 60 min" },
          { score: 1, label: "Emerging", observable: "60-90 min" },
          { score: 2, label: "Achieved", observable: "90+ min competitief" },
        ]
      },
      { id: "G6_PHY_SPLIT_CONSISTENT", pillar: "PHYSICAL", name: "Consistent Split Step", description: "Split step consistent",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Inconsistent" },
          { score: 1, label: "Emerging", observable: "Meestal" },
          { score: 2, label: "Achieved", observable: "Altijd split step" },
        ]
      },
      { id: "G6_PHY_RECOVERY_POS", pillar: "PHYSICAL", name: "Recovery Position", description: "Herstelpositie na elke slag",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Blijft staan" },
          { score: 1, label: "Emerging", observable: "Meestal terug" },
          { score: 2, label: "Achieved", observable: "Altijd herstel naar positie" },
        ]
      },
      { id: "G6_PHY_SPEED_MANAGE", pillar: "PHYSICAL", name: "Speed Managed", description: "Snelheidsverlies zichtbaar maar beheerst",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Groot snelheidsverlies" },
          { score: 1, label: "Emerging", observable: "Merkbaar maar ok" },
          { score: 2, label: "Achieved", observable: "Beheerst tempo-management" },
        ]
      },
      { id: "G6_PHY_INJURY_AWARE", pillar: "PHYSICAL", name: "Injury Aware", description: "Blessurebewust bewegen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen bewustzijn" },
          { score: 1, label: "Emerging", observable: "Soms voorzichtig" },
          { score: 2, label: "Achieved", observable: "Blessurebewust bewegen" },
        ]
      },
      // MENTAL
      { id: "G6_MEN_MULTI_ERROR", pillar: "MENTAL", name: "Handles Multiple Errors", description: "Kan meerdere fouten achter elkaar verdragen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Breekt na 2-3 fouten" },
          { score: 1, label: "Emerging", observable: "Soms stabiel" },
          { score: 2, label: "Achieved", observable: "Blijft stabiel na fouten" },
        ]
      },
      { id: "G6_MEN_TAC_BEHIND", pillar: "MENTAL", name: "Tactical When Behind", description: "Blijft tactisch spelen bij achterstand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Paniek bij achterstand" },
          { score: 1, label: "Emerging", observable: "Soms tactisch" },
          { score: 2, label: "Achieved", observable: "Blijft tactisch bij achterstand" },
        ]
      },
      { id: "G6_MEN_EMOTIONS", pillar: "MENTAL", name: "Emotions Controlled", description: "Emoties onder controle (geen drama)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Drama reacties" },
          { score: 1, label: "Emerging", observable: "Soms emotioneel" },
          { score: 2, label: "Achieved", observable: "Emoties onder controle" },
        ]
      },
      { id: "G6_MEN_SCORE_AWARE", pillar: "MENTAL", name: "Score Situational Awareness", description: "Begrijpt score-situaties (30–30, BP, etc.)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Speelt elke punt gelijk" },
          { score: 1, label: "Emerging", observable: "Soms bewust" },
          { score: 2, label: "Achieved", observable: "Begrijpt cruciale momenten" },
        ]
      },
      { id: "G6_MEN_GRIND", pillar: "MENTAL", name: "Accepts Grind Points", description: "Accepteert grind-points",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wil snel winnen" },
          { score: 1, label: "Emerging", observable: "Soms geduldig" },
          { score: 2, label: "Achieved", observable: "Accepteert lange rally's" },
        ]
      },
      // SOCIAL
      { id: "G6_SOC_FAIR_PRESSURE", pillar: "SOCIAL", name: "Fair Play Under Pressure", description: "Fair play onder druk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Cheating bij druk" },
          { score: 1, label: "Emerging", observable: "Meestal eerlijk" },
          { score: 2, label: "Achieved", observable: "Altijd fair play" },
        ]
      },
      { id: "G6_SOC_CALLS", pillar: "SOCIAL", name: "Accepts Calls", description: "Accepteert calls & beslissingen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Discussieert" },
          { score: 1, label: "Emerging", observable: "Soms moeilijk" },
          { score: 2, label: "Achieved", observable: "Accepteert calls" },
        ]
      },
      { id: "G6_SOC_RESPECT_OPP", pillar: "SOCIAL", name: "Respect for Opponent", description: "Respect voor tegenstander",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen respect" },
          { score: 1, label: "Emerging", observable: "Meestal respectvol" },
          { score: 2, label: "Achieved", observable: "Altijd respectvol" },
        ]
      },
      { id: "G6_SOC_TEAM_COMP", pillar: "SOCIAL", name: "Team Feeling in Competition", description: "Teamgevoel in competitie (club/academy)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Individualistisch" },
          { score: 1, label: "Emerging", observable: "Soms teamgericht" },
          { score: 2, label: "Achieved", observable: "Sterk teamgevoel" },
        ]
      },
      { id: "G6_SOC_DOUBLES_ROLE", pillar: "SOCIAL", name: "Doubles with Roles", description: "Kan dubbel spelen met rolverdeling",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen rollen" },
          { score: 1, label: "Emerging", observable: "Soms rollen" },
          { score: 2, label: "Achieved", observable: "Duidelijke rolverdeling" },
        ]
      },
      // MATCH
      { id: "G6_MAT_SETS_STRUCT", pillar: "MATCH", name: "Full Sets with Structure", description: "Speelt volledige sets met structuur",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen structuur" },
          { score: 1, label: "Emerging", observable: "Soms gestructureerd" },
          { score: 2, label: "Achieved", observable: "Volledige sets met structuur" },
        ]
      },
      { id: "G6_MAT_SCORE_PERFECT", pillar: "MATCH", name: "Flawless Score Keeping", description: "Houdt score foutloos bij",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Fouten in score" },
          { score: 1, label: "Emerging", observable: "Soms vergissen" },
          { score: 2, label: "Achieved", observable: "Foutloos score" },
        ]
      },
      { id: "G6_MAT_MOMENTUM", pillar: "MATCH", name: "Recognizes Momentum", description: "Kan momentum herkennen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Ziet momentum niet" },
          { score: 1, label: "Emerging", observable: "Soms herkenning" },
          { score: 2, label: "Achieved", observable: "Herkent momentum shifts" },
        ]
      },
      { id: "G6_MAT_CLOSE_GAMES", pillar: "MATCH", name: "Closes Games", description: "Sluit games bewust af",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest games" },
          { score: 1, label: "Emerging", observable: "Soms goed sluiten" },
          { score: 2, label: "Achieved", observable: "Sluit games bewust af" },
        ]
      },
      { id: "G6_MAT_ANALYZE", pillar: "MATCH", name: "Post-Match Analysis", description: "Analyseert match achteraf (wat werkte?)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen analyse" },
          { score: 1, label: "Emerging", observable: "Soms nadenken" },
          { score: 2, label: "Achieved", observable: "Analyseert wat werkte" },
        ]
      },
    ]
  },

  "GLOW_5": {
    levelId: "GLOW_5",
    rank: 5,
    name: "Performance",
    subtitle: "Results → Consistency",
    abilitySnapshot: "Ik win niet alleen goed — ik win structureel en kan mijn spel herhalen.",
    philosophy: "De speler speelt niet alleen goed, haalt resultaat, kan zijn spel herhalen tegen verschillende tegenstanders. Rankings beginnen te kloppen.",
    pillarWeighting: {
      technique: 15,
      tactical: 25,
      physical: 5,
      mental: 25,
      social: 0,
      match: 30,
    },
    promotionRequirements: {
      minMatches: 10,
      matchDataRequired: true,
      consistencyMonths: 3,
      coachConfirmation: true,
    },
    isDataDriven: true,
    skills: [
      // From Glow 5 onwards - data + match history + behavior driven
      // Fewer checkbox skills, more outcome-based criteria
      { id: "G5_TECH_FH_WEAPON", pillar: "TECHNIQUE", name: "FH is Primary Weapon", description: "FH is primaire wapen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "FH is niet wapen" },
          { score: 1, label: "Emerging", observable: "FH soms domineren" },
          { score: 2, label: "Achieved", observable: "FH is duidelijk primair wapen" },
        ]
      },
      { id: "G5_TECH_CONSISTENCY", pillar: "TECHNIQUE", name: "Rally Consistency 80-85%", description: "≥80–85% rally consistency",
        rubric: [
          { score: 0, label: "Not Yet", observable: "< 75% consistent" },
          { score: 1, label: "Emerging", observable: "75-80%" },
          { score: 2, label: "Achieved", observable: "80-85%+ consistent" },
        ]
      },
      { id: "G5_TECH_NO_WEAK", pillar: "TECHNIQUE", name: "No Clear Weakness", description: "Geen duidelijke 'zwakke kant' meer",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Duidelijke zwakte" },
          { score: 1, label: "Emerging", observable: "Kleine zwakte" },
          { score: 2, label: "Achieved", observable: "Geen duidelijke zwakte" },
        ]
      },
      { id: "G5_TAC_GAME_PLAN", pillar: "TACTICAL", name: "Clear Game Plan", description: "Speelt met duidelijk wedstrijdplan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen plan" },
          { score: 1, label: "Emerging", observable: "Vaag plan" },
          { score: 2, label: "Achieved", observable: "Duidelijk wedstrijdplan" },
        ]
      },
      { id: "G5_TAC_SCORE_SMART", pillar: "TACTICAL", name: "Score-Smart Play", description: "Gebruikt score slim (30–30, BP, TB)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen score-awareness" },
          { score: 1, label: "Emerging", observable: "Soms slim" },
          { score: 2, label: "Achieved", observable: "Speelt score slim" },
        ]
      },
      { id: "G5_MEN_CLOSE_MATCHES", pillar: "MENTAL", name: "Closes Matches", description: "Kan wedstrijden afmaken",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest voorsprongen" },
          { score: 1, label: "Emerging", observable: "Soms sluiten" },
          { score: 2, label: "Achieved", observable: "Maakt wedstrijden af" },
        ]
      },
      { id: "G5_MEN_CLUTCH", pillar: "MENTAL", name: "Plays Better Under Pressure", description: "Speelt beter bij druk, niet slechter",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Slechter onder druk" },
          { score: 1, label: "Emerging", observable: "Stabiel onder druk" },
          { score: 2, label: "Achieved", observable: "Beter onder druk" },
        ]
      },
      { id: "G5_MAT_STRUCTURAL_WINS", pillar: "MATCH", name: "Structural Wins", description: "Wint structureel wedstrijden op eigen niveau",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Inconsistent winnen" },
          { score: 1, label: "Emerging", observable: "Meestal winnen" },
          { score: 2, label: "Achieved", observable: "Structureel winnen" },
        ]
      },
      { id: "G5_MAT_STYLES", pillar: "MATCH", name: "Beats Multiple Styles", description: "Kan meerdere speelstijlen verslaan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moeite met bepaalde stijlen" },
          { score: 1, label: "Emerging", observable: "Meeste stijlen ok" },
          { score: 2, label: "Achieved", observable: "Verslaat alle stijlen" },
        ]
      },
      { id: "G5_MAT_RECOVERY", pillar: "MATCH", name: "Recovers from Loss", description: "Herstelt van verlies (next match beter)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Lange impact van verlies" },
          { score: 1, label: "Emerging", observable: "Herstelt langzaam" },
          { score: 2, label: "Achieved", observable: "Snel herstel na verlies" },
        ]
      },
    ]
  },

  "GLOW_4": {
    levelId: "GLOW_4",
    rank: 4,
    name: "Elite Performance",
    subtitle: "Competitive Readiness",
    abilitySnapshot: "Ik win niet omdat ik beter sla — maar omdat ik beter beslis en mijn identiteit opleg.",
    philosophy: "De speler wint niet 'omdat hij beter speelt', maar omdat hij beter beslist en zijn identiteit oplegt aan de wedstrijd. Rankings hebben betekenis.",
    pillarWeighting: {
      technique: 10,
      tactical: 20,
      physical: 5,
      mental: 30,
      social: 0,
      match: 35,
    },
    promotionRequirements: {
      minMatches: 15,
      matchDataRequired: true,
      consistencyMonths: 6,
      coachConfirmation: true,
    },
    isDataDriven: true,
    skills: [
      { id: "G4_TECH_IDENTITY", pillar: "TECHNIQUE", name: "Clear Playing Identity", description: "Duidelijke identiteit (spin / tempo / druk)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen duidelijke identiteit" },
          { score: 1, label: "Emerging", observable: "Identiteit ontwikkelt" },
          { score: 2, label: "Achieved", observable: "Duidelijke spel-identiteit" },
        ]
      },
      { id: "G4_TAC_OPPONENT", pillar: "TACTICAL", name: "Analyzes Opponent", description: "Analyseert opponent vóór de match",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen analyse vooraf" },
          { score: 1, label: "Emerging", observable: "Soms analyseren" },
          { score: 2, label: "Achieved", observable: "Analyseert altijd vooraf" },
        ]
      },
      { id: "G4_TAC_ADAPT_SET", pillar: "TACTICAL", name: "Adapts Per Set/Game", description: "Past tactiek aan per set / game",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen aanpassing" },
          { score: 1, label: "Emerging", observable: "Soms aanpassen" },
          { score: 2, label: "Achieved", observable: "Past actief aan" },
        ]
      },
      { id: "G4_TAC_WIN_UGLY", pillar: "TACTICAL", name: "Can Win Ugly", description: "Kan winnen zonder 'beste spel'",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moet goed spelen om te winnen" },
          { score: 1, label: "Emerging", observable: "Soms ugly win" },
          { score: 2, label: "Achieved", observable: "Wint ook op slechte dagen" },
        ]
      },
      { id: "G4_MEN_KILLER", pillar: "MENTAL", name: "Killer Instinct", description: "Wil winnen — niet 'leuk spelen'",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Speelt voor plezier" },
          { score: 1, label: "Emerging", observable: "Soms killer" },
          { score: 2, label: "Achieved", observable: "Killer instinct aanwezig" },
        ]
      },
      { id: "G4_MEN_STOPS_COMEBACK", pillar: "MENTAL", name: "Stops Comebacks", description: "Kan comeback stoppen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Laat tegenstander terugkomen" },
          { score: 1, label: "Emerging", observable: "Soms stoppen" },
          { score: 2, label: "Achieved", observable: "Stopt comebacks effectief" },
        ]
      },
      { id: "G4_MEN_CLINICAL", pillar: "MENTAL", name: "Clinical Closer", description: "Sluit wedstrijden klinisch af",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moeite met afsluiten" },
          { score: 1, label: "Emerging", observable: "Soms klinisch" },
          { score: 2, label: "Achieved", observable: "Klinische afwerking" },
        ]
      },
      { id: "G4_MAT_DOMINANT", pillar: "MATCH", name: "Dominant on Level", description: "Wint structureel tegen sterke tegenstanders",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest van sterke tegenstanders" },
          { score: 1, label: "Emerging", observable: "Soms winnen" },
          { score: 2, label: "Achieved", observable: "Wint structureel van sterke tegenstanders" },
        ]
      },
      { id: "G4_MAT_NO_LOSE_DOWN", pillar: "MATCH", name: "Rarely Loses to Lower", description: "Verliest zelden van lagere niveaus",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest vaak van lager" },
          { score: 1, label: "Emerging", observable: "Af en toe verlies" },
          { score: 2, label: "Achieved", observable: "Zelden verlies van lager niveau" },
        ]
      },
      { id: "G4_MAT_STABLE_MONTHS", pillar: "MATCH", name: "Stable Over Months", description: "Resultaten stabiel over maanden",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wisselende resultaten" },
          { score: 1, label: "Emerging", observable: "Redelijk stabiel" },
          { score: 2, label: "Achieved", observable: "Stabiel over maanden" },
        ]
      },
    ]
  },

  "GLOW_3": {
    levelId: "GLOW_3",
    rank: 3,
    name: "Elite",
    subtitle: "Performance Pathway",
    abilitySnapshot: "Ik win structureel, begrijp waarom, kan mezelf sturen, functioneer in high-pressure omgeving.",
    philosophy: "De speler wint structureel, begrijpt waarom hij wint, kan zichzelf sturen, kan functioneren in een high-pressure omgeving. Dit is geen eindpunt — het is een toelatingsexamen.",
    pillarWeighting: {
      technique: 15,
      tactical: 20,
      physical: 10,
      mental: 25,
      social: 0,
      match: 30,
    },
    promotionRequirements: {
      minMatches: 12,
      winrateMin: 60,
      matchDataRequired: true,
      consistencyMonths: 6,
      coachConfirmation: true,
    },
    isDataDriven: true,
    skills: [
      { id: "G3_TECH_PROOFED", pillar: "TECHNIQUE", name: "Match-Proofed Technique", description: "Techniek is wedstrijd-proof",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Techniek zakt in wedstrijd" },
          { score: 1, label: "Emerging", observable: "Meestal stabiel" },
          { score: 2, label: "Achieved", observable: "Wedstrijd-proof techniek" },
        ]
      },
      { id: "G3_TAC_EXPLAIN", pillar: "TACTICAL", name: "Can Explain Game Plan", description: "Kan wedstrijdplan uitleggen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan plan niet uitleggen" },
          { score: 1, label: "Emerging", observable: "Vaag uitleggen" },
          { score: 2, label: "Achieved", observable: "Helder plan uitleggen" },
        ]
      },
      { id: "G3_TAC_ADAPT_LOSS", pillar: "TACTICAL", name: "Adapts When Losing", description: "Past tactiek aan bij verlies",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Blijft hetzelfde doen" },
          { score: 1, label: "Emerging", observable: "Soms aanpassen" },
          { score: 2, label: "Achieved", observable: "Past direct aan bij verlies" },
        ]
      },
      { id: "G3_TAC_SCORE_MATURE", pillar: "TACTICAL", name: "Score Maturity", description: "Speelt score extreem volwassen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onvolwassen score-spel" },
          { score: 1, label: "Emerging", observable: "Soms volwassen" },
          { score: 2, label: "Achieved", observable: "Extreem volwassen score-spel" },
        ]
      },
      { id: "G3_MEN_STABLE_PRESSURE", pillar: "MENTAL", name: "Stable Under Pressure", description: "Stabiel onder druk hele wedstrijd",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Instabiel onder druk" },
          { score: 1, label: "Emerging", observable: "Meestal stabiel" },
          { score: 2, label: "Achieved", observable: "Altijd stabiel onder druk" },
        ]
      },
      { id: "G3_MEN_RESET_LOSS", pillar: "MENTAL", name: "Resets After Set Loss", description: "Kan setverlies resetten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Impact van setverlies" },
          { score: 1, label: "Emerging", observable: "Soms reset" },
          { score: 2, label: "Achieved", observable: "Reset direct na setverlies" },
        ]
      },
      { id: "G3_MAT_60_65", pillar: "MATCH", name: "60-65% Win Rate", description: "Wint >60–65% van competitieve matches",
        rubric: [
          { score: 0, label: "Not Yet", observable: "< 50% winrate" },
          { score: 1, label: "Emerging", observable: "50-60%" },
          { score: 2, label: "Achieved", observable: "60-65%+ winrate" },
        ]
      },
      { id: "G3_MAT_BEATS_LEVEL", pillar: "MATCH", name: "Beats Same/Higher Level", description: "Kan winnen tegen gelijk/iets beter niveau",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest van gelijk niveau" },
          { score: 1, label: "Emerging", observable: "Soms winnen" },
          { score: 2, label: "Achieved", observable: "Wint van gelijk/beter niveau" },
        ]
      },
      { id: "G3_MAT_STORY", pillar: "MATCH", name: "Match History Story", description: "Match history vertelt een logisch verhaal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Inconsistente history" },
          { score: 1, label: "Emerging", observable: "Soms logisch" },
          { score: 2, label: "Achieved", observable: "Logische progressie in history" },
        ]
      },
    ]
  },

  "GLOW_2": {
    levelId: "GLOW_2",
    rank: 2,
    name: "Performance Talent",
    subtitle: "Talent Pathway",
    abilitySnapshot: "Ik verdien extra investering. Ik speel om te winnen, train om beter te worden, denk als competitor.",
    philosophy: "Een Glow 2 speler speelt om te winnen, traint om beter te worden, denkt als een competitor, kan omgaan met verwachtingen. 'Deze speler verdient extra investering.'",
    pillarWeighting: {
      technique: 15,
      tactical: 20,
      physical: 5,
      mental: 25,
      social: 0,
      match: 35,
    },
    promotionRequirements: {
      minMatches: 20,
      winrateMin: 60,
      matchDataRequired: true,
      consistencyMonths: 6,
      coachConfirmation: true,
    },
    isDataDriven: true,
    skills: [
      { id: "G2_TECH_WEAPONIZED", pillar: "TECHNIQUE", name: "Weaponized Technique", description: "Techniek is functioneel onder stress",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Techniek zakt onder stress" },
          { score: 1, label: "Emerging", observable: "Meestal stabiel" },
          { score: 2, label: "Achieved", observable: "Functioneel onder alle stress" },
        ]
      },
      { id: "G2_TAC_A_B_PLAN", pillar: "TACTICAL", name: "A and B Plan", description: "Heeft duidelijk A-plan én B-plan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Alleen A-plan" },
          { score: 1, label: "Emerging", observable: "B-plan aanwezig maar zwak" },
          { score: 2, label: "Achieved", observable: "Sterk A en B plan" },
        ]
      },
      { id: "G2_TAC_EXPLAIN_WHY", pillar: "TACTICAL", name: "Explains Why", description: "Kan uitleggen waarom iets werkt",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weet niet waarom" },
          { score: 1, label: "Emerging", observable: "Soms uitleggen" },
          { score: 2, label: "Achieved", observable: "Legt helder uit waarom" },
        ]
      },
      { id: "G2_MEN_PRESSURE_FUEL", pillar: "MENTAL", name: "Pressure as Fuel", description: "Druk = brandstof",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Druk is probleem" },
          { score: 1, label: "Emerging", observable: "Neutraal met druk" },
          { score: 2, label: "Achieved", observable: "Druk is brandstof" },
        ]
      },
      { id: "G2_MEN_RESPONSIBILITY", pillar: "MENTAL", name: "Takes Responsibility", description: "Neemt verantwoordelijkheid bij fouten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zoekt excuses" },
          { score: 1, label: "Emerging", observable: "Soms verantwoordelijkheid" },
          { score: 2, label: "Achieved", observable: "Neemt altijd verantwoordelijkheid" },
        ]
      },
      { id: "G2_MAT_CONSISTENT_WINS", pillar: "MATCH", name: "Consistent Winning", description: "Wint consistent op niveau",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Inconsistent" },
          { score: 1, label: "Emerging", observable: "Meestal winnen" },
          { score: 2, label: "Achieved", observable: "Consistent winnen" },
        ]
      },
      { id: "G2_MAT_NEVER_LOWER", pillar: "MATCH", name: "Never Loses to Lower", description: "Verliest zelden van lager niveau",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest van lager" },
          { score: 1, label: "Emerging", observable: "Af en toe" },
          { score: 2, label: "Achieved", observable: "Nooit van lager niveau" },
        ]
      },
      { id: "G2_MAT_PROGRESSION", pillar: "MATCH", name: "Clear Progression", description: "Match history toont progressie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen progressie zichtbaar" },
          { score: 1, label: "Emerging", observable: "Enige progressie" },
          { score: 2, label: "Achieved", observable: "Duidelijke progressie" },
        ]
      },
    ]
  },

  "GLOW_1": {
    levelId: "GLOW_1",
    rank: 1,
    name: "Elite Semi-Pro",
    subtitle: "Elite Performance Level",
    abilitySnapshot: "Ik leef als sporter, denk vooruit in wedstrijden, neem eigenaarschap, presteer onder echte druk.",
    philosophy: "Een Glow 1 speler leeft als sporter, denkt vooruit in wedstrijden, neemt eigenaarschap over ontwikkeling, kan presteren onder echte druk. Dit is geen beloning. Dit is erkenning.",
    pillarWeighting: {
      technique: 10,
      tactical: 20,
      physical: 5,
      mental: 25,
      social: 0,
      match: 40,
    },
    promotionRequirements: {
      minMatches: 40,
      winrateMin: 65,
      matchDataRequired: true,
      consistencyMonths: 12,
      coachConfirmation: true,
    },
    isDataDriven: true,
    skills: [
      { id: "G1_TECH_AUTOMATED", pillar: "TECHNIQUE", name: "Automated Technique", description: "Techniek volledig geautomatiseerd",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Denkt nog over techniek" },
          { score: 1, label: "Emerging", observable: "Bijna automatisch" },
          { score: 2, label: "Achieved", observable: "Volledig geautomatiseerd" },
        ]
      },
      { id: "G1_TECH_NO_BREAKDOWN", pillar: "TECHNIQUE", name: "No Breakdowns Under Pressure", description: "Geen technische breakdowns onder druk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Soms breakdown" },
          { score: 1, label: "Emerging", observable: "Zelden breakdown" },
          { score: 2, label: "Achieved", observable: "Nooit technische breakdown" },
        ]
      },
      { id: "G1_TAC_MULTI_PLANS", pillar: "TACTICAL", name: "Multiple Game Plans", description: "Heeft meerdere gameplans",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Één plan" },
          { score: 1, label: "Emerging", observable: "2 plannen" },
          { score: 2, label: "Achieved", observable: "Meerdere flexibele plannen" },
        ]
      },
      { id: "G1_TAC_LIVE_ADAPT", pillar: "TACTICAL", name: "Live Adaptation", description: "Past strategie live aan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Vast aan plan" },
          { score: 1, label: "Emerging", observable: "Soms live aanpassen" },
          { score: 2, label: "Achieved", observable: "Past live aan tijdens wedstrijd" },
        ]
      },
      { id: "G1_TAC_NO_COACH_NEEDED", pillar: "TACTICAL", name: "No Coach Needed in Match", description: "Geen coach nodig tijdens match",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Heeft coach nodig" },
          { score: 1, label: "Emerging", observable: "Soms zelfstandig" },
          { score: 2, label: "Achieved", observable: "Volledig zelfstandig in wedstrijd" },
        ]
      },
      { id: "G1_MEN_MATCH_POINT_CALM", pillar: "MENTAL", name: "Calm at Match Points", description: "Blijft kalm bij matchpoints",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Nerveus bij matchpoints" },
          { score: 1, label: "Emerging", observable: "Soms kalm" },
          { score: 2, label: "Achieved", observable: "Altijd kalm bij matchpoints" },
        ]
      },
      { id: "G1_MEN_COMEBACK", pillar: "MENTAL", name: "Can Make Comebacks", description: "Kan comeback maken",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen comebacks" },
          { score: 1, label: "Emerging", observable: "Soms comeback" },
          { score: 2, label: "Achieved", observable: "Maakt regelmatig comebacks" },
        ]
      },
      { id: "G1_MEN_MOMENT", pillar: "MENTAL", name: "Plays the Moment", description: "Speelt het moment, niet het scorebord",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kijkt naar scorebord" },
          { score: 1, label: "Emerging", observable: "Soms in het moment" },
          { score: 2, label: "Achieved", observable: "Speelt altijd het moment" },
        ]
      },
      { id: "G1_MAT_HIGH_LEVEL", pillar: "MATCH", name: "Wins at High Level", description: "Wint op hoog niveau",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest op hoog niveau" },
          { score: 1, label: "Emerging", observable: "Soms winnen" },
          { score: 2, label: "Achieved", observable: "Wint consistent op hoog niveau" },
        ]
      },
      { id: "G1_MAT_BEATS_GLOW2", pillar: "MATCH", name: "Beats Glow 2 Consistently", description: "Verslaat Glow 2 consistent",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moeite met Glow 2" },
          { score: 1, label: "Emerging", observable: "Meestal winnen" },
          { score: 2, label: "Achieved", observable: "Verslaat Glow 2 consistent" },
        ]
      },
      { id: "G1_MAT_NO_LUCK", pillar: "MATCH", name: "No Luck Dependency", description: "Geen afhankelijkheid van geluk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wint soms door geluk" },
          { score: 1, label: "Emerging", observable: "Meestal skill" },
          { score: 2, label: "Achieved", observable: "Wint door skill, niet geluk" },
        ]
      },
      { id: "G1_MAT_LONG_TERM", pillar: "MATCH", name: "Results Over Long Period", description: "Resultaten over lange periode",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Korte termijn succes" },
          { score: 1, label: "Emerging", observable: "Meerdere maanden stabiel" },
          { score: 2, label: "Achieved", observable: "Jaar+ stabiele resultaten" },
        ]
      },
    ]
  },
};

// Helper function to get skills by pillar
export function getSkillsByPillar(levelId: string, pillar: string): GlowSkill[] {
  const level = ADULT_GLOW_SKILLS_BY_LEVEL[levelId];
  if (!level) return [];
  return level.skills.filter(s => s.pillar === pillar);
}

// Helper function to get level config
export function getLevelConfig(levelId: string): LevelSkillsConfig | null {
  return ADULT_GLOW_SKILLS_BY_LEVEL[levelId] || null;
}

// Helper to get pillar weighting for a level
export function getPillarWeighting(levelId: string): PillarWeighting | null {
  const level = ADULT_GLOW_SKILLS_BY_LEVEL[levelId];
  return level?.pillarWeighting || null;
}

// Get all level IDs in order (9 to 1)
export function getOrderedLevelIds(): string[] {
  return ["GLOW_9", "GLOW_8", "GLOW_7", "GLOW_6", "GLOW_5", "GLOW_4", "GLOW_3", "GLOW_2", "GLOW_1"];
}

// Count total skills per level
export function countSkillsPerLevel(levelId: string): number {
  const level = ADULT_GLOW_SKILLS_BY_LEVEL[levelId];
  return level?.skills.length || 0;
}

// Export types
export type { GlowSkill, LevelSkillsConfig, PillarWeighting, PromotionRequirements, SkillRubric };
