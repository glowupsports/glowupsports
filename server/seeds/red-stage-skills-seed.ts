/**
 * RED STAGE Skills - Beginners (ages 5-8)
 * 
 * RED 3 → RED 2 → RED 1
 * Focus: Basic tennis fundamentals, movement, fun, group play
 * Ball: Red foam/felt ball (25% compression)
 * Court: Red court (11m x 5.5m)
 * 
 * KNLTB-style: 1 = best/ready for next stage, 3 = just starting
 */

interface SkillRubric {
  score: number;
  label: string;
  observable: string;
}

interface RedSkill {
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
  physicalMinPercent?: number;
  mentalMinPercent?: number;
  matchMinPercent?: number;
  coachConfirmation?: boolean;
  minSessions?: number;
}

interface RedLevelConfig {
  levelId: string;
  rank: number;
  name: string;
  subtitle: string;
  abilitySnapshot: string;
  philosophy: string;
  pillarWeighting: PillarWeighting;
  promotionRequirements: PromotionRequirements;
  skills: RedSkill[];
}

export const RED_STAGE_SKILLS_BY_LEVEL: Record<string, RedLevelConfig> = {
  "RED_3": {
    levelId: "RED_3",
    rank: 3,
    name: "Starter",
    subtitle: "Tennis Discovery",
    abilitySnapshot: "Ik leer de basis van tennis!",
    philosophy: "Focus op plezier, beweging, en eerste contact met bal en racket.",
    pillarWeighting: {
      technique: 40,
      tactical: 10,
      physical: 25,
      mental: 15,
      social: 5,
      match: 5,
    },
    promotionRequirements: {
      techniqueMinPercent: 60,
      physicalMinPercent: 60,
      coachConfirmation: true,
      minSessions: 8,
    },
    skills: [
      // TECHNIQUE - FOREHAND (8 skills)
      { id: "R3_FH_GRIP", pillar: "TECHNIQUE", category: "Forehand", name: "Forehand Grip", description: "Houdt Eastern forehand grip",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkeerde grip of geen consistente grip" },
          { score: 1, label: "Emerging", observable: "Probeert Eastern grip, nog inconsistent" },
          { score: 2, label: "Achieved", observable: "Consistente Eastern grip bij forehand" },
        ]
      },
      { id: "R3_FH_READY", pillar: "TECHNIQUE", category: "Forehand", name: "Ready Position", description: "Neemt ready positie aan voor slag",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Staat rechtop, geen ready positie" },
          { score: 1, label: "Emerging", observable: "Probeert ready positie" },
          { score: 2, label: "Achieved", observable: "Consistente ready positie met gebogen knieën" },
        ]
      },
      { id: "R3_FH_TURN", pillar: "TECHNIQUE", category: "Forehand", name: "Shoulder Turn", description: "Draait schouders bij voorbereiding",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen schouderdraai, slaat met arm alleen" },
          { score: 1, label: "Emerging", observable: "Kleine schouderdraai" },
          { score: 2, label: "Achieved", observable: "Duidelijke schouderdraai naar achteren" },
        ]
      },
      { id: "R3_FH_SWING", pillar: "TECHNIQUE", category: "Forehand", name: "Swing Path", description: "Low-to-high swing path",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Platte of neerwaartse swing" },
          { score: 1, label: "Emerging", observable: "Soms low-to-high" },
          { score: 2, label: "Achieved", observable: "Consistente low-to-high swing" },
        ]
      },
      { id: "R3_FH_CONTACT", pillar: "TECHNIQUE", category: "Forehand", name: "Contact Point", description: "Raakt bal voor het lichaam",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Bal raakt te laat of te dichtbij lichaam" },
          { score: 1, label: "Emerging", observable: "Soms correct contactpunt" },
          { score: 2, label: "Achieved", observable: "Bal consistent voor lichaam geraakt" },
        ]
      },
      { id: "R3_FH_FOLLOW", pillar: "TECHNIQUE", category: "Forehand", name: "Follow Through", description: "Eindigt met racket over schouder",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Stopt swing bij contact" },
          { score: 1, label: "Emerging", observable: "Korte follow-through" },
          { score: 2, label: "Achieved", observable: "Volledige follow-through over schouder" },
        ]
      },
      { id: "R3_FH_BALANCE", pillar: "TECHNIQUE", category: "Forehand", name: "Balance After Shot", description: "Blijft in balans na slag",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Valt uit balans na slag" },
          { score: 1, label: "Emerging", observable: "Soms in balans" },
          { score: 2, label: "Achieved", observable: "Stabiele balans na elke slag" },
        ]
      },
      { id: "R3_FH_RALLY", pillar: "TECHNIQUE", category: "Forehand", name: "Forehand Rally", description: "Kan 3 forehands achter elkaar over net",
        rubric: [
          { score: 0, label: "Not Yet", observable: "0-1 bal over net" },
          { score: 1, label: "Emerging", observable: "2 ballen over net" },
          { score: 2, label: "Achieved", observable: "3+ ballen achter elkaar over net" },
        ]
      },

      // TECHNIQUE - BACKHAND (6 skills)
      { id: "R3_BH_TYPE", pillar: "TECHNIQUE", category: "Backhand", name: "Backhand Choice", description: "Kiest 1H of 2H backhand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wisselt constant tussen 1H en 2H" },
          { score: 1, label: "Emerging", observable: "Begint voorkeur te tonen" },
          { score: 2, label: "Achieved", observable: "Consistente keuze 1H of 2H" },
        ]
      },
      { id: "R3_BH_GRIP", pillar: "TECHNIQUE", category: "Backhand", name: "Backhand Grip", description: "Correcte grip voor gekozen backhand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen grip aanpassing" },
          { score: 1, label: "Emerging", observable: "Probeert grip te veranderen" },
          { score: 2, label: "Achieved", observable: "Correcte grip voor backhand" },
        ]
      },
      { id: "R3_BH_TURN", pillar: "TECHNIQUE", category: "Backhand", name: "BH Shoulder Turn", description: "Draait schouders bij backhand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen draai, arm alleen" },
          { score: 1, label: "Emerging", observable: "Kleine draai" },
          { score: 2, label: "Achieved", observable: "Goede schouderdraai" },
        ]
      },
      { id: "R3_BH_CONTACT", pillar: "TECHNIQUE", category: "Backhand", name: "BH Contact", description: "Raakt bal stabiel met backhand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Mist vaak of instabiel contact" },
          { score: 1, label: "Emerging", observable: "Soms stabiel" },
          { score: 2, label: "Achieved", observable: "Stabiel contact bij backhand" },
        ]
      },
      { id: "R3_BH_OVER_NET", pillar: "TECHNIQUE", category: "Backhand", name: "BH Over Net", description: "Slaat backhand over net",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Backhand komt niet over net" },
          { score: 1, label: "Emerging", observable: "Soms over net" },
          { score: 2, label: "Achieved", observable: "Regelmatig over net" },
        ]
      },
      { id: "R3_BH_RALLY", pillar: "TECHNIQUE", category: "Backhand", name: "BH Rally", description: "Kan 2 backhands achter elkaar",
        rubric: [
          { score: 0, label: "Not Yet", observable: "0-1 backhand" },
          { score: 1, label: "Emerging", observable: "1 backhand over net" },
          { score: 2, label: "Achieved", observable: "2+ backhands achter elkaar" },
        ]
      },

      // TECHNIQUE - SERVE (5 skills)
      { id: "R3_SV_THROW", pillar: "TECHNIQUE", category: "Serve", name: "Ball Toss", description: "Gooit bal omhoog voor serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan bal niet omhoog gooien" },
          { score: 1, label: "Emerging", observable: "Gooit maar te hoog/laag" },
          { score: 2, label: "Achieved", observable: "Consistente worp op goede hoogte" },
        ]
      },
      { id: "R3_SV_CONTACT", pillar: "TECHNIQUE", category: "Serve", name: "Serve Contact", description: "Raakt bal met racket bij serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Mist bal vaak" },
          { score: 1, label: "Emerging", observable: "Raakt bal soms" },
          { score: 2, label: "Achieved", observable: "Consistente contact bij serve" },
        ]
      },
      { id: "R3_SV_UNDERHAND", pillar: "TECHNIQUE", category: "Serve", name: "Underhand Serve", description: "Kan underhand serve uitvoeren",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen controle over underhand serve" },
          { score: 1, label: "Emerging", observable: "Soms succesvol" },
          { score: 2, label: "Achieved", observable: "Betrouwbare underhand serve" },
        ]
      },
      { id: "R3_SV_BOX", pillar: "TECHNIQUE", category: "Serve", name: "Serve in Box", description: "Serve komt in servicevak",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Serve gaat overal heen" },
          { score: 1, label: "Emerging", observable: "Soms in servicevak" },
          { score: 2, label: "Achieved", observable: "Regelmatig in servicevak" },
        ]
      },
      { id: "R3_SV_START", pillar: "TECHNIQUE", category: "Serve", name: "Serve to Start", description: "Begrijpt serve om punt te starten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weet niet wanneer te serven" },
          { score: 1, label: "Emerging", observable: "Begint te begrijpen" },
          { score: 2, label: "Achieved", observable: "Weet dat serve punt start" },
        ]
      },

      // TECHNIQUE - VOLLEY (4 skills)
      { id: "R3_VL_READY", pillar: "TECHNIQUE", category: "Volley", name: "Volley Ready", description: "Ready positie bij net",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Staat niet klaar bij net" },
          { score: 1, label: "Emerging", observable: "Probeert ready" },
          { score: 2, label: "Achieved", observable: "Goede ready positie bij net" },
        ]
      },
      { id: "R3_VL_BLOCK", pillar: "TECHNIQUE", category: "Volley", name: "Block Volley", description: "Blokkeert bal zonder grote swing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Swingt te veel bij volley" },
          { score: 1, label: "Emerging", observable: "Kleinere swing" },
          { score: 2, label: "Achieved", observable: "Compacte blokvley" },
        ]
      },
      { id: "R3_VL_FH", pillar: "TECHNIQUE", category: "Volley", name: "FH Volley", description: "Forehand volley over net",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan geen FH volley" },
          { score: 1, label: "Emerging", observable: "Soms succesvol" },
          { score: 2, label: "Achieved", observable: "Regelmatige FH volley" },
        ]
      },
      { id: "R3_VL_BH", pillar: "TECHNIQUE", category: "Volley", name: "BH Volley", description: "Backhand volley over net",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan geen BH volley" },
          { score: 1, label: "Emerging", observable: "Soms succesvol" },
          { score: 2, label: "Achieved", observable: "Regelmatige BH volley" },
        ]
      },

      // TACTICAL (7 skills)
      { id: "R3_TAC_COURT", pillar: "TACTICAL", category: "Court Awareness", name: "Knows Court", description: "Kent basisvak en servicevak",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kent baan niet" },
          { score: 1, label: "Emerging", observable: "Kent sommige lijnen" },
          { score: 2, label: "Achieved", observable: "Kent basisvak en servicevak" },
        ]
      },
      { id: "R3_TAC_NET", pillar: "TACTICAL", category: "Court Awareness", name: "Over Net", description: "Begrijpt bal moet over net",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen begrip" },
          { score: 1, label: "Emerging", observable: "Begint te begrijpen" },
          { score: 2, label: "Achieved", observable: "Probeert actief over net te slaan" },
        ]
      },
      { id: "R3_TAC_IN", pillar: "TACTICAL", category: "Court Awareness", name: "In Court", description: "Begrijpt bal moet in baan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen begrip van lijnen" },
          { score: 1, label: "Emerging", observable: "Begint te begrijpen" },
          { score: 2, label: "Achieved", observable: "Probeert bal in baan te houden" },
        ]
      },
      { id: "R3_TAC_RECOVER", pillar: "TACTICAL", category: "Positioning", name: "Recovery", description: "Keert terug naar midden",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Blijft staan na slag" },
          { score: 1, label: "Emerging", observable: "Beweegt soms terug" },
          { score: 2, label: "Achieved", observable: "Keert terug naar midden na slag" },
        ]
      },
      { id: "R3_TAC_READY", pillar: "TACTICAL", category: "Positioning", name: "Ready Between", description: "Neemt ready positie tussen punten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Staat niet klaar" },
          { score: 1, label: "Emerging", observable: "Soms ready" },
          { score: 2, label: "Achieved", observable: "Altijd ready tussen punten" },
        ]
      },
      { id: "R3_TAC_DIRECTION", pillar: "TACTICAL", category: "Shot Selection", name: "Direction Awareness", description: "Begint richting te kiezen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Slaat random" },
          { score: 1, label: "Emerging", observable: "Soms bewuste richting" },
          { score: 2, label: "Achieved", observable: "Probeert richting te kiezen" },
        ]
      },
      { id: "R3_TAC_POINT", pillar: "TACTICAL", category: "Understanding", name: "Point Play", description: "Begrijpt punt winnen/verliezen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Begrijpt punten niet" },
          { score: 1, label: "Emerging", observable: "Basis begrip" },
          { score: 2, label: "Achieved", observable: "Begrijpt hoe punten werken" },
        ]
      },

      // PHYSICAL (8 skills)
      { id: "R3_PHY_RUN", pillar: "PHYSICAL", category: "Movement", name: "Running", description: "Rent naar de bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Beweegt niet naar bal" },
          { score: 1, label: "Emerging", observable: "Beweegt langzaam" },
          { score: 2, label: "Achieved", observable: "Rent actief naar bal" },
        ]
      },
      { id: "R3_PHY_SHUFFLE", pillar: "PHYSICAL", category: "Movement", name: "Shuffle Steps", description: "Kan shuffle stappen maken",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen shuffle" },
          { score: 1, label: "Emerging", observable: "Basis shuffle" },
          { score: 2, label: "Achieved", observable: "Vloeiende shuffle stappen" },
        ]
      },
      { id: "R3_PHY_STOP", pillar: "PHYSICAL", category: "Movement", name: "Stop Balance", description: "Stopt in balans voor slag",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Slaat terwijl nog in beweging" },
          { score: 1, label: "Emerging", observable: "Soms gestopt" },
          { score: 2, label: "Achieved", observable: "Stopt in balans voor slag" },
        ]
      },
      { id: "R3_PHY_SPLIT", pillar: "PHYSICAL", category: "Movement", name: "Split Step Intro", description: "Begint split step te leren",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kent split step niet" },
          { score: 1, label: "Emerging", observable: "Probeert soms" },
          { score: 2, label: "Achieved", observable: "Doet split step regelmatig" },
        ]
      },
      { id: "R3_PHY_BALANCE", pillar: "PHYSICAL", category: "Balance", name: "General Balance", description: "Goede algemene balans",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Valt vaak uit balans" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Stabiele balans" },
        ]
      },
      { id: "R3_PHY_COORD", pillar: "PHYSICAL", category: "Coordination", name: "Hand-Eye Coord", description: "Goede oog-hand coördinatie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Slechte coördinatie" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Goede oog-hand coördinatie" },
        ]
      },
      { id: "R3_PHY_ENDURANCE", pillar: "PHYSICAL", category: "Fitness", name: "30 Min Session", description: "Houdt 30 min sessie vol",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moe binnen 15 min" },
          { score: 1, label: "Emerging", observable: "20-25 min" },
          { score: 2, label: "Achieved", observable: "Actief hele 30 min" },
        ]
      },
      { id: "R3_PHY_REACTION", pillar: "PHYSICAL", category: "Reaction", name: "Ball Reaction", description: "Reageert op bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Trage reactie op bal" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Snelle reactie op bal" },
        ]
      },

      // MENTAL (6 skills)
      { id: "R3_MEN_FOCUS", pillar: "MENTAL", category: "Focus", name: "Lesson Focus", description: "Blijft gefocust tijdens les",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Afgeleid binnen 5 min" },
          { score: 1, label: "Emerging", observable: "10-15 min focus" },
          { score: 2, label: "Achieved", observable: "Gefocust hele les" },
        ]
      },
      { id: "R3_MEN_LISTEN", pillar: "MENTAL", category: "Instructions", name: "Listens", description: "Luistert naar instructies",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Luistert niet" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Luistert aandachtig" },
        ]
      },
      { id: "R3_MEN_TRIES", pillar: "MENTAL", category: "Effort", name: "Tries Hard", description: "Doet zijn best",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Minimale inzet" },
          { score: 1, label: "Emerging", observable: "Wisselend" },
          { score: 2, label: "Achieved", observable: "Zet altijd door" },
        ]
      },
      { id: "R3_MEN_MISTAKE", pillar: "MENTAL", category: "Resilience", name: "Handles Mistakes", description: "Gaat goed om met fouten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Gefrustreerd bij fouten" },
          { score: 1, label: "Emerging", observable: "Soms gefrustreerd" },
          { score: 2, label: "Achieved", observable: "Accepteert fouten en probeert door" },
        ]
      },
      { id: "R3_MEN_FUN", pillar: "MENTAL", category: "Attitude", name: "Has Fun", description: "Heeft plezier",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Lijkt niet te genieten" },
          { score: 1, label: "Emerging", observable: "Soms plezier" },
          { score: 2, label: "Achieved", observable: "Heeft duidelijk plezier" },
        ]
      },
      { id: "R3_MEN_POSITIVE", pillar: "MENTAL", category: "Attitude", name: "Positive Attitude", description: "Positieve houding",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Negatief" },
          { score: 1, label: "Emerging", observable: "Wisselend" },
          { score: 2, label: "Achieved", observable: "Positief en enthousiast" },
        ]
      },

      // SOCIAL (4 skills)
      { id: "R3_SOC_GROUP", pillar: "SOCIAL", category: "Group", name: "Group Play", description: "Speelt goed in groep",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Problemen in groep" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Speelt goed samen" },
        ]
      },
      { id: "R3_SOC_TURN", pillar: "SOCIAL", category: "Rules", name: "Takes Turns", description: "Wacht op beurt",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Dringt voor" },
          { score: 1, label: "Emerging", observable: "Soms wachten" },
          { score: 2, label: "Achieved", observable: "Wacht geduldig op beurt" },
        ]
      },
      { id: "R3_SOC_RESPECT", pillar: "SOCIAL", category: "Behavior", name: "Respects Coach", description: "Respecteert coach",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onbeleefd" },
          { score: 1, label: "Emerging", observable: "Meestal respectvol" },
          { score: 2, label: "Achieved", observable: "Altijd respectvol" },
        ]
      },
      { id: "R3_SOC_ENCOURAGE", pillar: "SOCIAL", category: "Behavior", name: "Encourages Others", description: "Moedigt anderen aan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen aanmoediging" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Moedigt actief aan" },
        ]
      },

      // MATCH (4 skills)
      { id: "R3_MAT_SERVE", pillar: "MATCH", category: "Match Play", name: "Serves in Match", description: "Kan serven in wedstrijd",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan niet serven in match" },
          { score: 1, label: "Emerging", observable: "Met moeite" },
          { score: 2, label: "Achieved", observable: "Serveert succesvol" },
        ]
      },
      { id: "R3_MAT_RALLY", pillar: "MATCH", category: "Match Play", name: "Rally in Match", description: "Kan rally'en in wedstrijd",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen rally mogelijk" },
          { score: 1, label: "Emerging", observable: "Korte rally's" },
          { score: 2, label: "Achieved", observable: "Consistente rally's" },
        ]
      },
      { id: "R3_MAT_SCORE", pillar: "MATCH", category: "Understanding", name: "Keeps Score", description: "Kan score bijhouden",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kent score niet" },
          { score: 1, label: "Emerging", observable: "Met hulp" },
          { score: 2, label: "Achieved", observable: "Houdt zelf score bij" },
        ]
      },
      { id: "R3_MAT_SPORT", pillar: "MATCH", category: "Behavior", name: "Good Sportsmanship", description: "Goed sportief gedrag",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Slecht verliezer" },
          { score: 1, label: "Emerging", observable: "Soms moeite" },
          { score: 2, label: "Achieved", observable: "Altijd sportief" },
        ]
      },
    ],
  },

  "RED_2": {
    levelId: "RED_2",
    rank: 2,
    name: "Developer",
    subtitle: "Building Consistency",
    abilitySnapshot: "Ik kan rally'en en wedstrijdjes spelen!",
    philosophy: "Focus op consistentie, tactisch bewustzijn, en wedstrijdervaring.",
    pillarWeighting: {
      technique: 35,
      tactical: 20,
      physical: 20,
      mental: 15,
      social: 5,
      match: 5,
    },
    promotionRequirements: {
      techniqueMinPercent: 70,
      tacticalMinPercent: 60,
      matchMinPercent: 60,
      coachConfirmation: true,
      minSessions: 12,
    },
    skills: [
      // TECHNIQUE - FOREHAND (8 skills - more advanced)
      { id: "R2_FH_GRIP", pillar: "TECHNIQUE", category: "Forehand", name: "Consistent Grip", description: "Consistente Eastern/Semi-Western grip",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Grip wisselt nog" },
          { score: 1, label: "Emerging", observable: "Meestal consistent" },
          { score: 2, label: "Achieved", observable: "Altijd correcte grip" },
        ]
      },
      { id: "R2_FH_PREP", pillar: "TECHNIQUE", category: "Forehand", name: "Early Prep", description: "Vroege voorbereiding",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Late voorbereiding" },
          { score: 1, label: "Emerging", observable: "Soms vroeg" },
          { score: 2, label: "Achieved", observable: "Consistente vroege prep" },
        ]
      },
      { id: "R2_FH_FOOTWORK", pillar: "TECHNIQUE", category: "Forehand", name: "FH Footwork", description: "Goede voetenwerk bij forehand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Staat vast" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Goede voetenwerk" },
        ]
      },
      { id: "R2_FH_TOPSPIN", pillar: "TECHNIQUE", category: "Forehand", name: "Topspin Intro", description: "Begint topspin te leren",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Platte bal" },
          { score: 1, label: "Emerging", observable: "Soms rotatie" },
          { score: 2, label: "Achieved", observable: "Merkbare topspin" },
        ]
      },
      { id: "R2_FH_CROSSCOURT", pillar: "TECHNIQUE", category: "Forehand", name: "FH Crosscourt", description: "Kan crosscourt slaan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan richting niet kiezen" },
          { score: 1, label: "Emerging", observable: "Soms crosscourt" },
          { score: 2, label: "Achieved", observable: "Betrouwbare crosscourt" },
        ]
      },
      { id: "R2_FH_DOWNLINE", pillar: "TECHNIQUE", category: "Forehand", name: "FH Down Line", description: "Kan down the line slaan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen controle" },
          { score: 1, label: "Emerging", observable: "Soms down line" },
          { score: 2, label: "Achieved", observable: "Kan down the line" },
        ]
      },
      { id: "R2_FH_DEPTH", pillar: "TECHNIQUE", category: "Forehand", name: "FH Depth", description: "Slaat bal diep",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Korte ballen" },
          { score: 1, label: "Emerging", observable: "Soms diep" },
          { score: 2, label: "Achieved", observable: "Consistente diepte" },
        ]
      },
      { id: "R2_FH_RALLY5", pillar: "TECHNIQUE", category: "Forehand", name: "5 Ball Rally", description: "Kan 5+ forehands rally'en",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Max 3 ballen" },
          { score: 1, label: "Emerging", observable: "4 ballen" },
          { score: 2, label: "Achieved", observable: "5+ ballen consistent" },
        ]
      },

      // TECHNIQUE - BACKHAND (7 skills)
      { id: "R2_BH_GRIP", pillar: "TECHNIQUE", category: "Backhand", name: "BH Grip Consistent", description: "Consistente backhand grip",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wisselende grip" },
          { score: 1, label: "Emerging", observable: "Meestal correct" },
          { score: 2, label: "Achieved", observable: "Altijd correcte grip" },
        ]
      },
      { id: "R2_BH_PREP", pillar: "TECHNIQUE", category: "Backhand", name: "BH Early Prep", description: "Vroege BH voorbereiding",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Late prep" },
          { score: 1, label: "Emerging", observable: "Soms vroeg" },
          { score: 2, label: "Achieved", observable: "Consistente vroege prep" },
        ]
      },
      { id: "R2_BH_FOOTWORK", pillar: "TECHNIQUE", category: "Backhand", name: "BH Footwork", description: "Goede voetenwerk bij backhand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Staat vast" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Goede voetenwerk" },
        ]
      },
      { id: "R2_BH_CROSSCOURT", pillar: "TECHNIQUE", category: "Backhand", name: "BH Crosscourt", description: "Kan BH crosscourt slaan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen controle" },
          { score: 1, label: "Emerging", observable: "Soms crosscourt" },
          { score: 2, label: "Achieved", observable: "Betrouwbare BH crosscourt" },
        ]
      },
      { id: "R2_BH_RALLY3", pillar: "TECHNIQUE", category: "Backhand", name: "BH 3 Ball Rally", description: "Kan 3+ backhands rally'en",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Max 1 BH" },
          { score: 1, label: "Emerging", observable: "2 BH's" },
          { score: 2, label: "Achieved", observable: "3+ BH's consistent" },
        ]
      },
      { id: "R2_BH_SLICE_INTRO", pillar: "TECHNIQUE", category: "Backhand", name: "Slice Intro", description: "Begint slice te leren",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kent slice niet" },
          { score: 1, label: "Emerging", observable: "Probeert slice" },
          { score: 2, label: "Achieved", observable: "Basis slice" },
        ]
      },
      { id: "R2_BH_STABLE", pillar: "TECHNIQUE", category: "Backhand", name: "BH Stability", description: "Stabiele backhand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onstabiel" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Stabiele techniek" },
        ]
      },

      // TECHNIQUE - SERVE (6 skills)
      { id: "R2_SV_OVERHAND", pillar: "TECHNIQUE", category: "Serve", name: "Overhand Serve", description: "Begint overhand serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Alleen underhand" },
          { score: 1, label: "Emerging", observable: "Probeert overhand" },
          { score: 2, label: "Achieved", observable: "Kan overhand serven" },
        ]
      },
      { id: "R2_SV_TOSS", pillar: "TECHNIQUE", category: "Serve", name: "Consistent Toss", description: "Consistente toss",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wisselende toss" },
          { score: 1, label: "Emerging", observable: "Soms consistent" },
          { score: 2, label: "Achieved", observable: "Betrouwbare toss" },
        ]
      },
      { id: "R2_SV_STANCE", pillar: "TECHNIQUE", category: "Serve", name: "Serve Stance", description: "Correcte serve stance",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkeerde positie" },
          { score: 1, label: "Emerging", observable: "Soms correct" },
          { score: 2, label: "Achieved", observable: "Goede stance" },
        ]
      },
      { id: "R2_SV_PERCENTAGE", pillar: "TECHNIQUE", category: "Serve", name: "First Serve %", description: "50%+ eerste serve in",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onder 30%" },
          { score: 1, label: "Emerging", observable: "30-50%" },
          { score: 2, label: "Achieved", observable: "50%+ in" },
        ]
      },
      { id: "R2_SV_PLACEMENT", pillar: "TECHNIQUE", category: "Serve", name: "Serve Placement", description: "Kan serve richten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen controle" },
          { score: 1, label: "Emerging", observable: "Soms gericht" },
          { score: 2, label: "Achieved", observable: "Kan richting kiezen" },
        ]
      },
      { id: "R2_SV_SECOND", pillar: "TECHNIQUE", category: "Serve", name: "Second Serve", description: "Heeft tweede serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen tweede serve" },
          { score: 1, label: "Emerging", observable: "Probeert" },
          { score: 2, label: "Achieved", observable: "Betrouwbare tweede serve" },
        ]
      },

      // TECHNIQUE - VOLLEY (5 skills)
      { id: "R2_VL_PUNCH", pillar: "TECHNIQUE", category: "Volley", name: "Punch Volley", description: "Punch volley techniek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Swingt te veel" },
          { score: 1, label: "Emerging", observable: "Kleiner swing" },
          { score: 2, label: "Achieved", observable: "Compacte punch volley" },
        ]
      },
      { id: "R2_VL_SPLIT", pillar: "TECHNIQUE", category: "Volley", name: "Split at Net", description: "Split step bij net",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen split step" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Consistente split step" },
        ]
      },
      { id: "R2_VL_ANGLE", pillar: "TECHNIQUE", category: "Volley", name: "Volley Angles", description: "Kan hoekjes maken",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Alleen recht vooruit" },
          { score: 1, label: "Emerging", observable: "Soms hoekje" },
          { score: 2, label: "Achieved", observable: "Maakt hoekjes" },
        ]
      },
      { id: "R2_VL_FH_CONSIST", pillar: "TECHNIQUE", category: "Volley", name: "FH Volley Consistent", description: "Consistente FH volley",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onstabiel" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Stabiele FH volley" },
        ]
      },
      { id: "R2_VL_BH_CONSIST", pillar: "TECHNIQUE", category: "Volley", name: "BH Volley Consistent", description: "Consistente BH volley",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onstabiel" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Stabiele BH volley" },
        ]
      },

      // TACTICAL (8 skills)
      { id: "R2_TAC_CROSSCOURT", pillar: "TACTICAL", category: "Patterns", name: "Crosscourt Rally", description: "Rally't crosscourt",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan niet crosscourt houden" },
          { score: 1, label: "Emerging", observable: "Soms crosscourt" },
          { score: 2, label: "Achieved", observable: "Consistente crosscourt rally" },
        ]
      },
      { id: "R2_TAC_OPEN", pillar: "TACTICAL", category: "Patterns", name: "Open Court", description: "Speelt naar open kant",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Slaat naar tegenstander" },
          { score: 1, label: "Emerging", observable: "Soms naar open kant" },
          { score: 2, label: "Achieved", observable: "Zoekt open kant" },
        ]
      },
      { id: "R2_TAC_DEPTH", pillar: "TACTICAL", category: "Patterns", name: "Depth Awareness", description: "Bewust van diepte",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen bewustzijn" },
          { score: 1, label: "Emerging", observable: "Begint te begrijpen" },
          { score: 2, label: "Achieved", observable: "Probeert diep te spelen" },
        ]
      },
      { id: "R2_TAC_NET", pillar: "TACTICAL", category: "Net Play", name: "Approach Net", description: "Komt naar voren",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Komt nooit naar net" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Komt naar net wanneer logisch" },
        ]
      },
      { id: "R2_TAC_RECOVER", pillar: "TACTICAL", category: "Positioning", name: "Smart Recovery", description: "Slim herstellen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Herstel te traag/verkeerd" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Slim en snel herstel" },
        ]
      },
      { id: "R2_TAC_BUILD", pillar: "TACTICAL", category: "Patterns", name: "Build Point", description: "Bouwt punt op",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Slaat alles hard" },
          { score: 1, label: "Emerging", observable: "Begint te bouwen" },
          { score: 2, label: "Achieved", observable: "Bouwt geduldig punt op" },
        ]
      },
      { id: "R2_TAC_WEAK", pillar: "TACTICAL", category: "Patterns", name: "Attack Weakness", description: "Speelt naar zwakke kant",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen patroon" },
          { score: 1, label: "Emerging", observable: "Soms bewust" },
          { score: 2, label: "Achieved", observable: "Zoekt zwakke kant" },
        ]
      },
      { id: "R2_TAC_SERVE_PLUS", pillar: "TACTICAL", category: "Serve", name: "Serve +1", description: "Serve en volgende slag",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen plan na serve" },
          { score: 1, label: "Emerging", observable: "Soms klaar" },
          { score: 2, label: "Achieved", observable: "Klaar voor +1 slag" },
        ]
      },

      // PHYSICAL (6 skills)
      { id: "R2_PHY_SPEED", pillar: "PHYSICAL", category: "Movement", name: "Court Speed", description: "Snelheid over baan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Te traag" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Snelle beweging" },
        ]
      },
      { id: "R2_PHY_SPLIT", pillar: "PHYSICAL", category: "Movement", name: "Split Step", description: "Consistente split step",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen split step" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Altijd split step" },
        ]
      },
      { id: "R2_PHY_CHANGE", pillar: "PHYSICAL", category: "Movement", name: "Direction Change", description: "Snelle richtingverandering",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Trage verandering" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Snelle richtingverandering" },
        ]
      },
      { id: "R2_PHY_ENDURANCE", pillar: "PHYSICAL", category: "Fitness", name: "45 Min Session", description: "Houdt 45 min vol",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moe binnen 30 min" },
          { score: 1, label: "Emerging", observable: "35-40 min" },
          { score: 2, label: "Achieved", observable: "Actief hele 45 min" },
        ]
      },
      { id: "R2_PHY_RECOVERY", pillar: "PHYSICAL", category: "Movement", name: "Quick Recovery", description: "Snelle herstel na slag",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Blijft staan" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Snelle herstel" },
        ]
      },
      { id: "R2_PHY_SLIDE", pillar: "PHYSICAL", category: "Movement", name: "Slide Steps", description: "Kan glijden/slide steps",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan niet glijden" },
          { score: 1, label: "Emerging", observable: "Probeert" },
          { score: 2, label: "Achieved", observable: "Effectieve slide steps" },
        ]
      },

      // MENTAL (5 skills)
      { id: "R2_MEN_FOCUS_MATCH", pillar: "MENTAL", category: "Focus", name: "Match Focus", description: "Gefocust tijdens wedstrijd",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest focus" },
          { score: 1, label: "Emerging", observable: "Wisselend" },
          { score: 2, label: "Achieved", observable: "Gefocust hele wedstrijd" },
        ]
      },
      { id: "R2_MEN_PRESSURE", pillar: "MENTAL", category: "Resilience", name: "Handles Pressure", description: "Gaat om met druk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkrampt bij druk" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Blijft kalm onder druk" },
        ]
      },
      { id: "R2_MEN_FIGHT", pillar: "MENTAL", category: "Effort", name: "Fighting Spirit", description: "Vecht voor elk punt",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geeft op" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Vecht altijd door" },
        ]
      },
      { id: "R2_MEN_ROUTINE", pillar: "MENTAL", category: "Rituals", name: "Pre-Point Routine", description: "Heeft routine voor punt",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen routine" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Consistente routine" },
        ]
      },
      { id: "R2_MEN_ADAPT", pillar: "MENTAL", category: "Adaptation", name: "Adapts Game", description: "Past spel aan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Blijft hetzelfde doen" },
          { score: 1, label: "Emerging", observable: "Soms aanpassing" },
          { score: 2, label: "Achieved", observable: "Past spel aan op tegenstander" },
        ]
      },

      // SOCIAL (3 skills)
      { id: "R2_SOC_FAIR", pillar: "SOCIAL", category: "Rules", name: "Fair Play", description: "Eerlijk spel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Oneerlijk" },
          { score: 1, label: "Emerging", observable: "Meestal eerlijk" },
          { score: 2, label: "Achieved", observable: "Altijd eerlijk" },
        ]
      },
      { id: "R2_SOC_SHAKE", pillar: "SOCIAL", category: "Etiquette", name: "Shakes Hands", description: "Geeft hand na wedstrijd",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weigert" },
          { score: 1, label: "Emerging", observable: "Met aanmoediging" },
          { score: 2, label: "Achieved", observable: "Altijd hand geven" },
        ]
      },
      { id: "R2_SOC_CALL", pillar: "SOCIAL", category: "Rules", name: "Line Calls", description: "Eerlijke lijncalls",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Maakt foute calls" },
          { score: 1, label: "Emerging", observable: "Meestal eerlijk" },
          { score: 2, label: "Achieved", observable: "Altijd eerlijke calls" },
        ]
      },

      // MATCH (5 skills)
      { id: "R2_MAT_COMPLETE", pillar: "MATCH", category: "Match Play", name: "Complete Match", description: "Speelt complete wedstrijd",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan niet afmaken" },
          { score: 1, label: "Emerging", observable: "Met moeite" },
          { score: 2, label: "Achieved", observable: "Speelt complete wedstrijd" },
        ]
      },
      { id: "R2_MAT_TIEBREAK", pillar: "MATCH", category: "Match Play", name: "Tiebreak", description: "Begrijpt tiebreak",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kent tiebreak niet" },
          { score: 1, label: "Emerging", observable: "Met hulp" },
          { score: 2, label: "Achieved", observable: "Speelt tiebreak zelfstandig" },
        ]
      },
      { id: "R2_MAT_SERVE_GAME", pillar: "MATCH", category: "Match Play", name: "Serve Games", description: "Houdt service games",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest elke service" },
          { score: 1, label: "Emerging", observable: "Soms winnen" },
          { score: 2, label: "Achieved", observable: "Houdt regelmatig service" },
        ]
      },
      { id: "R2_MAT_BREAK", pillar: "MATCH", category: "Match Play", name: "Return Games", description: "Kan service breken",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Breekt nooit" },
          { score: 1, label: "Emerging", observable: "Soms breken" },
          { score: 2, label: "Achieved", observable: "Breekt regelmatig" },
        ]
      },
      { id: "R2_MAT_CLOSE", pillar: "MATCH", category: "Match Play", name: "Closes Match", description: "Kan wedstrijd afsluiten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkrampt bij matchpoint" },
          { score: 1, label: "Emerging", observable: "Soms moeite" },
          { score: 2, label: "Achieved", observable: "Sluit wedstrijd af" },
        ]
      },
    ],
  },

  "RED_1": {
    levelId: "RED_1",
    rank: 1,
    name: "Champion",
    subtitle: "Ready for Orange",
    abilitySnapshot: "Ik ben klaar voor de oranje bal!",
    philosophy: "Alle basis vaardigheden beheerst, klaar voor grotere baan en snellere bal.",
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
      tacticalMinPercent: 70,
      matchMinPercent: 70,
      coachConfirmation: true,
      minSessions: 16,
    },
    skills: [
      // TECHNIQUE - All strokes polished (15 skills)
      { id: "R1_FH_COMPLETE", pillar: "TECHNIQUE", category: "Forehand", name: "Complete Forehand", description: "Volledige forehand techniek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Incompleet" },
          { score: 1, label: "Emerging", observable: "Bijna compleet" },
          { score: 2, label: "Achieved", observable: "Volledige techniek" },
        ]
      },
      { id: "R1_FH_TOPSPIN", pillar: "TECHNIQUE", category: "Forehand", name: "FH Topspin", description: "Consistente topspin forehand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Platte bal" },
          { score: 1, label: "Emerging", observable: "Soms topspin" },
          { score: 2, label: "Achieved", observable: "Consistente topspin" },
        ]
      },
      { id: "R1_FH_CONTROL", pillar: "TECHNIQUE", category: "Forehand", name: "FH Direction Control", description: "Richting controle FH",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen controle" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Volledige richtingscontrole" },
        ]
      },
      { id: "R1_FH_RALLY10", pillar: "TECHNIQUE", category: "Forehand", name: "10 Ball Rally", description: "Kan 10+ ballen rally'en",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Max 5" },
          { score: 1, label: "Emerging", observable: "6-9 ballen" },
          { score: 2, label: "Achieved", observable: "10+ ballen" },
        ]
      },
      { id: "R1_BH_COMPLETE", pillar: "TECHNIQUE", category: "Backhand", name: "Complete Backhand", description: "Volledige backhand techniek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Incompleet" },
          { score: 1, label: "Emerging", observable: "Bijna compleet" },
          { score: 2, label: "Achieved", observable: "Volledige techniek" },
        ]
      },
      { id: "R1_BH_TOPSPIN", pillar: "TECHNIQUE", category: "Backhand", name: "BH Topspin/Slice", description: "Kan topspin en slice",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Alleen plat" },
          { score: 1, label: "Emerging", observable: "Eén van beide" },
          { score: 2, label: "Achieved", observable: "Beide varianten" },
        ]
      },
      { id: "R1_BH_CONTROL", pillar: "TECHNIQUE", category: "Backhand", name: "BH Direction Control", description: "Richting controle BH",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen controle" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Volledige richtingscontrole" },
        ]
      },
      { id: "R1_SV_COMPLETE", pillar: "TECHNIQUE", category: "Serve", name: "Complete Serve", description: "Volledige serve techniek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Incompleet" },
          { score: 1, label: "Emerging", observable: "Bijna compleet" },
          { score: 2, label: "Achieved", observable: "Volledige techniek" },
        ]
      },
      { id: "R1_SV_70PCT", pillar: "TECHNIQUE", category: "Serve", name: "70% First Serve", description: "70%+ eerste serve in",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onder 50%" },
          { score: 1, label: "Emerging", observable: "50-70%" },
          { score: 2, label: "Achieved", observable: "70%+ in" },
        ]
      },
      { id: "R1_SV_SPIN", pillar: "TECHNIQUE", category: "Serve", name: "Serve Spin", description: "Kan spin op serve",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Platte serve" },
          { score: 1, label: "Emerging", observable: "Soms spin" },
          { score: 2, label: "Achieved", observable: "Consistente spin serve" },
        ]
      },
      { id: "R1_VL_COMPLETE", pillar: "TECHNIQUE", category: "Volley", name: "Complete Volley", description: "Volledige volley techniek",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Incompleet" },
          { score: 1, label: "Emerging", observable: "Bijna compleet" },
          { score: 2, label: "Achieved", observable: "Volledige techniek" },
        ]
      },
      { id: "R1_VL_WINNER", pillar: "TECHNIQUE", category: "Volley", name: "Volley Winner", description: "Kan volley winners maken",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen winners" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Maakt volley winners" },
        ]
      },
      { id: "R1_OH_SMASH", pillar: "TECHNIQUE", category: "Overhead", name: "Overhead Smash", description: "Kan smash uitvoeren",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen smash" },
          { score: 1, label: "Emerging", observable: "Basis smash" },
          { score: 2, label: "Achieved", observable: "Effectieve smash" },
        ]
      },
      { id: "R1_DROP_LOB", pillar: "TECHNIQUE", category: "Specialty", name: "Drop & Lob", description: "Kan drop shot en lob",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kent niet" },
          { score: 1, label: "Emerging", observable: "Eén van beide" },
          { score: 2, label: "Achieved", observable: "Beide slagen" },
        ]
      },
      { id: "R1_APPROACH", pillar: "TECHNIQUE", category: "Specialty", name: "Approach Shot", description: "Kan approach shot",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen approach" },
          { score: 1, label: "Emerging", observable: "Probeert" },
          { score: 2, label: "Achieved", observable: "Effectieve approach" },
        ]
      },

      // TACTICAL (10 skills)
      { id: "R1_TAC_PATTERNS", pillar: "TACTICAL", category: "Patterns", name: "Point Patterns", description: "Kent punt patronen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen patronen" },
          { score: 1, label: "Emerging", observable: "Basis patronen" },
          { score: 2, label: "Achieved", observable: "Meerdere patronen" },
        ]
      },
      { id: "R1_TAC_CONSTRUCT", pillar: "TACTICAL", category: "Patterns", name: "Point Construction", description: "Bouwt punt tactisch op",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen opbouw" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Tactische opbouw" },
        ]
      },
      { id: "R1_TAC_MARGIN", pillar: "TACTICAL", category: "Risk", name: "Margin Management", description: "Speelt met marge",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Te risicovol" },
          { score: 1, label: "Emerging", observable: "Soms marge" },
          { score: 2, label: "Achieved", observable: "Goede marge keuzes" },
        ]
      },
      { id: "R1_TAC_SERVE_T", pillar: "TACTICAL", category: "Serve", name: "Serve Tactics", description: "Tactische serve keuzes",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen tactiek" },
          { score: 1, label: "Emerging", observable: "Basis tactiek" },
          { score: 2, label: "Achieved", observable: "Slimme serve keuzes" },
        ]
      },
      { id: "R1_TAC_RETURN", pillar: "TACTICAL", category: "Return", name: "Return Tactics", description: "Tactische return keuzes",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen tactiek" },
          { score: 1, label: "Emerging", observable: "Basis tactiek" },
          { score: 2, label: "Achieved", observable: "Slimme return keuzes" },
        ]
      },
      { id: "R1_TAC_NET_APPROACH", pillar: "TACTICAL", category: "Net Play", name: "Net Approach Timing", description: "Timing naar net",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkeerde timing" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Goede timing" },
        ]
      },
      { id: "R1_TAC_DEFENSE", pillar: "TACTICAL", category: "Defense", name: "Defensive Play", description: "Kan verdedigen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen verdediging" },
          { score: 1, label: "Emerging", observable: "Basis verdediging" },
          { score: 2, label: "Achieved", observable: "Effectieve verdediging" },
        ]
      },
      { id: "R1_TAC_HIGH_BALL", pillar: "TACTICAL", category: "Shot Selection", name: "High Ball Response", description: "Reageert op hoge ballen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moeite met hoge bal" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Goede respons" },
        ]
      },
      { id: "R1_TAC_OPPONENT", pillar: "TACTICAL", category: "Strategy", name: "Reads Opponent", description: "Leest tegenstander",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen observatie" },
          { score: 1, label: "Emerging", observable: "Begint te lezen" },
          { score: 2, label: "Achieved", observable: "Leest tegenstander goed" },
        ]
      },
      { id: "R1_TAC_ADAPT", pillar: "TACTICAL", category: "Strategy", name: "Tactical Adaptation", description: "Past tactiek aan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen aanpassing" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Past tactiek aan" },
        ]
      },

      // PHYSICAL (5 skills)
      { id: "R1_PHY_EXPLOSIVE", pillar: "PHYSICAL", category: "Movement", name: "Explosive Movement", description: "Explosieve beweging",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Trage start" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Explosief" },
        ]
      },
      { id: "R1_PHY_ENDURANCE", pillar: "PHYSICAL", category: "Fitness", name: "60 Min Session", description: "Houdt 60 min vol",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moe binnen 45" },
          { score: 1, label: "Emerging", observable: "50-55 min" },
          { score: 2, label: "Achieved", observable: "Actief hele 60 min" },
        ]
      },
      { id: "R1_PHY_FOOTWORK", pillar: "PHYSICAL", category: "Movement", name: "Advanced Footwork", description: "Gevorderd voetenwerk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Basis voetenwerk" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Gevorderd voetenwerk" },
        ]
      },
      { id: "R1_PHY_BALANCE", pillar: "PHYSICAL", category: "Balance", name: "Dynamic Balance", description: "Dynamische balans",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest balans" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Achieved", observable: "Uitstekende balans" },
        ]
      },
      { id: "R1_PHY_STRETCH", pillar: "PHYSICAL", category: "Reach", name: "Stretch Shots", description: "Kan stretch shots maken",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen stretch shots" },
          { score: 1, label: "Emerging", observable: "Probeert" },
          { score: 2, label: "Achieved", observable: "Effectieve stretch shots" },
        ]
      },

      // MENTAL (5 skills)
      { id: "R1_MEN_COMPETE", pillar: "MENTAL", category: "Competition", name: "Competitive Edge", description: "Competitieve instelling",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen competitiedrang" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Sterke competitiedrang" },
        ]
      },
      { id: "R1_MEN_CLUTCH", pillar: "MENTAL", category: "Pressure", name: "Clutch Performance", description: "Presteert onder druk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkrampt" },
          { score: 1, label: "Emerging", observable: "Soms goed" },
          { score: 2, label: "Achieved", observable: "Presteert in cruciale momenten" },
        ]
      },
      { id: "R1_MEN_MOMENTUM", pillar: "MENTAL", category: "Awareness", name: "Momentum Awareness", description: "Voelt momentum",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen bewustzijn" },
          { score: 1, label: "Emerging", observable: "Begint te voelen" },
          { score: 2, label: "Achieved", observable: "Voelt en gebruikt momentum" },
        ]
      },
      { id: "R1_MEN_PLAN", pillar: "MENTAL", category: "Strategy", name: "Game Plan", description: "Heeft wedstrijdplan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen plan" },
          { score: 1, label: "Emerging", observable: "Basis plan" },
          { score: 2, label: "Achieved", observable: "Duidelijk wedstrijdplan" },
        ]
      },
      { id: "R1_MEN_CONFIDENCE", pillar: "MENTAL", category: "Confidence", name: "Self Confidence", description: "Zelfvertrouwen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen zelfvertrouwen" },
          { score: 1, label: "Emerging", observable: "Wisselend" },
          { score: 2, label: "Achieved", observable: "Gezond zelfvertrouwen" },
        ]
      },

      // SOCIAL (3 skills)
      { id: "R1_SOC_LEADER", pillar: "SOCIAL", category: "Leadership", name: "Leadership", description: "Toont leiderschap",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen leiderschap" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Duidelijk leiderschap" },
        ]
      },
      { id: "R1_SOC_ROLE", pillar: "SOCIAL", category: "Etiquette", name: "Role Model", description: "Voorbeeldfunctie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen voorbeeld" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Goed voorbeeld voor anderen" },
        ]
      },
      { id: "R1_SOC_ETIQUETTE", pillar: "SOCIAL", category: "Etiquette", name: "Full Etiquette", description: "Volledige tennis etiquette",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kent regels niet" },
          { score: 1, label: "Emerging", observable: "Basis regels" },
          { score: 2, label: "Achieved", observable: "Volledige etiquette" },
        ]
      },

      // MATCH (5 skills)
      { id: "R1_MAT_WIN", pillar: "MATCH", category: "Match Play", name: "Wins Matches", description: "Wint wedstrijden",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest meeste wedstrijden" },
          { score: 1, label: "Emerging", observable: "Soms winnen" },
          { score: 2, label: "Achieved", observable: "Wint regelmatig" },
        ]
      },
      { id: "R1_MAT_TOURNEY", pillar: "MATCH", category: "Competition", name: "Tournament Ready", description: "Klaar voor toernooien",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Nog niet klaar" },
          { score: 1, label: "Emerging", observable: "Bijna klaar" },
          { score: 2, label: "Achieved", observable: "Klaar voor toernooien" },
        ]
      },
      { id: "R1_MAT_COMEBACK", pillar: "MATCH", category: "Match Play", name: "Comeback Ability", description: "Kan terugkomen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geeft op bij achterstand" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Achieved", observable: "Komt terug van achterstand" },
        ]
      },
      { id: "R1_MAT_LEAD", pillar: "MATCH", category: "Match Play", name: "Holds Lead", description: "Houdt voorsprong vast",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verliest vaak voorsprong" },
          { score: 1, label: "Emerging", observable: "Soms vast" },
          { score: 2, label: "Achieved", observable: "Houdt voorsprong" },
        ]
      },
      { id: "R1_MAT_ORANGE_READY", pillar: "MATCH", category: "Readiness", name: "Orange Ready", description: "Klaar voor Orange",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Nog niet klaar" },
          { score: 1, label: "Emerging", observable: "Bijna klaar" },
          { score: 2, label: "Achieved", observable: "Volledig klaar voor Orange" },
        ]
      },
    ],
  },
};

// Helper functions
export function getOrderedRedLevelIds(): string[] {
  return ["RED_3", "RED_2", "RED_1"];
}

export function getRedSkillsByPillar(levelId: string, pillar: string): RedSkill[] {
  const level = RED_STAGE_SKILLS_BY_LEVEL[levelId];
  if (!level) return [];
  return level.skills.filter(s => s.pillar === pillar.toUpperCase());
}

export function countRedSkillsPerLevel(levelId: string): number {
  const level = RED_STAGE_SKILLS_BY_LEVEL[levelId];
  return level ? level.skills.length : 0;
}

export function getRedPillarWeighting(levelId: string): PillarWeighting | null {
  const level = RED_STAGE_SKILLS_BY_LEVEL[levelId];
  return level ? level.pillarWeighting : null;
}
