// Pure planning / analytics logic for the Influencer Manager studio.
// No React, no network: everything here is deterministic given its inputs
// (plus an optional `random` function) so it can be unit-tested in Node.

export const STORAGE_KEY = "influencer_manager_v1";
import { PRESET_PROFILES } from "./profilePresets.js";

export const MAX_PROFILES = 20;

export const PLATFORMS = {
  instagram: { label: "Instagram", aspectRatio: "4:5", bestHours: [7, 12, 18, 20], maxHashtags: 15 },
  tiktok: { label: "TikTok", aspectRatio: "9:16", bestHours: [9, 15, 19, 21], maxHashtags: 6 },
  youtube: { label: "YouTube Shorts", aspectRatio: "9:16", bestHours: [12, 16, 20], maxHashtags: 5 },
  x: { label: "X", aspectRatio: "16:9", bestHours: [8, 12, 17], maxHashtags: 3 },
  linkedin: { label: "LinkedIn", aspectRatio: "4:5", bestHours: [8, 12, 17], maxHashtags: 5 },
};

export const FORMATS = ["Foto", "Karussell", "Reel", "Story"];

export const POST_STATUS = ["idee", "bild", "freigegeben", "gepostet"];

export const AI_DISCLOSURE = "🤖 KI-generierter Charakter";

export const TONES = ["motivierend", "neugierig", "witzig", "herzlich", "selbstbewusst"];

// Limits for anything that comes from a backup file or user input.
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_POSTS = 2000;
const MAX_FOLLOWER_ENTRIES = 1000;
const MAX_LIST_ITEMS = 30;
const MAX_TEXT = { short: 80, medium: 300, long: 3000 };

const has = (obj, key) => typeof key === "string" && Object.prototype.hasOwnProperty.call(obj, key);

function cleanText(value, max) {
  if (typeof value !== "string") return "";
  // Drop control characters except newline and tab.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").slice(0, max);
}

function cleanList(value, maxItems, maxLen) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => cleanText(v, maxLen).trim()).filter(Boolean).slice(0, maxItems);
}

function cleanNumber(value, min, max, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Only https image URLs are rendered, fetched or sent to the image API.
export function safeImageUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return "";
    return url.href;
  } catch {
    return "";
  }
}

function cleanId(value, fallback) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : fallback;
}

function cleanDate(value) {
  const d = new Date(typeof value === "string" ? value : NaN);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function sanitizeProfile(raw, index) {
  const p = raw && typeof raw === "object" ? raw : {};
  const platforms = cleanList(p.platforms, 10, 20).filter((id) => has(PLATFORMS, id));
  return {
    id: cleanId(p.id, `profile_${index + 1}`),
    name: cleanText(p.name, MAX_TEXT.short) || `Profil ${index + 1}`,
    handle: cleanText(p.handle, MAX_TEXT.short),
    niche: cleanText(p.niche, MAX_TEXT.short),
    appearance: cleanText(p.appearance, MAX_TEXT.medium),
    tone: TONES.includes(p.tone) ? p.tone : TONES[0],
    audience: cleanText(p.audience, MAX_TEXT.medium),
    platforms: [...new Set(platforms)],
    postsPerWeek: Math.round(cleanNumber(p.postsPerWeek, 1, 14, 3)),
    pillars: cleanList(p.pillars, MAX_LIST_ITEMS, MAX_TEXT.short),
    hashtags: cleanList(p.hashtags, MAX_LIST_ITEMS, MAX_TEXT.short),
    avatarUrl: safeImageUrl(p.avatarUrl),
    plannedUntil: cleanDate(p.plannedUntil) || "",
    followers: (Array.isArray(p.followers) ? p.followers : [])
      .filter((f) => f && typeof f.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.date))
      .map((f) => ({ date: f.date, count: Math.round(cleanNumber(f.count, 0, 1e10)) }))
      .slice(-MAX_FOLLOWER_ENTRIES),
  };
}

