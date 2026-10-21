// ---------------------------------------------------------------------------
// Lexicon — exactly 200-word allowlist. Constitution rule #5.
// Categories: physical nouns, landscape/architecture, nature, machines/light,
// abstract/time, verbs, adjectives, numbers, function words.
// Only these exact words are allowed in `title` and `journal`.
// ---------------------------------------------------------------------------

export const LEXICON = new Set<string>([
  // --- physical nouns (25) ---
  "stone", "rock", "dust", "ash", "water", "fire", "light", "shadow",
  "metal", "wood", "glass", "cloth", "sand", "ice", "snow", "rain",
  "wind", "cloud", "sky", "star", "moon", "sun", "night", "day", "earth",
  // --- landscape & architecture (25) ---
  "ground", "floor", "wall", "roof", "door", "window", "path", "bridge",
  "tower", "gate", "pillar", "arch", "stairs", "room", "house", "shed",
  "barn", "well", "pond", "river", "lake", "sea", "island", "mountain", "valley",
  // --- nature (25) ---
  "forest", "tree", "flower", "grass", "leaf", "root", "seed", "fruit",
  "bird", "fish", "cat", "dog", "horse", "insect", "nest", "vine",
  "branch", "trunk",
  // --- machines & light (25) ---
  "machine", "engine", "gear", "cog", "spring", "lever", "button", "wire",
  "circuit", "battery", "lamp", "candle", "torch", "beacon", "signal",
  "mirror", "lens", "prism", "bell", "chain", "rope", "hook",
  // --- abstract & time (12) ---
  "dawn", "dusk", "future", "memory", "dream", "silence", "echo", "rhythm",
  "pattern", "balance", "weight", "height", "depth", "distance", "void",
  // --- verbs (23) ---
  "build", "make", "create", "grow", "rise", "fall", "move", "stop",
  "wait", "listen", "watch", "look", "touch", "hold", "open", "close",
  "break", "fix", "clean", "paint", "draw", "write", "read", "count", "measure", "shine",
  // --- adjectives (25) ---
  "big", "small", "tall", "short", "long", "wide", "narrow", "thick",
  "heavy", "hard", "soft", "smooth", "rough", "sharp", "dull", "bright",
  "pale", "deep", "old", "new", "quiet", "slow", "warm", "cold", "hot", "dry",
  "still", "hidden", "near", "far",
  // --- numbers (5) ---
  "one", "two", "three", "four", "five",
  // --- function words (23) ---
  "in", "on", "at", "by", "for", "with", "from", "to", "into", "onto",
  "over", "under", "between", "through", "behind", "beside", "until",
  "so", "but", "and", "or", "if", "then", "like", "not", "no", "yes", "never",
  // --- time words (6) ---
  "tonight", "morning", "evening", "today", "tomorrow", "yesterday",
]);

export function inLexicon(text: string): boolean {
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.every((w) => LEXICON.has(w));
}
