// Prompt randomizer for Instagram-style lifestyle photos of adult women
// aged 20–25. Pure functions only, so it can be unit-tested in Node.
//
// Every prompt states the exact age and "adult woman", and the option lists
// stay Instagram-appropriate (no lingerie, no nudity, nothing that reads as
// underage), so the output is safe to post on the platforms we target.

export const MIN_AGE = 20;
export const MAX_AGE = 25;

export const OPTIONS = {
  origin: [
    "Scandinavian", "German", "Southern European", "Eastern European", "Irish",
    "Latina", "Brazilian", "East Asian", "Korean", "Japanese", "South Asian",
    "Middle Eastern", "Black", "Afro-Caribbean", "mixed-race",
  ],
  hairColor: [
    "platinum blonde", "honey blonde", "golden blonde", "light brown", "chestnut brown",
    "dark brown", "jet black", "copper red", "auburn", "ash brown",
  ],
  hairStyle: [
    "in long loose waves", "worn sleek and straight", "in a high ponytail", "in a messy bun",
    "cut in a shoulder-length bob", "with curtain bangs", "in long natural curls", "in a braided crown",
    "in a slicked-back bun", "in beachy waves",
  ],
  eyes: ["blue eyes", "green eyes", "hazel eyes", "brown eyes", "grey eyes", "dark brown eyes"],
  detail: [
    "light freckles", "subtle dimples", "natural makeup", "soft glam makeup",
    "glowing dewy skin", "a small beauty mark", "bold red lips", "a bright, warm smile",
  ],
  body: ["slim figure", "athletic build", "toned physique", "curvy figure", "tall and slender"],
  // Each style has outfits that fit it, so prompts stay coherent.
  outfitsByAesthetic: {
    "clean minimalist aesthetic": ["a white linen dress", "a beige knit set", "a white tee and straight-leg jeans"],
    "old money style": ["a cream cable-knit sweater and tailored trousers", "a navy blazer and a pleated midi skirt", "a silk blouse and wide-leg trousers"],
    "streetwear style": ["an oversized hoodie and cargo pants", "a bomber jacket and baggy jeans", "a graphic tee and chunky sneakers"],
    "boho style": ["a flowy floral maxi dress", "a crochet top and flared jeans", "a suede fringe jacket and a long skirt"],
    "Y2K style": ["a velour tracksuit", "a metallic top and cargo pants", "a baby-blue cardigan and low-rise jeans"],
    "sporty chic": ["a matching gym set", "a pleated tennis skirt and a polo shirt", "a zip-up track jacket and leggings"],
    "minimalist Scandinavian style": ["a grey wool coat and a black turtleneck", "a chunky knit sweater and wide-leg trousers", "an oversized blazer with straight-leg jeans"],
    "coastal summer style": ["a floral summer sundress", "a striped linen shirt and white shorts", "a crochet beach cover-up and a straw hat"],
    "Parisian chic": ["a beige trench coat and loafers", "a striped Breton top and a red beret", "a black satin midi dress"],
    "cozy autumn style": ["a chunky knit cardigan and a plaid scarf", "a leather jacket and black jeans", "a corduroy jacket and a knit beanie"],
  },
  location: [
    "a café terrace in Paris", "a rooftop bar at sunset", "a beach promenade at golden hour",
    "a bright apartment full of plants", "a neon-lit street in Tokyo at night", "a flower market",
    "a modern gym with large windows", "a balcony on the Amalfi coast", "a snowy mountain cabin",
    "a minimalist art gallery", "a farmers market", "the deck of a sailboat",
    "a cobblestone street in Lisbon", "a lavender field in Provence", "a cozy bookstore",
  ],
  activity: [
    "laughing and looking away from the camera", "sipping an iced latte", "walking towards the camera",
    "sitting on stone steps", "holding a bouquet of flowers", "adjusting her sunglasses",
    "glancing over her shoulder", "reading a book", "stretching after a workout",
    "taking a mirror selfie", "eating a croissant", "spinning around and laughing",
  ],
  shot: [
    "candid iPhone photo", "close-up portrait", "full-body shot", "half-body shot",
    "photo taken by a friend", "mirror selfie", "low-angle shot",
  ],
  light: [
    "golden hour sunlight", "soft overcast light", "warm indoor light",
    "soft morning window light", "dappled sunlight through leaves", "bright midday sun",
  ],
  // Used instead of `light` when the location is at night.
  nightLight: ["neon city lights", "direct camera flash", "warm string lights", "moody street lamps"],
  camera: [
    "shot on iPhone 15 Pro", "35mm film look with slight grain", "Fujifilm color science",
    "shot on a Sony A7 IV with an 85mm lens", "Kodak Portra 400 film look",
  ],
};

