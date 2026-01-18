/**
 * BLUE STAGE Skills - Foundation (ages 2-4)
 * 
 * Blue 3 → Blue 2 → Blue 1
 * Focus: body control, listening, fun, basic coordination
 * NO real tennis strokes - just pre-technique
 * 
 * Scoring: OBSERVED / NOT YET (simplified for toddlers)
 */

interface SkillRubric {
  score: number;
  label: string;
  observable: string;
}

interface BlueSkill {
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
  physicalMinPercent?: number;
  mentalMinPercent?: number;
  socialMinPercent?: number;
  coachConfirmation?: boolean;
  parentAgreement?: boolean;
}

interface BlueLevelConfig {
  levelId: string;
  rank: number;
  name: string;
  subtitle: string;
  abilitySnapshot: string;
  philosophy: string;
  pillarWeighting: PillarWeighting;
  promotionRequirements: PromotionRequirements;
  skills: BlueSkill[];
}

export const BLUE_STAGE_SKILLS_BY_LEVEL: Record<string, BlueLevelConfig> = {
  "BLUE_3": {
    levelId: "BLUE_3",
    rank: 3,
    name: "Explorer",
    subtitle: "Exploration & Safety",
    abilitySnapshot: "Ik leer spelen en heb plezier!",
    philosophy: "Doel: veilig op de baan, kan meedoen, begrijpt basisstructuur.",
    pillarWeighting: {
      technique: 10,
      tactical: 5,
      physical: 35,
      mental: 25,
      social: 20,
      match: 5,
    },
    promotionRequirements: {
      physicalMinPercent: 70,
      mentalMinPercent: 60,
      socialMinPercent: 60,
      coachConfirmation: true,
    },
    skills: [
      // PRE-TECHNIQUE (10 checks)
      { id: "B3_HOLD_RACKET", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Holds Racket", description: "Houdt racket vast (op eigen manier)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan racket niet vasthouden" },
          { score: 1, label: "Emerging", observable: "Houdt racket maar laat vaak vallen" },
          { score: 2, label: "Observed", observable: "Houdt racket vast zonder gooien" },
        ]
      },
      { id: "B3_CARRY_RACKET", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Carries Racket", description: "Kan racket meenemen zonder gooien",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Gooit racket of sleept het" },
          { score: 1, label: "Emerging", observable: "Draagt racket maar onhandig" },
          { score: 2, label: "Observed", observable: "Draagt racket netjes mee" },
        ]
      },
      { id: "B3_HIT_BALL", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Hits Ball", description: "Raakt bal met racket (ongecontroleerd ok)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Mist bal volledig" },
          { score: 1, label: "Emerging", observable: "Raakt bal soms" },
          { score: 2, label: "Observed", observable: "Raakt bal regelmatig" },
        ]
      },
      { id: "B3_TRY_SWING", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Tries to Swing", description: "Probeert te slaan (imitatie)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen poging tot swingen" },
          { score: 1, label: "Emerging", observable: "Probeert soms swing na te doen" },
          { score: 2, label: "Observed", observable: "Imiteert swing beweging" },
        ]
      },
      { id: "B3_ROLL_BALL", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Rolls Ball", description: "Kan bal rollen met racket",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan bal niet rollen" },
          { score: 1, label: "Emerging", observable: "Rolt bal soms" },
          { score: 2, label: "Observed", observable: "Rolt bal gecontroleerd" },
        ]
      },
      { id: "B3_PICKUP_BALL", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Picks Up Ball", description: "Kan bal oppakken en neerleggen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan bal niet oppakken" },
          { score: 1, label: "Emerging", observable: "Pakt bal op met moeite" },
          { score: 2, label: "Observed", observable: "Pakt bal netjes op" },
        ]
      },
      { id: "B3_THROW_ONE_HAND", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Throws One Hand", description: "Gooit bal met 1 hand",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan niet gooien met 1 hand" },
          { score: 1, label: "Emerging", observable: "Gooit maar ongecontroleerd" },
          { score: 2, label: "Observed", observable: "Gooit bal met 1 hand" },
        ]
      },
      { id: "B3_BOUNCE_BALL", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Bounces Ball", description: "Kan bal laten stuiteren (1x)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan bal niet stuiteren" },
          { score: 1, label: "Emerging", observable: "Stuiter soms 1x" },
          { score: 2, label: "Observed", observable: "Stuiter bal 1x consistent" },
        ]
      },
      { id: "B3_CATCH_TWO_HANDS", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Catches Two Hands", description: "Kan bal vangen met 2 handen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Vangt bal niet" },
          { score: 1, label: "Emerging", observable: "Vangt soms met hulp" },
          { score: 2, label: "Observed", observable: "Vangt bal met 2 handen" },
        ]
      },
      { id: "B3_COPY_INSTRUCTION", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Copies Instruction", description: "Probeert instructie na te doen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Doet niets na" },
          { score: 1, label: "Emerging", observable: "Probeert soms" },
          { score: 2, label: "Observed", observable: "Doet instructie na" },
        ]
      },

      // TACTICAL - Space & Direction (10 checks)
      { id: "B3_KNOWS_COURT", pillar: "TACTICAL", category: "Space", name: "Knows Court Area", description: "Weet waar 'binnen de baan' is",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Loopt overal" },
          { score: 1, label: "Emerging", observable: "Begint grenzen te herkennen" },
          { score: 2, label: "Observed", observable: "Blijft binnen speelgebied" },
        ]
      },
      { id: "B3_KNOWS_NET", pillar: "TACTICAL", category: "Space", name: "Recognizes Net", description: "Herkent 'net'",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kent net niet" },
          { score: 1, label: "Emerging", observable: "Wijst naar net" },
          { score: 2, label: "Observed", observable: "Herkent en noemt net" },
        ]
      },
      { id: "B3_FORWARD_BALL", pillar: "TACTICAL", category: "Direction", name: "Forward Ball", description: "Kan bal naar voren sturen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Bal gaat alle kanten op" },
          { score: 1, label: "Emerging", observable: "Soms naar voren" },
          { score: 2, label: "Observed", observable: "Stuurt bal vooruit" },
        ]
      },
      { id: "B3_TURN_TAKING", pillar: "TACTICAL", category: "Rules", name: "Turn Taking", description: "Begrijpt 'mijn beurt / jouw beurt'",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wacht niet op beurt" },
          { score: 1, label: "Emerging", observable: "Wacht soms" },
          { score: 2, label: "Observed", observable: "Begrijpt beurten" },
        ]
      },
      { id: "B3_WAIT_SIGNAL", pillar: "TACTICAL", category: "Rules", name: "Waits for Signal", description: "Kan wachten op signaal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Start zonder signaal" },
          { score: 1, label: "Emerging", observable: "Wacht soms" },
          { score: 2, label: "Observed", observable: "Wacht op start signaal" },
        ]
      },
      { id: "B3_START_STOP", pillar: "TACTICAL", category: "Rules", name: "Start & Stop", description: "Herkent start & stop",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Reageert niet op commando's" },
          { score: 1, label: "Emerging", observable: "Reageert soms" },
          { score: 2, label: "Observed", observable: "Start en stopt op commando" },
        ]
      },
      { id: "B3_WALK_TARGET", pillar: "TACTICAL", category: "Movement", name: "Walks to Target", description: "Kan naar target lopen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Loopt verkeerde kant op" },
          { score: 1, label: "Emerging", observable: "Vindt target soms" },
          { score: 2, label: "Observed", observable: "Loopt naar aangegeven target" },
        ]
      },
      { id: "B3_OVER_NET", pillar: "TACTICAL", category: "Understanding", name: "Over Net Concept", description: "Begrijpt 'over het net'",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen begrip" },
          { score: 1, label: "Emerging", observable: "Begint te begrijpen" },
          { score: 2, label: "Observed", observable: "Probeert bal over net te krijgen" },
        ]
      },
      { id: "B3_FOLLOW_ROUTE", pillar: "TACTICAL", category: "Movement", name: "Follows Route", description: "Volgt simpele route",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Volgt route niet" },
          { score: 1, label: "Emerging", observable: "Volgt deel van route" },
          { score: 2, label: "Observed", observable: "Volgt aangewezen route" },
        ]
      },
      { id: "B3_STAY_ZONE", pillar: "TACTICAL", category: "Space", name: "Stays in Zone", description: "Blijft in speelzone",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Loopt weg uit zone" },
          { score: 1, label: "Emerging", observable: "Blijft meestal in zone" },
          { score: 2, label: "Observed", observable: "Blijft in aangewezen zone" },
        ]
      },

      // PHYSICAL - Motor Skills (15 checks - MOST IMPORTANT for Blue)
      { id: "B3_RUNS", pillar: "PHYSICAL", category: "Locomotion", name: "Runs Without Falling", description: "Rent zonder te vallen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Valt vaak bij rennen" },
          { score: 1, label: "Emerging", observable: "Rent maar wankel" },
          { score: 2, label: "Observed", observable: "Rent stabiel" },
        ]
      },
      { id: "B3_STOPS_SIGNAL", pillar: "PHYSICAL", category: "Control", name: "Stops on Signal", description: "Kan stoppen op signaal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Stopt niet op signaal" },
          { score: 1, label: "Emerging", observable: "Stopt soms" },
          { score: 2, label: "Observed", observable: "Stopt direct op signaal" },
        ]
      },
      { id: "B3_JUMP_TWO_FEET", pillar: "PHYSICAL", category: "Jumping", name: "Jumps Two Feet", description: "Springt met 2 voeten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan niet springen" },
          { score: 1, label: "Emerging", observable: "Springt maar ongecontroleerd" },
          { score: 2, label: "Observed", observable: "Springt met 2 voeten" },
        ]
      },
      { id: "B3_JUMP_FORWARD", pillar: "PHYSICAL", category: "Jumping", name: "Jumps Forward", description: "Springt vooruit",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Springt niet vooruit" },
          { score: 1, label: "Emerging", observable: "Klein sprongetje" },
          { score: 2, label: "Observed", observable: "Springt duidelijk vooruit" },
        ]
      },
      { id: "B3_TURNS", pillar: "PHYSICAL", category: "Control", name: "Turns Around", description: "Draait om as",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan niet draaien" },
          { score: 1, label: "Emerging", observable: "Draait met moeite" },
          { score: 2, label: "Observed", observable: "Draait vloeiend" },
        ]
      },
      { id: "B3_CLIMBS", pillar: "PHYSICAL", category: "Gross Motor", name: "Climbs Safely", description: "Klimt veilig",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Klimt niet veilig" },
          { score: 1, label: "Emerging", observable: "Klimt met hulp" },
          { score: 2, label: "Observed", observable: "Klimt zelfstandig en veilig" },
        ]
      },
      { id: "B3_THROW_OVERHAND", pillar: "PHYSICAL", category: "Throwing", name: "Throws Overhand", description: "Gooit overhands",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan niet overhands gooien" },
          { score: 1, label: "Emerging", observable: "Probeert overhands" },
          { score: 2, label: "Observed", observable: "Gooit overhands" },
        ]
      },
      { id: "B3_THROW_UNDERHAND", pillar: "PHYSICAL", category: "Throwing", name: "Throws Underhand", description: "Gooit onderhands",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan niet onderhands gooien" },
          { score: 1, label: "Emerging", observable: "Probeert onderhands" },
          { score: 2, label: "Observed", observable: "Gooit onderhands" },
        ]
      },
      { id: "B3_CRAWL_ROLL", pillar: "PHYSICAL", category: "Gross Motor", name: "Crawls & Rolls", description: "Kan kruipen / rollen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kruipt/rolt niet" },
          { score: 1, label: "Emerging", observable: "Kruipt of rolt basis" },
          { score: 2, label: "Observed", observable: "Kruipt en rolt goed" },
        ]
      },
      { id: "B3_CARRY_BALL", pillar: "PHYSICAL", category: "Control", name: "Carries Ball", description: "Kan bal dragen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Laat bal steeds vallen" },
          { score: 1, label: "Emerging", observable: "Draagt bal kort" },
          { score: 2, label: "Observed", observable: "Draagt bal zonder vallen" },
        ]
      },
      { id: "B3_BALANCE_ONE_LEG", pillar: "PHYSICAL", category: "Balance", name: "Balance One Leg", description: "Evenwicht op 1 voet (1-2 sec)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan niet op 1 been staan" },
          { score: 1, label: "Emerging", observable: "1 seconde max" },
          { score: 2, label: "Observed", observable: "1-2 seconden stabiel" },
        ]
      },
      { id: "B3_WALK_LINE", pillar: "PHYSICAL", category: "Balance", name: "Walks on Line", description: "Kan op lijn lopen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Stapt naast lijn" },
          { score: 1, label: "Emerging", observable: "Volgt lijn deels" },
          { score: 2, label: "Observed", observable: "Loopt op de lijn" },
        ]
      },
      { id: "B3_SQUAT_STAND", pillar: "PHYSICAL", category: "Gross Motor", name: "Squats & Stands", description: "Kan hurken en opstaan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Valt om bij hurken" },
          { score: 1, label: "Emerging", observable: "Hurkt met moeite" },
          { score: 2, label: "Observed", observable: "Hurkt en staat vloeiend op" },
        ]
      },
      { id: "B3_MOVE_SIDEWAYS", pillar: "PHYSICAL", category: "Locomotion", name: "Moves Sideways", description: "Beweegt zijwaarts",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Beweegt niet zijwaarts" },
          { score: 1, label: "Emerging", observable: "Stapjes zijwaarts" },
          { score: 2, label: "Observed", observable: "Shufflet zijwaarts" },
        ]
      },
      { id: "B3_REACTS_VISUAL", pillar: "PHYSICAL", category: "Reaction", name: "Reacts to Visual", description: "Reageert op visuele prikkel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Reageert niet" },
          { score: 1, label: "Emerging", observable: "Vertraagde reactie" },
          { score: 2, label: "Observed", observable: "Directe reactie op visueel" },
        ]
      },

      // MENTAL - Attention & Emotion (10 checks)
      { id: "B3_STAYS_5MIN", pillar: "MENTAL", category: "Focus", name: "Stays 5-10 min", description: "Blijft 5-10 min betrokken",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Loopt weg binnen 2 min" },
          { score: 1, label: "Emerging", observable: "3-5 min betrokken" },
          { score: 2, label: "Observed", observable: "5-10 min gefocust" },
        ]
      },
      { id: "B3_RESPONDS_NAME", pillar: "MENTAL", category: "Attention", name: "Responds to Name", description: "Reageert op naam",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Reageert niet op naam" },
          { score: 1, label: "Emerging", observable: "Reageert soms" },
          { score: 2, label: "Observed", observable: "Kijkt op bij naam" },
        ]
      },
      { id: "B3_ACCEPTS_GUIDANCE", pillar: "MENTAL", category: "Coachability", name: "Accepts Guidance", description: "Accepteert begeleiding",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weigert hulp" },
          { score: 1, label: "Emerging", observable: "Accepteert soms" },
          { score: 2, label: "Observed", observable: "Laat zich begeleiden" },
        ]
      },
      { id: "B3_TRIES_AGAIN", pillar: "MENTAL", category: "Resilience", name: "Tries Again", description: "Probeert opnieuw na mislukking",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geeft meteen op" },
          { score: 1, label: "Emerging", observable: "Probeert met aanmoediging" },
          { score: 2, label: "Observed", observable: "Probeert zelfstandig opnieuw" },
        ]
      },
      { id: "B3_POSITIVE_SUCCESS", pillar: "MENTAL", category: "Emotion", name: "Positive at Success", description: "Reageert positief op succes",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen reactie" },
          { score: 1, label: "Emerging", observable: "Kleine vreugde" },
          { score: 2, label: "Observed", observable: "Blij bij succes" },
        ]
      },
      { id: "B3_HANDLES_FRUSTRATION", pillar: "MENTAL", category: "Emotion", name: "Handles Frustration", description: "Kan korte frustratie reguleren",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Meltdown bij frustratie" },
          { score: 1, label: "Emerging", observable: "Kalmeert met hulp" },
          { score: 2, label: "Observed", observable: "Herstelt zelf kort" },
        ]
      },
      { id: "B3_FOLLOWS_1_STEP", pillar: "MENTAL", category: "Instructions", name: "Follows 1-Step", description: "Volgt 1-staps instructie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Begrijpt instructie niet" },
          { score: 1, label: "Emerging", observable: "Volgt met herhaling" },
          { score: 2, label: "Observed", observable: "Volgt 1-staps direct" },
        ]
      },
      { id: "B3_ACCEPTS_CORRECTION", pillar: "MENTAL", category: "Coachability", name: "Accepts Correction", description: "Laat zich corrigeren",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weigert correctie" },
          { score: 1, label: "Emerging", observable: "Accepteert met moeite" },
          { score: 2, label: "Observed", observable: "Accepteert correctie rustig" },
        ]
      },
      { id: "B3_CURIOUS", pillar: "MENTAL", category: "Attitude", name: "Shows Curiosity", description: "Toont nieuwsgierigheid",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen interesse" },
          { score: 1, label: "Emerging", observable: "Soms geïnteresseerd" },
          { score: 2, label: "Observed", observable: "Actief nieuwsgierig" },
        ]
      },
      { id: "B3_TRIES_NEW", pillar: "MENTAL", category: "Attitude", name: "Tries New Things", description: "Durft nieuwe dingen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weigert nieuwe dingen" },
          { score: 1, label: "Emerging", observable: "Probeert met aanmoediging" },
          { score: 2, label: "Observed", observable: "Durft zelfstandig te proberen" },
        ]
      },

      // SOCIAL - Group Behavior (10 checks)
      { id: "B3_PLAYS_ALONGSIDE", pillar: "SOCIAL", category: "Group", name: "Plays Alongside", description: "Speelt naast andere kinderen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Isoleert zich" },
          { score: 1, label: "Emerging", observable: "Blijft in buurt" },
          { score: 2, label: "Observed", observable: "Speelt naast anderen" },
        ]
      },
      { id: "B3_WAITS_TURN_SHORT", pillar: "SOCIAL", category: "Rules", name: "Waits Turn (short)", description: "Wacht op beurt (kort)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wacht niet" },
          { score: 1, label: "Emerging", observable: "Wacht even" },
          { score: 2, label: "Observed", observable: "Wacht geduldig kort" },
        ]
      },
      { id: "B3_SHARES_MATERIAL", pillar: "SOCIAL", category: "Sharing", name: "Shares Material", description: "Accepteert delen materiaal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Deelt niet" },
          { score: 1, label: "Emerging", observable: "Deelt met aanmoediging" },
          { score: 2, label: "Observed", observable: "Deelt vrijwillig" },
        ]
      },
      { id: "B3_RESPECTS_SPACE", pillar: "SOCIAL", category: "Behavior", name: "Respects Space", description: "Respecteert persoonlijke ruimte",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Duwt/botst constant" },
          { score: 1, label: "Emerging", observable: "Soms te dichtbij" },
          { score: 2, label: "Observed", observable: "Houdt afstand" },
        ]
      },
      { id: "B3_FOLLOWS_GROUP", pillar: "SOCIAL", category: "Group", name: "Follows Group", description: "Volgt groepsritme",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Doet eigen ding" },
          { score: 1, label: "Emerging", observable: "Volgt soms" },
          { score: 2, label: "Observed", observable: "Volgt groep mee" },
        ]
      },
      { id: "B3_EYE_CONTACT", pillar: "SOCIAL", category: "Communication", name: "Makes Eye Contact", description: "Maakt oogcontact",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Vermijdt oogcontact" },
          { score: 1, label: "Emerging", observable: "Kort oogcontact" },
          { score: 2, label: "Observed", observable: "Normaal oogcontact" },
        ]
      },
      { id: "B3_IMITATES_COACH", pillar: "SOCIAL", category: "Learning", name: "Imitates Coach", description: "Imiteert coach",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Imiteert niet" },
          { score: 1, label: "Emerging", observable: "Imiteert soms" },
          { score: 2, label: "Observed", observable: "Imiteert actief" },
        ]
      },
      { id: "B3_CHEERS", pillar: "SOCIAL", category: "Participation", name: "Cheers Along", description: "Klapt / juicht mee",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen participatie" },
          { score: 1, label: "Emerging", observable: "Doet soms mee" },
          { score: 2, label: "Observed", observable: "Juicht enthousiast mee" },
        ]
      },
      { id: "B3_ACCEPTS_NO", pillar: "SOCIAL", category: "Behavior", name: "Accepts 'No'", description: "Accepteert 'nee'",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Huilt/woede bij nee" },
          { score: 1, label: "Emerging", observable: "Accepteert met moeite" },
          { score: 2, label: "Observed", observable: "Accepteert rustig" },
        ]
      },
      { id: "B3_SAFE_WITH_COACH", pillar: "SOCIAL", category: "Trust", name: "Safe with Coach", description: "Voelt zich veilig bij coach",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Angstig bij coach" },
          { score: 1, label: "Emerging", observable: "Wenst af en toe" },
          { score: 2, label: "Observed", observable: "Comfortabel bij coach" },
        ]
      },

      // MATCH/GAME - Play Based (5 checks)
      { id: "B3_JOINS_GAME", pillar: "MATCH", category: "Participation", name: "Joins Game", description: "Doet mee aan spel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weigert mee te doen" },
          { score: 1, label: "Emerging", observable: "Doet kort mee" },
          { score: 2, label: "Observed", observable: "Doet volledig mee" },
        ]
      },
      { id: "B3_FOLLOWS_RULE", pillar: "MATCH", category: "Rules", name: "Follows Game Rule", description: "Volgt spelregel 30 sec",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Volgt geen regels" },
          { score: 1, label: "Emerging", observable: "Volgt kort" },
          { score: 2, label: "Observed", observable: "Volgt 30+ sec" },
        ]
      },
      { id: "B3_ENDS_NO_ANGER", pillar: "MATCH", category: "Emotion", name: "Ends Without Anger", description: "Eindigt spel zonder boosheid",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Boos bij einde" },
          { score: 1, label: "Emerging", observable: "Soms gefrustreerd" },
          { score: 2, label: "Observed", observable: "Accepteert einde rustig" },
        ]
      },
      { id: "B3_FUN", pillar: "MATCH", category: "Attitude", name: "Has Fun", description: "Vindt tennis 'leuk'",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Lijkt niet te genieten" },
          { score: 1, label: "Emerging", observable: "Soms plezier" },
          { score: 2, label: "Observed", observable: "Heeft duidelijk plezier" },
        ]
      },
      { id: "B3_WANTS_RETURN", pillar: "MATCH", category: "Attitude", name: "Wants to Return", description: "Wil terugkomen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Wil niet terug" },
          { score: 1, label: "Emerging", observable: "Neutraal" },
          { score: 2, label: "Observed", observable: "Vraagt wanneer weer tennis" },
        ]
      },
    ],
  },

  "BLUE_2": {
    levelId: "BLUE_2",
    rank: 2,
    name: "Discoverer",
    subtitle: "Structured Play & Control",
    abilitySnapshot: "Ik kan de bal raken en er naartoe bewegen.",
    philosophy: "Meer structuur, nog steeds spel. Meer herhaling, luisteren, zelfcontrole.",
    pillarWeighting: {
      technique: 15,
      tactical: 10,
      physical: 30,
      mental: 25,
      social: 15,
      match: 5,
    },
    promotionRequirements: {
      physicalMinPercent: 75,
      mentalMinPercent: 70,
      socialMinPercent: 70,
      coachConfirmation: true,
      parentAgreement: true,
    },
    skills: [
      // PRE-TECHNIQUE (8 checks)
      { id: "B2_CONSCIOUS_HIT", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Conscious Hit", description: "Slaat bewust (niet random)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Zwaait random" },
          { score: 1, label: "Emerging", observable: "Probeert bewust" },
          { score: 2, label: "Observed", observable: "Bewuste slagpoging" },
        ]
      },
      { id: "B2_DIRECTION_TRY", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Direction Try", description: "Probeert richting te geven",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen richtingsgevoel" },
          { score: 1, label: "Emerging", observable: "Soms richting" },
          { score: 2, label: "Observed", observable: "Probeert naar doel" },
        ]
      },
      { id: "B2_BALL_RACKET_CONTROL", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Ball-Racket Control", description: "Bal > racket controle",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen controle" },
          { score: 1, label: "Emerging", observable: "Soms controle" },
          { score: 2, label: "Observed", observable: "Basis bal-racket controle" },
        ]
      },
      { id: "B2_BOUNCES_MULTIPLE", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Bounces Multiple", description: "Kan bal 3x+ stuiteren",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Max 1 stuiter" },
          { score: 1, label: "Emerging", observable: "2 stuiters" },
          { score: 2, label: "Observed", observable: "3+ stuiters achtereen" },
        ]
      },
      { id: "B2_CATCHES_BOUNCE", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Catches After Bounce", description: "Vangt bal na stuiter",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Vangt niet na stuiter" },
          { score: 1, label: "Emerging", observable: "Soms na stuiter" },
          { score: 2, label: "Observed", observable: "Vangt consistent na stuiter" },
        ]
      },
      { id: "B2_BALANCED_SWING", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Balanced Swing", description: "Houdt balans tijdens swing",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Valt om bij swing" },
          { score: 1, label: "Emerging", observable: "Wankelt" },
          { score: 2, label: "Observed", observable: "Blijft in balans" },
        ]
      },
      { id: "B2_GRIP_STABLE", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Grip Stable", description: "Grip blijft stabiel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Grip verandert constant" },
          { score: 1, label: "Emerging", observable: "Meestal stabiel" },
          { score: 2, label: "Observed", observable: "Houdt grip vast" },
        ]
      },
      { id: "B2_SEQUENCE_COPY", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Copies Sequence", description: "Kan 2-staps beweging kopiëren",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan sequence niet volgen" },
          { score: 1, label: "Emerging", observable: "1 stap goed" },
          { score: 2, label: "Observed", observable: "2-staps sequence correct" },
        ]
      },

      // PHYSICAL (10 checks)
      { id: "B2_BETTER_BALANCE", pillar: "PHYSICAL", category: "Balance", name: "Better Balance", description: "Betere balans (3 sec 1 been)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Max 1-2 sec" },
          { score: 1, label: "Emerging", observable: "2-3 sec" },
          { score: 2, label: "Observed", observable: "3+ sec op 1 been" },
        ]
      },
      { id: "B2_START_STOP_FAST", pillar: "PHYSICAL", category: "Control", name: "Start/Stop Fast", description: "Start/stop sneller",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Trage reactie" },
          { score: 1, label: "Emerging", observable: "Verbeterd" },
          { score: 2, label: "Observed", observable: "Snelle start/stop" },
        ]
      },
      { id: "B2_HAND_EYE", pillar: "PHYSICAL", category: "Coordination", name: "Hand-Eye Coord", description: "Oog-hand coördinatie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Slechte coördinatie" },
          { score: 1, label: "Emerging", observable: "Verbeterend" },
          { score: 2, label: "Observed", observable: "Goede oog-hand" },
        ]
      },
      { id: "B2_RUNS_STABLE", pillar: "PHYSICAL", category: "Locomotion", name: "Runs Stable", description: "Rent stabiel en snel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Nog wankel" },
          { score: 1, label: "Emerging", observable: "Stabieler" },
          { score: 2, label: "Observed", observable: "Stabiel en snel" },
        ]
      },
      { id: "B2_JUMP_LAND", pillar: "PHYSICAL", category: "Jumping", name: "Jumps & Lands", description: "Springt en landt veilig",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onveilige landing" },
          { score: 1, label: "Emerging", observable: "Meestal veilig" },
          { score: 2, label: "Observed", observable: "Gecontroleerde landing" },
        ]
      },
      { id: "B2_SHUFFLE_STEPS", pillar: "PHYSICAL", category: "Locomotion", name: "Shuffle Steps", description: "Kan shuffle stappen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen shuffle" },
          { score: 1, label: "Emerging", observable: "Basis shuffle" },
          { score: 2, label: "Observed", observable: "Vloeiende shuffle" },
        ]
      },
      { id: "B2_MOVES_TO_BALL", pillar: "PHYSICAL", category: "Reaction", name: "Moves to Ball", description: "Beweegt naar de bal toe",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Blijft staan" },
          { score: 1, label: "Emerging", observable: "Soms beweging" },
          { score: 2, label: "Observed", observable: "Beweegt actief naar bal" },
        ]
      },
      { id: "B2_THROW_AIM", pillar: "PHYSICAL", category: "Throwing", name: "Throw with Aim", description: "Gooit met richtingsgevoel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Random richting" },
          { score: 1, label: "Emerging", observable: "Probeert richting" },
          { score: 2, label: "Observed", observable: "Gooit naar doel" },
        ]
      },
      { id: "B2_ENDURANCE_15", pillar: "PHYSICAL", category: "Endurance", name: "15 Min Session", description: "Houdt 15 min vol",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moe binnen 10 min" },
          { score: 1, label: "Emerging", observable: "10-15 min" },
          { score: 2, label: "Observed", observable: "Actief hele 15 min" },
        ]
      },
      { id: "B2_AGILITY_BASIC", pillar: "PHYSICAL", category: "Agility", name: "Basic Agility", description: "Basis beweeglijkheid",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Stijf/onhandig" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Observed", observable: "Beweeglijk" },
        ]
      },

      // MENTAL (8 checks)
      { id: "B2_FOCUS_15", pillar: "MENTAL", category: "Focus", name: "Focus 10-15 min", description: "10-15 min focus",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Max 5 min" },
          { score: 1, label: "Emerging", observable: "5-10 min" },
          { score: 2, label: "Observed", observable: "10-15 min gefocust" },
        ]
      },
      { id: "B2_TWO_STEP_INST", pillar: "MENTAL", category: "Instructions", name: "2-Step Instructions", description: "Volgt 2-staps instructies",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Alleen 1 stap" },
          { score: 1, label: "Emerging", observable: "Soms 2 stappen" },
          { score: 2, label: "Observed", observable: "2 stappen consistent" },
        ]
      },
      { id: "B2_LESS_MELTDOWN", pillar: "MENTAL", category: "Emotion", name: "Less Meltdowns", description: "Minder meltdowns",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Nog frequent" },
          { score: 1, label: "Emerging", observable: "Verminderd" },
          { score: 2, label: "Observed", observable: "Zeldzaam" },
        ]
      },
      { id: "B2_WAITS_PATIENTLY", pillar: "MENTAL", category: "Self-Control", name: "Waits Patiently", description: "Wacht geduldig",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Ongeduldig" },
          { score: 1, label: "Emerging", observable: "Kort geduldig" },
          { score: 2, label: "Observed", observable: "Geduldig wachten" },
        ]
      },
      { id: "B2_SELF_CORRECT", pillar: "MENTAL", category: "Learning", name: "Self-Corrects", description: "Corrigeert zichzelf",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen zelfcorrectie" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Observed", observable: "Probeert zelf te verbeteren" },
        ]
      },
      { id: "B2_REMEMBERS_RULES", pillar: "MENTAL", category: "Memory", name: "Remembers Rules", description: "Onthoudt spelregels",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Vergeet regels" },
          { score: 1, label: "Emerging", observable: "Onthoudt basis" },
          { score: 2, label: "Observed", observable: "Kent de regels" },
        ]
      },
      { id: "B2_POSITIVE_ATTITUDE", pillar: "MENTAL", category: "Attitude", name: "Positive Attitude", description: "Positieve houding",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Negatief" },
          { score: 1, label: "Emerging", observable: "Wisselend" },
          { score: 2, label: "Observed", observable: "Overwegend positief" },
        ]
      },
      { id: "B2_CELEBRATES", pillar: "MENTAL", category: "Emotion", name: "Celebrates Success", description: "Viert succes",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen reactie" },
          { score: 1, label: "Emerging", observable: "Kleine vreugde" },
          { score: 2, label: "Observed", observable: "Viert actief" },
        ]
      },

      // SOCIAL (8 checks)
      { id: "B2_FINISHES_GAME", pillar: "SOCIAL", category: "Participation", name: "Finishes Game", description: "Maakt spel samen af",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Stopt halverwege" },
          { score: 1, label: "Emerging", observable: "Meestal" },
          { score: 2, label: "Observed", observable: "Speelt spel helemaal" },
        ]
      },
      { id: "B2_ACCEPTS_RULES", pillar: "SOCIAL", category: "Rules", name: "Accepts Rules", description: "Accepteert spelregels",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weigert regels" },
          { score: 1, label: "Emerging", observable: "Accepteert meestal" },
          { score: 2, label: "Observed", observable: "Volgt alle regels" },
        ]
      },
      { id: "B2_POSITIVE_GROUP", pillar: "SOCIAL", category: "Group", name: "Positive Group Interaction", description: "Positieve groepsinteractie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Negatief in groep" },
          { score: 1, label: "Emerging", observable: "Wisselend" },
          { score: 2, label: "Observed", observable: "Positief in groep" },
        ]
      },
      { id: "B2_HELPS_OTHERS", pillar: "SOCIAL", category: "Cooperation", name: "Helps Others", description: "Helpt andere kinderen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Helpt niet" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Observed", observable: "Helpt spontaan" },
        ]
      },
      { id: "B2_TAKES_TURNS", pillar: "SOCIAL", category: "Rules", name: "Takes Turns Well", description: "Wacht netjes op beurt",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Dringt voor" },
          { score: 1, label: "Emerging", observable: "Meestal" },
          { score: 2, label: "Observed", observable: "Wacht altijd netjes" },
        ]
      },
      { id: "B2_LISTENS_COACH", pillar: "SOCIAL", category: "Respect", name: "Listens to Coach", description: "Luistert naar coach",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Negeert coach" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Observed", observable: "Luistert aandachtig" },
        ]
      },
      { id: "B2_NO_AGGRESSION", pillar: "SOCIAL", category: "Behavior", name: "No Aggression", description: "Geen agressief gedrag",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Slaat/duwt anderen" },
          { score: 1, label: "Emerging", observable: "Zelden" },
          { score: 2, label: "Observed", observable: "Nooit agressief" },
        ]
      },
      { id: "B2_FRIENDLY", pillar: "SOCIAL", category: "Attitude", name: "Friendly Attitude", description: "Vriendelijke houding",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Onvriendelijk" },
          { score: 1, label: "Emerging", observable: "Wisselend" },
          { score: 2, label: "Observed", observable: "Vriendelijk" },
        ]
      },

      // MATCH (5 checks)
      { id: "B2_MINI_RALLY", pillar: "MATCH", category: "Play", name: "Mini Rally", description: "Kan mini rally maken (2-3 ballen)",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen rally" },
          { score: 1, label: "Emerging", observable: "1-2 ballen" },
          { score: 2, label: "Observed", observable: "2-3 ballen rally" },
        ]
      },
      { id: "B2_FOLLOWS_GAME_LONGER", pillar: "MATCH", category: "Focus", name: "Follows Game Longer", description: "Volgt spel langer",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Korte aandacht" },
          { score: 1, label: "Emerging", observable: "1-2 minuten" },
          { score: 2, label: "Observed", observable: "3+ minuten" },
        ]
      },
      { id: "B2_UNDERSTANDS_POINTS", pillar: "MATCH", category: "Understanding", name: "Understands Points", description: "Begint punten te begrijpen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen begrip" },
          { score: 1, label: "Emerging", observable: "Basis begrip" },
          { score: 2, label: "Observed", observable: "Begrijpt winnen/punt" },
        ]
      },
      { id: "B2_COMPETITIVE_SPIRIT", pillar: "MATCH", category: "Attitude", name: "Competitive Spirit", description: "Wil graag 'winnen'",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen interesse" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Observed", observable: "Wil winnen" },
        ]
      },
      { id: "B2_GOOD_SPORT", pillar: "MATCH", category: "Behavior", name: "Good Sport", description: "Goed verliezer",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Huilt bij verlies" },
          { score: 1, label: "Emerging", observable: "Accepteert met moeite" },
          { score: 2, label: "Observed", observable: "Accepteert verlies sportief" },
        ]
      },
    ],
  },

  "BLUE_1": {
    levelId: "BLUE_1",
    rank: 1,
    name: "Graduate",
    subtitle: "Ready for Red",
    abilitySnapshot: "Ik ben klaar om op de rode baan te spelen!",
    philosophy: "Kan luisteren, bewegen met intentie, slagen imiteren, in groep functioneren.",
    pillarWeighting: {
      technique: 20,
      tactical: 10,
      physical: 25,
      mental: 25,
      social: 15,
      match: 5,
    },
    promotionRequirements: {
      physicalMinPercent: 80,
      mentalMinPercent: 75,
      socialMinPercent: 75,
      coachConfirmation: true,
      parentAgreement: true,
    },
    skills: [
      // PRE-TECHNIQUE (6 checks) - More advanced
      { id: "B1_HITS_FORWARD", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Hits Forward", description: "Slaat bal gericht vooruit",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Random richting" },
          { score: 1, label: "Emerging", observable: "Soms vooruit" },
          { score: 2, label: "Observed", observable: "Consistent vooruit" },
        ]
      },
      { id: "B1_TRIES_OVER_NET", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Tries Over Net", description: "Probeert over net",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen poging" },
          { score: 1, label: "Emerging", observable: "Probeert" },
          { score: 2, label: "Observed", observable: "Krijgt bal regelmatig over net" },
        ]
      },
      { id: "B1_THROW_HIT_COMBO", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Throw & Hit Combo", description: "Gooit & slaat gecombineerd",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan niet combineren" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Observed", observable: "Combineert gooien en slaan" },
        ]
      },
      { id: "B1_CORRECT_GRIP", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Correct Grip", description: "Houdt racket correcter vast",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Verkeerde grip" },
          { score: 1, label: "Emerging", observable: "Probeert goede grip" },
          { score: 2, label: "Observed", observable: "Grip is correct" },
        ]
      },
      { id: "B1_FOREHAND_SIDE", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Forehand Side", description: "Begrijpt 'forehand-zijde'",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kent verschil niet" },
          { score: 1, label: "Emerging", observable: "Soms correct" },
          { score: 2, label: "Observed", observable: "Kent FH zijde" },
        ]
      },
      { id: "B1_READY_STANCE", pillar: "TECHNIQUE", category: "Pre-Technique", name: "Ready Stance", description: "Neemt ready positie aan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Staat rechtop" },
          { score: 1, label: "Emerging", observable: "Soms klaar" },
          { score: 2, label: "Observed", observable: "Neemt ready positie" },
        ]
      },

      // PHYSICAL (8 checks)
      { id: "B1_RUN_AND_HIT", pillar: "PHYSICAL", category: "Coordination", name: "Runs & Hits", description: "Loopt + slaat",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan niet combineren" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Observed", observable: "Combineert lopen en slaan" },
        ]
      },
      { id: "B1_RECOVERS_POSITION", pillar: "PHYSICAL", category: "Movement", name: "Recovers Position", description: "Herstelt positie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Blijft staan" },
          { score: 1, label: "Emerging", observable: "Soms terug" },
          { score: 2, label: "Observed", observable: "Keert terug naar midden" },
        ]
      },
      { id: "B1_MOVES_WITH_BALL", pillar: "PHYSICAL", category: "Reaction", name: "Moves with Ball", description: "Beweegt met bal",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Reageert niet" },
          { score: 1, label: "Emerging", observable: "Trage reactie" },
          { score: 2, label: "Observed", observable: "Volgt bal met beweging" },
        ]
      },
      { id: "B1_BALANCE_5SEC", pillar: "PHYSICAL", category: "Balance", name: "Balance 5 Sec", description: "5 sec balans op 1 been",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Max 3 sec" },
          { score: 1, label: "Emerging", observable: "4 sec" },
          { score: 2, label: "Observed", observable: "5+ sec stabiel" },
        ]
      },
      { id: "B1_QUICK_FEET", pillar: "PHYSICAL", category: "Agility", name: "Quick Feet", description: "Snelle voeten",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Trage voeten" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Observed", observable: "Snelle voetwerk" },
        ]
      },
      { id: "B1_COORDINATION_GOOD", pillar: "PHYSICAL", category: "Coordination", name: "Good Coordination", description: "Goede algemene coördinatie",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Ongecoördineerd" },
          { score: 1, label: "Emerging", observable: "Verbetert" },
          { score: 2, label: "Observed", observable: "Gecoördineerd" },
        ]
      },
      { id: "B1_ENDURANCE_20", pillar: "PHYSICAL", category: "Endurance", name: "20 Min Session", description: "Houdt 20 min vol",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moe binnen 15" },
          { score: 1, label: "Emerging", observable: "15-20 min" },
          { score: 2, label: "Observed", observable: "Actief hele 20 min" },
        ]
      },
      { id: "B1_SPLIT_STEP_INTRO", pillar: "PHYSICAL", category: "Movement", name: "Split Step Intro", description: "Begint split step te leren",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kent niet" },
          { score: 1, label: "Emerging", observable: "Probeert" },
          { score: 2, label: "Observed", observable: "Doet split step soms" },
        ]
      },

      // MENTAL (6 checks)
      { id: "B1_FOCUS_20", pillar: "MENTAL", category: "Focus", name: "Focus 20 min", description: "20 min sessie mogelijk",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Max 15 min" },
          { score: 1, label: "Emerging", observable: "15-20 min" },
          { score: 2, label: "Observed", observable: "20 min gefocust" },
        ]
      },
      { id: "B1_ACCEPTS_FAILURE", pillar: "MENTAL", category: "Resilience", name: "Accepts Failure", description: "Accepteert falen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Gefrustreerd bij falen" },
          { score: 1, label: "Emerging", observable: "Accepteert met moeite" },
          { score: 2, label: "Observed", observable: "Accepteert en probeert door" },
        ]
      },
      { id: "B1_FOLLOWS_STRUCTURE", pillar: "MENTAL", category: "Focus", name: "Follows Structure", description: "Volgt lesstructuur",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Volgt structuur niet" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Observed", observable: "Volgt structuur consistent" },
        ]
      },
      { id: "B1_GOAL_ORIENTED", pillar: "MENTAL", category: "Attitude", name: "Goal Oriented", description: "Werkt naar doel",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen doelgerichtheid" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Observed", observable: "Werkt actief naar doel" },
        ]
      },
      { id: "B1_SELF_MOTIVATED", pillar: "MENTAL", category: "Attitude", name: "Self-Motivated", description: "Zelf gemotiveerd",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Moet aangemoedigd" },
          { score: 1, label: "Emerging", observable: "Soms zelfstandig" },
          { score: 2, label: "Observed", observable: "Eigen motivatie" },
        ]
      },
      { id: "B1_PROBLEM_SOLVES", pillar: "MENTAL", category: "Learning", name: "Problem Solves", description: "Lost problemen op",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geeft op bij probleem" },
          { score: 1, label: "Emerging", observable: "Probeert met hulp" },
          { score: 2, label: "Observed", observable: "Lost zelf op" },
        ]
      },

      // SOCIAL (5 checks)
      { id: "B1_GROUP_PLAY", pillar: "SOCIAL", category: "Group", name: "Group Play", description: "Speelt in groep",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Speelt alleen" },
          { score: 1, label: "Emerging", observable: "Soms in groep" },
          { score: 2, label: "Observed", observable: "Speelt actief in groep" },
        ]
      },
      { id: "B1_LISTENS_ALWAYS", pillar: "SOCIAL", category: "Respect", name: "Always Listens", description: "Luistert altijd naar coach",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Luistert niet" },
          { score: 1, label: "Emerging", observable: "Meestal" },
          { score: 2, label: "Observed", observable: "Luistert altijd" },
        ]
      },
      { id: "B1_RESPECTS_RULES", pillar: "SOCIAL", category: "Rules", name: "Respects Rules", description: "Respecteert alle regels",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Breekt regels" },
          { score: 1, label: "Emerging", observable: "Meestal" },
          { score: 2, label: "Observed", observable: "Respecteert alle regels" },
        ]
      },
      { id: "B1_ENCOURAGES_OTHERS", pillar: "SOCIAL", category: "Cooperation", name: "Encourages Others", description: "Moedigt anderen aan",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Geen aanmoediging" },
          { score: 1, label: "Emerging", observable: "Soms" },
          { score: 2, label: "Observed", observable: "Moedigt actief aan" },
        ]
      },
      { id: "B1_LEADER_TRAITS", pillar: "SOCIAL", category: "Leadership", name: "Leader Traits", description: "Toont leiderschap",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Volgt alleen" },
          { score: 1, label: "Emerging", observable: "Soms initiatief" },
          { score: 2, label: "Observed", observable: "Neemt leiding" },
        ]
      },

      // MATCH (4 checks)
      { id: "B1_RALLY_5", pillar: "MATCH", category: "Play", name: "Rally 5 Balls", description: "Rally van 5 ballen",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Max 2-3 ballen" },
          { score: 1, label: "Emerging", observable: "3-4 ballen" },
          { score: 2, label: "Observed", observable: "5+ ballen rally" },
        ]
      },
      { id: "B1_KEEPS_SCORE", pillar: "MATCH", category: "Understanding", name: "Keeps Score", description: "Kan score bijhouden",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Weet score niet" },
          { score: 1, label: "Emerging", observable: "Soms correct" },
          { score: 2, label: "Observed", observable: "Houdt score bij" },
        ]
      },
      { id: "B1_PLAYS_MINI_MATCH", pillar: "MATCH", category: "Play", name: "Plays Mini Match", description: "Speelt mini wedstrijd",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Kan geen match spelen" },
          { score: 1, label: "Emerging", observable: "Korte match" },
          { score: 2, label: "Observed", observable: "Speelt volledige mini match" },
        ]
      },
      { id: "B1_RED_READY", pillar: "MATCH", category: "Readiness", name: "Red Ready", description: "Klaar voor Red stage",
        rubric: [
          { score: 0, label: "Not Yet", observable: "Nog niet klaar" },
          { score: 1, label: "Emerging", observable: "Bijna klaar" },
          { score: 2, label: "Observed", observable: "Volledig klaar voor Red" },
        ]
      },
    ],
  },
};

// Helper functions
export function getOrderedBlueLevelIds(): string[] {
  return ["BLUE_3", "BLUE_2", "BLUE_1"];
}

export function getBlueSkillsByPillar(levelId: string, pillar: string): BlueSkill[] {
  const level = BLUE_STAGE_SKILLS_BY_LEVEL[levelId];
  if (!level) return [];
  return level.skills.filter(s => s.pillar === pillar.toUpperCase());
}

export function countBlueSkillsPerLevel(levelId: string): number {
  const level = BLUE_STAGE_SKILLS_BY_LEVEL[levelId];
  return level ? level.skills.length : 0;
}

export function getBluePillarWeighting(levelId: string): PillarWeighting | null {
  const level = BLUE_STAGE_SKILLS_BY_LEVEL[levelId];
  return level ? level.pillarWeighting : null;
}