export function sanitizePost(raw, profileIds) {
  const p = raw && typeof raw === "object" ? raw : null;
  if (!p || !profileIds.has(p.profileId)) return null;
  const scheduledAt = cleanDate(p.scheduledAt);
  if (!scheduledAt) return null;
  const m = p.metrics && typeof p.metrics === "object" ? p.metrics : null;
  return {
    id: cleanId(p.id, makeId("post")),
    profileId: p.profileId,
    platform: has(PLATFORMS, p.platform) ? p.platform : "instagram",
    format: FORMATS.includes(p.format) ? p.format : FORMATS[0],
    pillar: cleanText(p.pillar, MAX_TEXT.short) || "Allgemein",
    scene: cleanText(p.scene, MAX_TEXT.medium),
    scheduledAt,
    status: POST_STATUS.includes(p.status) ? p.status : "idee",
    imageUrl: safeImageUrl(p.imageUrl),
    exportedAt: cleanDate(p.exportedAt) || "",
    prompt: cleanText(p.prompt, MAX_TEXT.long),
    caption: cleanText(p.caption, MAX_TEXT.long),
    metrics: m ? Object.fromEntries(["reach", "likes", "comments", "shares", "saves"]
      .map((k) => [k, Math.round(cleanNumber(m[k], 0, 1e12))])) : null,
  };
}

const DEFAULT_PROFILES = [
  {
    name: "Lena Fit",
    handle: "@lena.moves",
    niche: "Fitness & Gesundheit",
    appearance: "26 year old woman, athletic build, long dark blonde hair in a ponytail, green eyes, light freckles, warm smile",
    tone: "motivierend",
    audience: "Frauen 20–35, die zuhause trainieren",
    platforms: ["instagram", "tiktok"],
    postsPerWeek: 5,
    pillars: ["Home-Workout", "Meal-Prep", "Mindset", "Morgenroutine"],
    hashtags: ["#fitness", "#homeworkout", "#fitnessmotivation", "#gesundleben", "#workout"],
  },
  {
    name: "Mats Unterwegs",
    handle: "@mats.roams",
    niche: "Reisen & Abenteuer",
    appearance: "30 year old man, tanned skin, short curly brown hair, trimmed beard, brown eyes, outdoor jacket",
    tone: "neugierig",
    audience: "Backpacker und Kurztrip-Fans 22–40",
    platforms: ["instagram", "youtube"],
    postsPerWeek: 4,
    pillars: ["Hidden Gems", "Budget-Tipps", "Roadtrip", "Packliste"],
    hashtags: ["#travel", "#reisen", "#wanderlust", "#backpacking", "#travelgram"],
  },
  {
    name: "Nova Tech",
    handle: "@nova.byte",
    niche: "Tech & KI",
    appearance: "24 year old non-binary person, sleek silver bob haircut, grey eyes, minimal black streetwear, subtle tech accessories",
    tone: "witzig",
    audience: "Tech-Interessierte 18–35",
    platforms: ["tiktok", "x"],
    postsPerWeek: 6,
    pillars: ["Gadget-Review", "KI-Tool des Tages", "Setup-Tour", "Tech-News"],
    hashtags: ["#tech", "#ki", "#gadgets", "#techtok", "#ai"],
  },
  {
    name: "Sofia Kocht",
    handle: "@sofia.kitchen",
    niche: "Food & Rezepte",
    appearance: "29 year old woman, mediterranean features, wavy black shoulder-length hair, brown eyes, linen apron",
    tone: "herzlich",
    audience: "Hobbyköche und Familien 25–45",
    platforms: ["instagram", "tiktok"],
    postsPerWeek: 4,
    pillars: ["15-Minuten-Rezept", "Saisonal", "Küchenhack", "Comfort Food"],
    hashtags: ["#rezept", "#foodie", "#kochen", "#einfacherezepte", "#foodporn"],
  },
  {
    name: "Jules Style",
    handle: "@jules.fits",
    niche: "Mode & Lifestyle",
    appearance: "27 year old man, slim build, dark skin, short twisted hair, clean shaven, confident expression",
    tone: "selbstbewusst",
    audience: "Modebewusste 18–30",
    platforms: ["instagram", "tiktok"],
    postsPerWeek: 5,
    pillars: ["Outfit of the Day", "Capsule Wardrobe", "Thrift-Fund", "Styling-Tipp"],
    hashtags: ["#ootd", "#streetstyle", "#mensfashion", "#outfit", "#style"],
  },
];

