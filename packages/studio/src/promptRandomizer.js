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

// ── Glamour mode ────────────────────────────────────────────────────────────
// Swimwear, fitness and evening looks as they appear on fashion and travel
// accounts: styled like an editorial, never sexualised, so it stays within
// Instagram's and TikTok's community guidelines. Each theme has its own
// outfits and locations so prompts stay coherent.
export const GLAMOUR = {
  themes: {
    "beach & pool look": {
      outfits: [
        "a classic black one-piece swimsuit and a wide-brim sun hat",
        "a white bikini with an open linen shirt",
        "a high-waisted retro bikini in terracotta",
        "a ribbed one-piece swimsuit and oversized sunglasses",
        "a crochet bikini top with a matching sarong",
      ],
      locations: [
        "an infinity pool overlooking the sea", "a white sand beach in the Maldives",
        "a beach club in Ibiza", "the deck of a yacht on the Côte d'Azur", "rocky cliffs in Mykonos",
      ],
    },
    "athletic look": {
      outfits: [
        "a matching sports bra and high-waisted leggings set", "a sleek seamless gym set",
        "a white tennis dress", "a cropped track jacket and biker shorts",
      ],
      locations: [
        "a luxury gym with floor-to-ceiling windows", "a rooftop tennis court",
        "a beach promenade at sunrise", "a minimalist pilates studio",
      ],
      // Mostly indoor or early morning, so no harsh Mediterranean sun.
      light: ["soft diffused daylight", "bright natural window light", "soft sunrise light"],
    },
    "evening look": {
      outfits: [
        "a floor-length satin evening gown", "a sequined cocktail dress", "a black velvet midi dress",
        "a tailored white tuxedo jumpsuit", "a one-shoulder red evening dress",
      ],
      locations: [
        "a red carpet event at night", "a grand hotel staircase at night",
        "a rooftop bar overlooking the city at night", "an opera house foyer at night", "a candlelit restaurant at night",
      ],
    },
    "resort look": {
      outfits: [
        "a flowing silk maxi dress", "a linen co-ord set", "a white crochet maxi dress",
        "a wrap dress with a straw bag",
      ],
      locations: [
        "a villa terrace in Santorini", "a luxury resort lobby", "a palm-lined pool deck in Bali",
        "a vineyard terrace in Tuscany",
      ],
    },
  },
  activity: [
    "striking a confident fashion pose", "walking towards the camera with a relaxed smile",
    "laughing and looking away", "glancing over her shoulder", "adjusting her sunglasses",
    "sitting elegantly", "turning towards the camera",
  ],
  shot: ["fashion editorial photo", "full-body shot", "three-quarter shot", "close-up beauty portrait"],
  light: ["golden hour sunlight", "bright Mediterranean sunlight", "soft diffused daylight"],
  nightLight: ["warm ambient evening light", "soft candlelight", "elegant flash photography"],
  camera: [
    "shot on a Canon EOS R5 with an 85mm lens", "high-end fashion magazine look",
    "shot on medium format film", "clean luxury brand campaign look",
  ],
};

const GLAMOUR_QUALITY = "tasteful and elegant, Instagram-appropriate, photorealistic, natural skin texture, realistic proportions, no text, no watermark";

export const MODES = { alltag: "Alltag", glamour: "Glamour" };

function pick(list, random) {
  return list[Math.floor(random() * list.length) % list.length];
}

function clampAge(age) {
  const n = Math.round(Number(age));
  if (!Number.isFinite(n)) return MIN_AGE;
  return Math.min(MAX_AGE, Math.max(MIN_AGE, n));
}

function pickTrait(key, traits, mode, random) {
  if (key === "age") return MIN_AGE + Math.floor(random() * (MAX_AGE - MIN_AGE + 1));
  if (mode === "glamour") {
    const theme = GLAMOUR.themes[traits.aesthetic] || Object.values(GLAMOUR.themes)[0];
    if (key === "aesthetic") return pick(Object.keys(GLAMOUR.themes), random);
    if (key === "outfit") return pick(theme.outfits, random);
    if (key === "location") return pick(theme.locations, random);
    if (key === "light") return pick(/ at night$/.test(traits.location) ? GLAMOUR.nightLight : theme.light || GLAMOUR.light, random);
    if (GLAMOUR[key]) return pick(GLAMOUR[key], random);
  } else {
    if (key === "outfit") return pick(OPTIONS.outfitsByAesthetic[traits.aesthetic] || OPTIONS.outfitsByAesthetic[OPTIONS.aesthetic[0]], random);
    if (key === "light") return pick(NIGHT_LOCATIONS.has(traits.location) ? OPTIONS.nightLight : OPTIONS.light, random);
  }
  return pick(OPTIONS[key], random);
}

// New traits; groups listed in `locked` are copied from `previous`. The
// person can be kept across modes; look, scene and camera only when
// `previous` was made in the same mode, otherwise they wouldn't fit.
export function randomizeTraits(previous = null, locked = [], random = Math.random, mode = "alltag") {
  const m = mode === "glamour" ? "glamour" : "alltag";
  const traits = { mode: m };
  for (const [group, { keys }] of Object.entries(GROUPS)) {
    const sameMode = (previous?.mode || "alltag") === m;
    const keep = previous && locked.includes(group) && (group === "person" || sameMode);
    for (const key of keys) {
      traits[key] = keep && previous[key] !== undefined ? previous[key] : pickTrait(key, traits, m, random);
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
  const glamour = t.mode === "glamour";
  return [
    `Instagram ${glamour ? "fashion " : ""}photo of a ${clampAge(t.age)}-year-old adult ${t.origin} woman with ${t.hairColor} hair ${t.hairStyle}, ${t.eyes}, ${t.detail}, ${t.body}`,
    `wearing ${t.outfit} (${t.aesthetic})`,
    `${t.activity} at ${t.location}`,
    `${t.shot}, ${t.light}, ${t.camera}`,
    glamour ? GLAMOUR_QUALITY : QUALITY,
  ].join(", ");
}

// `count` distinct prompts. Locked groups come from `base` (or from the first
// new result when there is no base yet, so the batch shares them).
export function generateBatch(count, base = null, locked = [], random = Math.random, mode = "alltag") {
  const n = Math.max(1, Math.min(20, Math.round(Number(count) || 1)));
  const results = [];
  const seen = new Set();
  let anchor = base;
  for (let attempts = 0; results.length < n && attempts < n * 20; attempts += 1) {
    const traits = randomizeTraits(anchor, locked, random, mode);
    // Re-anchor once the mode changed so the rest of the batch shares
    // the new look/scene/camera when those are locked.
    if (!anchor || anchor.mode !== traits.mode) anchor = traits;
    const prompt = traitsToPrompt(traits);
    if (seen.has(prompt)) continue;
    seen.add(prompt);
    results.push({ traits, prompt, appearance: traitsToAppearance(traits) });
  }
  return results;
}
