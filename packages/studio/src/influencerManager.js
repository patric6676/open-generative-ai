// Pure planning / analytics logic for the Influencer Manager studio.
// No React, no network: everything here is deterministic given its inputs
// (plus an optional `random` function) so it can be unit-tested in Node.

export const STORAGE_KEY = "influencer_manager_v1";
export const MAX_PROFILES = 5;

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
  };
}

// Tolerant loader: anything malformed falls back to defaults.
export function parseState(raw) {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!data || !Array.isArray(data.profiles) || !Array.isArray(data.posts)) return createDefaultState();
    return {
      version: 1,
      profiles: data.profiles.slice(0, MAX_PROFILES),
      posts: data.posts,
    };
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
  if (learned !== undefined) return learned;
  return PLATFORMS[platform]?.bestHours?.[0] ?? 18;
}

export function buildImagePrompt(profile, post) {
  return [
    `Photorealistic social media photo of ${profile.appearance}`,
    `${post.pillar.toLowerCase()} content for a ${profile.niche} creator`,
    post.scene,
    "authentic smartphone photo look, natural skin texture, consistent face and identity",
  ].join(", ");
}

export function buildCaption(profile, post, random = Math.random) {
  const hooks = HOOKS[profile.tone] || HOOKS.motivierend;
  const ctas = CTAS[post.format] || CTAS.Foto;
  const maxTags = PLATFORMS[post.platform]?.maxHashtags ?? 5;
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
  const scores = pillars.map((p) => 1 + (insights?.pillarScore?.[p] ?? 0));
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

  const byPillar = {};
  const byHour = {};
  for (const p of mine) {
    const er = engagementRate(p.metrics);
    (byPillar[p.pillar] ||= []).push(er);
    const hour = new Date(p.scheduledAt).getHours();
    ((byHour[p.platform] ||= {})[hour] ||= []).push(er);
  }
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

  const pillarScore = {};
  for (const [pillar, ers] of Object.entries(byPillar)) {
    pillarScore[pillar] = avgEngagement > 0 ? Math.max(0, avg(ers) / avgEngagement - 1) * 2 : 0;
  }

  const bestHourByPlatform = {};
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
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Generic CSV for scheduling tools (Buffer, Later, Meta Business Suite bulk upload).
export function exportScheduleCsv(state) {
  const byId = Object.fromEntries(state.profiles.map((p) => [p.id, p]));
  const rows = [["profil", "handle", "plattform", "format", "datum", "uhrzeit", "status", "bild_url", "caption"]];
  const sorted = [...state.posts].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  for (const post of sorted) {
    const profile = byId[post.profileId];
    if (!profile) continue;
    const d = new Date(post.scheduledAt);
    const pad = (n) => String(n).padStart(2, "0");
    rows.push([
      profile.name,
      profile.handle,
      PLATFORMS[post.platform]?.label || post.platform,
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
