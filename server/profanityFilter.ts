const PROFANITY_LIST: string[] = [
  "fuck", "fucking", "fucker", "fuckers", "fucked", "fucks", "motherfucker", "motherfucking",
  "shit", "shitty", "shitting", "bullshit", "horseshit", "dipshit",
  "ass", "asshole", "assholes", "asses", "dumbass", "fatass", "jackass", "smartass",
  "bitch", "bitches", "bitchy", "sonofabitch",
  "damn", "damned", "dammit", "goddamn", "goddamnit",
  "hell", "bastard", "bastards",
  "dick", "dicks", "dickhead", "dickheads",
  "cock", "cocks", "cocksucker", "cocksuckers",
  "cunt", "cunts",
  "pussy", "pussies",
  "whore", "whores", "slut", "sluts",
  "piss", "pissed", "pissing",
  "crap", "crappy",
  "wanker", "wankers", "tosser", "tossers",
  "twat", "twats",
  "bollocks", "bugger",
  "nigger", "niggers", "nigga", "niggas",
  "faggot", "faggots", "fag", "fags",
  "retard", "retarded", "retards",
  "spic", "spics", "chink", "chinks", "kike", "kikes",
  "wetback", "gook", "gooks",
  "tranny", "trannies",
  "porn", "porno", "pornography",
  "dildo", "vibrator",
  "jerkoff", "jackoff", "wankstain",
  "skank", "skanky",
  "boobs", "tits", "titties",
  "anus", "anal",
  "blowjob", "handjob",
  "cumshot", "creampie",
  "cum", "jizz", "semen", "spunk",

  "godverdomme", "verdomme", "kut", "kanker", "kankerlijer", "tering", "teringlijer",
  "hoer", "hoeren", "slet", "klootzak", "klootzakken", "lul", "eikel",
  "mongool", "debiel", "sukkel", "drol", "schijt", "stront",
  "mierenneuker", "kutwijf", "tyfus", "tyfuslijer", "pleuris", "pleurislijer",
  "godnondeju", "krijg de klere", "oprotten", "optieven", "opflikkeren",

  "kuss", "kos", "kosomak", "kosommak",
  "sharmouta", "sharmout", "sharmuta", "manyak", "manyake",
  "ibn el sharmouta", "yel3an", "yelaan", "ya kalb", "ya hmar",
  "ya khara", "khara", "kharah",
  "zebi", "zebbi", "nikk", "nik",
  "ayre", "ayri", "eyre",
  "ya ibn el", "ya wiskha", "wisekh",
  "telhas", "tizi", "ahbal",
  "khanzeera", "khanzeir",
];

const profanityRegex = new RegExp(
  `\\b(${PROFANITY_LIST.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi'
);

export function filterProfanity(text: string): string {
  return text.replace(profanityRegex, '***');
}

export function containsProfanity(text: string): boolean {
  profanityRegex.lastIndex = 0;
  return profanityRegex.test(text);
}