// Which traits belong together, so a whole group can be locked at once
// (e.g. lock "person" to keep the same woman across many scenes).
OPTIONS.aesthetic = Object.keys(OPTIONS.outfitsByAesthetic);

export const GROUPS = {
  person: { label: "Person", keys: ["age", "origin", "hairColor", "hairStyle", "eyes", "detail", "body"] },
  look: { label: "Look", keys: ["aesthetic", "outfit"] },
  scene: { label: "Szene", keys: ["location", "activity"] },
  camera: { label: "Kamera", keys: ["shot", "light", "camera"] },
};

const NIGHT_LOCATIONS = new Set(["a neon-lit street in Tokyo at night"]);

const QUALITY = "photorealistic, natural skin texture, realistic proportions, Instagram aesthetic, no text, no watermark";

function pick(list, random) {
  return list[Math.floor(random() * list.length) % list.length];
}

function clampAge(age) {
  const n = Math.round(Number(age));
  if (!Number.isFinite(n)) return MIN_AGE;
  return Math.min(MAX_AGE, Math.max(MIN_AGE, n));
}

// New traits; groups listed in `locked` are copied from `previous`.
export function randomizeTraits(previous = null, locked = [], random = Math.random) {
  const traits = {};
  for (const [group, { keys }] of Object.entries(GROUPS)) {
    const keep = previous && locked.includes(group);
    for (const key of keys) {
      if (keep && previous[key] !== undefined) {
        traits[key] = previous[key];
      } else if (key === "light") {
        traits.light = pick(NIGHT_LOCATIONS.has(traits.location) ? OPTIONS.nightLight : OPTIONS.light, random);
      } else if (key === "outfit") {
        traits.outfit = pick(OPTIONS.outfitsByAesthetic[traits.aesthetic] || OPTIONS.outfitsByAesthetic[OPTIONS.aesthetic[0]], random);
      } else if (key === "age") {
        traits.age = MIN_AGE + Math.floor(random() * (MAX_AGE - MIN_AGE + 1));
      } else {
        traits[key] = pick(OPTIONS[key], random);
      }
    }
  }
  traits.age = clampAge(traits.age);
  return traits;
}

// The description of the woman alone, in the same style as profile.appearance.
export function traitsToAppearance(t) {
  return `${clampAge(t.age)} year old adult ${t.origin} woman, ${t.hairColor} hair ${t.hairStyle}, ${t.eyes}, ${t.detail}, ${t.body}`;
}

export function traitsToPrompt(t) {
  return [
    `Instagram photo of a ${clampAge(t.age)}-year-old adult ${t.origin} woman with ${t.hairColor} hair ${t.hairStyle}, ${t.eyes}, ${t.detail}, ${t.body}`,
    `wearing ${t.outfit} (${t.aesthetic})`,
    `${t.activity} at ${t.location}`,
    `${t.shot}, ${t.light}, ${t.camera}`,
    QUALITY,
  ].join(", ");
}

// `count` distinct prompts. Locked groups come from `base` (or from the first
// new result when there is no base yet, so the batch shares them).
export function generateBatch(count, base = null, locked = [], random = Math.random) {
  const n = Math.max(1, Math.min(20, Math.round(Number(count) || 1)));
  const results = [];
  const seen = new Set();
  let anchor = base;
  for (let attempts = 0; results.length < n && attempts < n * 20; attempts += 1) {
    const traits = randomizeTraits(anchor, locked, random);
    if (!anchor) anchor = traits;
    const prompt = traitsToPrompt(traits);
    if (seen.has(prompt)) continue;
    seen.add(prompt);
    results.push({ traits, prompt, appearance: traitsToAppearance(traits) });
  }
  return results;
}