const HOOKS = {
  motivierend: ["Nur 10 Minuten heute – du schaffst das 💪", "Kleine Schritte, große Wirkung:", "Ausreden zählen heute nicht:"],
  neugierig: ["Das hätte ich hier nie erwartet 👀", "Kaum jemand kennt diesen Ort:", "Spar dir den Touri-Stress:"],
  witzig: ["Mein Wallet weint, aber egal 😅", "POV: Du entdeckst dieses Tool um 2 Uhr nachts", "Hot Take incoming 🔥"],
  herzlich: ["Heute koche ich euch was Gemütliches 🧡", "Dieses Rezept geht immer:", "Wenn's schnell gehen muss:"],
  selbstbewusst: ["Ein Teil, drei Looks.", "Unterschätzt, aber genial:", "So wirkt jedes Outfit teurer:"],
};

const CTAS = {
  Foto: ["Speicher dir das für später 📌", "Was meint ihr? Schreibt's in die Kommentare 👇"],
  Karussell: ["Swipe bis zum Ende 👉", "Speichern & mit einer Person teilen, die das braucht"],
  Reel: ["Folg mir für Teil 2 🔔", "Kommentiere „MEHR“ und ich mache Teil 2"],
  Story: ["Stimm in der Umfrage ab!", "Antworte mit einem Emoji 💬"],
};

const SCENES = [
  "golden hour natural light",
  "bright morning light, clean background",
  "cozy indoor setting, soft window light",
  "urban street, candid moment",
  "close-up portrait, shallow depth of field",
  "wide shot, environmental context",
];

let idCounter = 0;
export function makeId(prefix = "id") {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

function pick(list, random) {
  return list[Math.floor(random() * list.length) % list.length];
}

export function createDefaultState() {
  return {
    version: 1,
    profiles: DEFAULT_PROFILES.map((p, i) => ({
      id: `profile_${i + 1}`,
      avatarUrl: "",
      followers: [],
      ...p,
    })),
    posts: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

// Image models by cost. Prices are MuAPI's listed per-image prices as of
// October 2026 (Nano Banana Pro $0.12, Nano Banana 2 Lite ~$0.03); they are
// estimates for the UI only, MuAPI bills the actual amount.
export const IMAGE_QUALITY = {
  sparsam: { label: "Sparsam", model: "Nano Banana 2 Lite", t2i: "nano-banana-2-lite", edit: "nano-banana-2-lite-edit", pricePerImage: 0.03 },
  premium: { label: "Premium", model: "Nano Banana Pro", t2i: "nano-banana-pro", edit: "nano-banana-pro-edit", pricePerImage: 0.12 },
};

export const DEFAULT_SETTINGS = {
  imageQuality: "sparsam", // cheap model for everyday post images
  avatarPremium: true,     // reference images are made once and set the face, so keep them sharp
  autoPlan: true,        // keep every profile planned ahead automatically
  planAheadDays: 7,      // how far ahead the plan should always reach
  autoImages: false,     // generating images costs MuAPI credits, so opt-in
  imagesPerDay: 10,      // hard cap for automatic image generation
  imageLog: { date: "", count: 0 },
};

export function sanitizeSettings(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const log = s.imageLog && typeof s.imageLog === "object" ? s.imageLog : {};
  return {
    imageQuality: has(IMAGE_QUALITY, s.imageQuality) ? s.imageQuality : DEFAULT_SETTINGS.imageQuality,
    avatarPremium: typeof s.avatarPremium === "boolean" ? s.avatarPremium : DEFAULT_SETTINGS.avatarPremium,
    autoPlan: typeof s.autoPlan === "boolean" ? s.autoPlan : DEFAULT_SETTINGS.autoPlan,
    planAheadDays: Math.round(cleanNumber(s.planAheadDays, 3, 28, DEFAULT_SETTINGS.planAheadDays)),
    autoImages: s.autoImages === true,
    imagesPerDay: Math.round(cleanNumber(s.imagesPerDay, 0, 50, DEFAULT_SETTINGS.imagesPerDay)),
    imageLog: {
      date: typeof log.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(log.date) ? log.date : "",
      count: Math.round(cleanNumber(log.count, 0, 1000)),
    },
  };
}

// Tolerant loader: anything malformed falls back to defaults.
export function parseState(raw) {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!data || !Array.isArray(data.profiles) || !Array.isArray(data.posts)) return createDefaultState();
    const profiles = data.profiles.slice(0, MAX_PROFILES).map(sanitizeProfile);
    // Duplicate ids would make two profiles share one plan.
    const seen = new Set();
    profiles.forEach((p, i) => {
      if (seen.has(p.id)) p.id = `profile_${i + 1}_${makeId("dup")}`.slice(0, 64);
      seen.add(p.id);
    });
    if (profiles.length === 0) return createDefaultState();
    const posts = data.posts.slice(0, MAX_POSTS).map((p) => sanitizePost(p, seen)).filter(Boolean);
    return { version: 1, profiles, posts, settings: sanitizeSettings(data.settings) };
  } catch {
    return createDefaultState();
  }
}

// Spread `count` posts over 7 days starting at `startDate`, avoiding two
// posts on the same day where possible.
export function pickPostingDays(count, startDate) {
  const n = Math.max(0, Math.min(count, 14));
  const days = [];
  for (let i = 0; i < n; i += 1) {
    const offset = Math.floor((i * 7) / Math.max(n, 1));
    const d = new Date(startDate);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    days.push(d);
  }
  return days;
}

// Best hour per platform, nudged by the profile's own engagement history.
export function bestHourFor(platform, insights) {
  const learned = insights?.bestHourByPlatform?.[platform];
  if (Number.isInteger(learned) && learned >= 0 && learned <= 23) return learned;
  return has(PLATFORMS, platform) ? PLATFORMS[platform].bestHours[0] : 18;
}

export function buildImagePrompt(profile, post) {
  return [
    `Photorealistic social media photo of ${profile.appearance}`,
    `${post.pillar.toLowerCase()} content for a ${profile.niche} creator`,
    post.scene,
    "authentic smartphone photo look, natural skin texture, consistent face and identity",
  ].join(", ");
}

// Prompt for a profile's reference image. The appearance comes first and
// unchanged, so the face matches every post prompt that starts with it.
// Built for a real-looking photo: one named light source, a real lens,
// skin texture instead of "ultra realistic" superlatives, a calm but real
// background so edit models can lift the face cleanly.
export function buildAvatarPrompt(profile) {
  const appearance = String(profile?.appearance || "").trim();
  let subject = appearance;
  if (!/\badult\b/i.test(subject)) {
    subject = /\b\d{2}\s*-?\s*year/i.test(subject) ? `adult, ${subject}` : `adult in their mid-twenties, ${subject}`;
  }
  return [
    subject,
    "head-and-shoulders portrait, facing the camera with a relaxed natural smile",
    "in front of a plain light wall at home, softly out of focus",
    "soft window light from the left",
    "50mm lens at f/2.8, sharp focus on the eyes",
    "natural skin texture with visible pores, subtle imperfections, flyaway hairs, true-to-life colors, unretouched",
    "3:4",
  ].join(", ");
}

export function buildCaption(profile, post, random = Math.random) {
  const hooks = has(HOOKS, profile.tone) ? HOOKS[profile.tone] : HOOKS.motivierend;
  const ctas = has(CTAS, post.format) ? CTAS[post.format] : CTAS.Foto;
  const maxTags = has(PLATFORMS, post.platform) ? PLATFORMS[post.platform].maxHashtags : 5;
  const pillarTag = `#${post.pillar.toLowerCase().replace(/[^a-z0-9äöüß]/g, "")}`;
  const tags = [...new Set([pillarTag, ...(profile.hashtags || [])])].slice(0, maxTags);
  return [
    pick(hooks, random),
    profile.audience ? `${post.pillar} – für ${profile.audience}.` : `${post.pillar}.`,
    pick(ctas, random),
    "",
    tags.join(" "),
    AI_DISCLOSURE,
  ].join("\n");
}

// Choose pillars for the week, weighting toward the ones that performed best.
export function weightedPillars(profile, insights, count, random = Math.random) {
  const pillars = profile.pillars?.length ? profile.pillars : ["Allgemein"];
  const scores = pillars.map((p) => 1 + (has(insights?.pillarScore || {}, p) ? insights.pillarScore[p] : 0));
  const total = scores.reduce((a, b) => a + b, 0);
  const result = [];
  for (let i = 0; i < count; i += 1) {
    // Guarantee every pillar appears once before weighting kicks in.
    if (i < pillars.length && count >= pillars.length) {
      result.push(pillars[i]);
      continue;
    }
    let r = random() * total;
    let chosen = pillars[0];
    for (let j = 0; j < pillars.length; j += 1) {
      r -= scores[j];
      if (r <= 0) { chosen = pillars[j]; break; }
    }
    result.push(chosen);
  }
  return result;
}

export function planWeek(profile, startDate, insights, random = Math.random) {
  const platforms = profile.platforms?.length ? profile.platforms : ["instagram"];
  const days = pickPostingDays(profile.postsPerWeek || 3, startDate);
  const pillars = weightedPillars(profile, insights, days.length, random);
  return days.map((day, i) => {
    const platform = platforms[i % platforms.length];
    const format = platform === "tiktok" || platform === "youtube" ? "Reel" : FORMATS[i % 3];
    const scheduled = new Date(day);
    scheduled.setHours(bestHourFor(platform, insights), 0, 0, 0);
    const post = {
      id: makeId("post"),
      profileId: profile.id,
      platform,
      format,
      pillar: pillars[i],
      scene: pick(SCENES, random),
      scheduledAt: scheduled.toISOString(),
      status: "idee",
      imageUrl: "",
      metrics: null,
    };
    post.prompt = buildImagePrompt(profile, post);
    post.caption = buildCaption(profile, post, random);
    return post;
  });
}

export function engagementRate(metrics) {
  if (!metrics) return 0;
  const reach = Number(metrics.reach) || 0;
  if (reach <= 0) return 0;
  const interactions = (Number(metrics.likes) || 0) + (Number(metrics.comments) || 0) * 2
    + (Number(metrics.shares) || 0) * 3 + (Number(metrics.saves) || 0) * 3;
  return interactions / reach;
}

// Learns from posted content: which pillar and hour work best per platform.
export function computeInsights(profile, posts) {
  const mine = posts.filter((p) => p.profileId === profile.id && p.status === "gepostet" && p.metrics);
  const totalReach = mine.reduce((s, p) => s + (Number(p.metrics.reach) || 0), 0);
  const avgEngagement = mine.length ? mine.reduce((s, p) => s + engagementRate(p.metrics), 0) / mine.length : 0;

  const byPillar = Object.create(null);
  const byHour = Object.create(null);
  for (const p of mine) {
    const er = engagementRate(p.metrics);
    (byPillar[p.pillar] ||= []).push(er);
    const hour = new Date(p.scheduledAt).getHours();
    ((byHour[p.platform] ||= Object.create(null))[hour] ||= []).push(er);
  }
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

  const pillarScore = Object.create(null);
  for (const [pillar, ers] of Object.entries(byPillar)) {
    pillarScore[pillar] = avgEngagement > 0 ? Math.max(0, avg(ers) / avgEngagement - 1) * 2 : 0;
  }

  const bestHourByPlatform = Object.create(null);
  for (const [platform, hours] of Object.entries(byHour)) {
    const [bestHour] = Object.entries(hours).sort((a, b) => avg(b[1]) - avg(a[1]))[0];
    bestHourByPlatform[platform] = Number(bestHour);
  }

  const followers = [...(profile.followers || [])].sort((a, b) => a.date.localeCompare(b.date));
  const latest = followers.at(-1)?.count ?? 0;
  const first = followers[0]?.count ?? 0;

  const topPillar = Object.entries(pillarScore).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const tips = [];
  if (mine.length < 5) tips.push("Noch zu wenig Daten – trage nach jedem Post Reichweite & Likes ein, dann lernt der Planer mit.");
  if (topPillar && pillarScore[topPillar] > 0) tips.push(`„${topPillar}“ performt am besten – der nächste Wochenplan gewichtet diese Säule stärker.`);
  if (avgEngagement > 0 && avgEngagement < 0.02) tips.push("Engagement unter 2 %: stärkere Hooks in den ersten 2 Sekunden und Fragen als CTA testen.");
  const planned = posts.filter((p) => p.profileId === profile.id && p.status !== "gepostet").length;
  if (planned === 0) tips.push("Keine geplanten Posts – erstelle einen neuen Wochenplan, Konstanz ist der größte Reichweitenhebel.");

  return {
    postedCount: mine.length,
    totalReach,
    avgEngagement,
    followersLatest: latest,
    followerGrowth: latest - first,
    pillarScore,
    bestHourByPlatform,
    topPillar,
    tips,
  };
}

function csvCell(value) {
  let s = String(value ?? "");
  // Neutralise spreadsheet formulas (=, +, -, @, tab, CR) so Excel/Sheets
  // never execute a cell from an imported caption.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Generic CSV for scheduling tools (Buffer, Later, Meta Business Suite bulk upload).
export function exportScheduleCsv(state) {
  const byId = new Map(state.profiles.map((p) => [p.id, p]));
  const rows = [["profil", "handle", "plattform", "format", "datum", "uhrzeit", "status", "bild_url", "caption"]];
  const sorted = [...state.posts].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  for (const post of sorted) {
    const profile = byId.get(post.profileId);
    if (!profile) continue;
    const d = new Date(post.scheduledAt);
    const pad = (n) => String(n).padStart(2, "0");
    rows.push([
      profile.name,
      profile.handle,
      has(PLATFORMS, post.platform) ? PLATFORMS[post.platform].label : post.platform,
      post.format,
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      post.status,
      post.imageUrl,
      post.caption,
    ]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Top up every profile so its plan reaches at least `planAheadDays` into the
// future. Each profile remembers how far it is planned (`plannedUntil`), so
// running this repeatedly never creates duplicates or overlapping weeks.
// Returns the new posts and the updated coverage per profile.
export function ensurePlanned(state, now = new Date(), random = Math.random) {
  const settings = sanitizeSettings(state.settings);
  const horizon = startOfDay(now);
  horizon.setDate(horizon.getDate() + settings.planAheadDays);
  const tomorrow = startOfDay(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const added = [];
  const plannedUntil = {};
  for (const profile of state.profiles) {
    const insights = computeInsights(profile, state.posts);
    // Coverage = first day that is not planned yet. Falls back to the day
    // after the last open post for data from before `plannedUntil` existed.
    let covered = profile.plannedUntil ? startOfDay(profile.plannedUntil) : null;
    if (!covered) {
      const upcoming = state.posts
        .filter((p) => p.profileId === profile.id && p.status !== "gepostet")
        .map((p) => +new Date(p.scheduledAt));
      if (upcoming.length) covered = new Date(+startOfDay(Math.max(...upcoming)) + 86400000);
    }
    if (!covered || covered < tomorrow) covered = tomorrow;
    // Safety cap: never plan more than 4 weeks in one go.
    for (let week = 0; week < 4 && covered < horizon; week += 1) {
      added.push(...planWeek(profile, covered, insights, random));
      covered = new Date(covered);
      covered.setDate(covered.getDate() + 7);
    }
    plannedUntil[profile.id] = covered.toISOString();
  }
  return { added, plannedUntil };
}

export function applyPlan(state, { added, plannedUntil }) {
  return {
    ...state,
    posts: [...state.posts, ...added],
    profiles: state.profiles.map((p) => (plannedUntil[p.id] ? { ...p, plannedUntil: plannedUntil[p.id] } : p)),
  };
}

// Posts that should get an image automatically now: open, no image yet,
// due within `withinDays`, soonest first, limited by today's remaining quota.
export function pickAutoImageQueue(state, now = new Date(), withinDays = 2) {
  const settings = sanitizeSettings(state.settings);
  if (!settings.autoImages) return [];
  const today = now.toISOString().slice(0, 10);
  const used = settings.imageLog.date === today ? settings.imageLog.count : 0;
  const remaining = Math.max(0, settings.imagesPerDay - used);
  const limit = new Date(now.getTime() + withinDays * 86400000);
  return state.posts
    .filter((p) => p.status === "idee" && !p.imageUrl && new Date(p.scheduledAt) <= limit && new Date(p.scheduledAt) >= now)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    .slice(0, remaining);
}

// ── Buffer bulk upload ──────────────────────────────────────────────────────
// Format per Buffer's help centre: one CSV per channel with the exact,
// case-sensitive headers "Text", "Image URL", "Tags", "Posting Time"
// (YYYY-MM-DD HH:mm). Instagram posts need a direct image link.

const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i;

export function isDirectImageUrl(url) {
  const safe = safeImageUrl(url);
  if (!safe) return false;
  return IMAGE_EXT.test(new URL(safe).pathname);
}

function formatPostingTime(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Approved, not yet exported, future posts for one profile + platform.
// Returns the rows that can go to Buffer and the posts that had to be skipped.
export function bufferExportFor(state, profileId, platform, now = new Date()) {
  const candidates = state.posts
    .filter((p) => p.profileId === profileId && p.platform === platform && p.status === "freigegeben"
      && !p.exportedAt && new Date(p.scheduledAt) > now)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const ready = [];
  const skipped = [];
  for (const post of candidates) {
    if (!isDirectImageUrl(post.imageUrl)) skipped.push(post);
    else ready.push(post);
  }
  return { ready: ready.slice(0, 100), skipped }; // Buffer queues max 100 posts per channel
}

export function buildBufferCsv(posts) {
  const rows = [["Text", "Image URL", "Tags", "Posting Time"]];
  for (const post of posts) {
    rows.push([post.caption, safeImageUrl(post.imageUrl), "", formatPostingTime(post.scheduledAt)]);
  }
  // Leading BOM so Excel and Buffer read emoji as UTF-8.
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

// Exported posts are published by Buffer, so once their time has passed
// they count as posted and ask for metrics.
export function markPublishedExports(state, now = new Date()) {
  let changed = 0;
  const posts = state.posts.map((p) => {
    if (p.exportedAt && p.status === "freigegeben" && new Date(p.scheduledAt) <= now) {
      changed += 1;
      return { ...p, status: "gepostet" };
    }
    return p;
  });
  return { state: changed ? { ...state, posts } : state, changed };
}

// ── Profile management ──────────────────────────────────────────────────────

// Adds the ready-made profiles that aren't in the state yet, up to MAX_PROFILES.
export function addPresetProfiles(state) {
  const have = new Set(state.profiles.map((p) => p.id));
  const room = Math.max(0, MAX_PROFILES - state.profiles.length);
  const added = PRESET_PROFILES.filter((p) => !have.has(p.id)).slice(0, room)
    .map((p, i) => sanitizeProfile({ ...p, avatarUrl: "", followers: [] }, state.profiles.length + i));
  return { state: added.length ? { ...state, profiles: [...state.profiles, ...added] } : state, added: added.length };
}

export function missingPresetCount(state) {
  const have = new Set(state.profiles.map((p) => p.id));
  const missing = PRESET_PROFILES.filter((p) => !have.has(p.id)).length;
  return Math.min(missing, Math.max(0, MAX_PROFILES - state.profiles.length));
}

export function createBlankProfile(appearance, index) {
  return sanitizeProfile({
    id: makeId("profile"),
    name: `Neues Profil ${index + 1}`,
    handle: "",
    niche: "Lifestyle",
    appearance,
    tone: TONES[0],
    audience: "",
    platforms: ["instagram"],
    postsPerWeek: 3,
    pillars: ["Lifestyle", "Outfit", "Alltag"],
    hashtags: ["#lifestyle", "#instadaily"],
  }, index);
}

// Removes a profile and its posts; the last profile can't be removed.
export function removeProfile(state, profileId) {
  if (state.profiles.length <= 1) return state;
  return {
    ...state,
    profiles: state.profiles.filter((p) => p.id !== profileId),
    posts: state.posts.filter((p) => p.profileId !== profileId),
  };
}

// ── Image cost ──────────────────────────────────────────────────────────────

// Models to use for a purpose ("post" or "avatar") under the current settings.
export function imageModelsFor(settings, purpose = "post") {
  const cfg = sanitizeSettings(settings);
  const tier = purpose === "avatar" && cfg.avatarPremium ? "premium" : cfg.imageQuality;
  return IMAGE_QUALITY[tier];
}

export function estimateImageCost(count, settings, purpose = "post") {
  return Math.max(0, count) * imageModelsFor(settings, purpose).pricePerImage;
}

// Rough weekly spend if every planned post gets one image.
export function weeklyImageEstimate(state) {
  const posts = state.profiles.reduce((sum, p) => sum + (Number(p.postsPerWeek) || 0), 0);
  return { posts, cost: estimateImageCost(posts, state.settings) };
}

// Open posts without an image that are due within `withinDays` — the ones a
// bulk run should cover. Later posts may still change, so they wait.
export function bulkImageQueue(state, profileIds, now = new Date(), withinDays = 7) {
  const limit = now.getTime() + withinDays * 86400000;
  return state.posts
    .filter((p) => profileIds.includes(p.profileId) && !p.imageUrl && p.status !== "gepostet"
      && new Date(p.scheduledAt).getTime() <= limit)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

export function formatUsd(amount) {
  return `$${(Math.round(amount * 100) / 100).toFixed(2)}`;
}
