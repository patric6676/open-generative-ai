"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import toast, { Toaster } from "react-hot-toast";
import { generateImage, generateI2I } from "../muapi.js";
import { formatErrorMessage } from "../utils/formatError.js";
import { downloadImage } from "../utils/downloadImage.js";
import {
  STORAGE_KEY,
  PLATFORMS,
  FORMATS,
  POST_STATUS,
  TONES,
  MAX_IMPORT_BYTES,
  safeImageUrl,
  createDefaultState,
  parseState,
  sanitizeSettings,
  ensurePlanned,
  applyPlan,
  pickAutoImageQueue,
  bufferExportFor,
  buildBufferCsv,
  markPublishedExports,
  planWeek,
  computeInsights,
  buildCaption,
  buildImagePrompt,
  engagementRate,
  exportScheduleCsv,
  IMAGE_QUALITY,
  imageModelsFor,
  estimateImageCost,
  weeklyImageEstimate,
  bulkImageQueue,
  formatUsd,
  MAX_PROFILES,
  addPresetProfiles,
  missingPresetCount,
  createBlankProfile,
  removeProfile,
  makeId,
  bestHourFor,
} from "../influencerManager.js";
import { generateBatch, GROUPS, MODES } from "../promptRandomizer.js";


const STATUS_LABEL = { idee: "Idee", bild: "Bild fertig", freigegeben: "Freigegeben", gepostet: "Gepostet" };
const STATUS_STYLE = {
  idee: "bg-white/5 text-gray-400",
  bild: "bg-sky-500/15 text-sky-300",
  freigegeben: "bg-amber-500/15 text-amber-300",
  gepostet: "bg-emerald-500/15 text-emerald-300",
};

const inputCls = "w-full bg-[#161616] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-gray-200 placeholder-gray-600 outline-none focus:border-violet-500/50";
const btnCls = "px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-white/10 bg-white/[0.04] hover:bg-white/[0.09] text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors";
const primaryBtnCls = "px-4 py-2 rounded-lg text-[12px] font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed";

function loadState() {
  if (typeof window === "undefined") return createDefaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    // First start: the 5 starter profiles plus the 15 ready-made ones.
    return raw ? parseState(raw) : addPresetProfiles(createDefaultState()).state;
  } catch {
    return createDefaultState();
  }
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatNumber(n) {
  return new Intl.NumberFormat("de-DE").format(Math.round(n || 0));
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">{label}</span>
      {children}
    </label>
  );
}

function Kpi({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#121212] p-4">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">{label}</p>
      <p className="text-xl font-bold text-white mt-1">{value}</p>
      {hint && <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p>}
    </div>
  );
}

// ─── Profile editor ─────────────────────────────────────────────────────────
function ProfileTab({ profile, onChange, onGenerateAvatar, busy, onDelete, canDelete, postCount }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (key) => (e) => onChange({ [key]: e.target.value });
  const setList = (key) => (e) => onChange({ [key]: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) });
  const togglePlatform = (id) => {
    const has = profile.platforms.includes(id);
    onChange({ platforms: has ? profile.platforms.filter((p) => p !== id) : [...profile.platforms, id] });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
      <div className="space-y-3">
        <div className="aspect-[3/4] rounded-2xl overflow-hidden border border-white/[0.08] bg-[#141414] flex items-center justify-center">
          {safeImageUrl(profile.avatarUrl) ? (
            <img src={safeImageUrl(profile.avatarUrl)} alt={profile.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
          ) : (
            <p className="text-[11px] text-gray-600 text-center px-6">Noch kein Referenzbild. Es sorgt dafür, dass das Gesicht in allen Posts gleich bleibt.</p>
          )}
        </div>
        <button className={primaryBtnCls + " w-full"} disabled={busy} onClick={onGenerateAvatar}>
          {busy ? "Generiere…" : profile.avatarUrl ? "Neues Referenzbild" : "Referenzbild generieren"}
        </button>
        <Field label="Oder Bild-URL einfügen (nur https)">
          <input className={inputCls} value={profile.avatarUrl} onChange={set("avatarUrl")} placeholder="https://…" maxLength={2048} />
        </Field>
        {profile.avatarUrl && !safeImageUrl(profile.avatarUrl) && (
          <p className="text-[11px] text-red-300">Nur https-Bildlinks werden verwendet.</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 content-start">
        <Field label="Name"><input className={inputCls} value={profile.name} onChange={set("name")} /></Field>
        <Field label="Handle"><input className={inputCls} value={profile.handle} onChange={set("handle")} /></Field>
        <Field label="Nische"><input className={inputCls} value={profile.niche} onChange={set("niche")} /></Field>
        <Field label="Tonalität">
          <select className={inputCls} value={profile.tone} onChange={set("tone")}>
            {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <div className="md:col-span-2">
          <Field label="Aussehen (englisch, für den Bild-Prompt)">
            <textarea className={inputCls + " h-20 resize-none"} value={profile.appearance} onChange={set("appearance")} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Zielgruppe"><input className={inputCls} value={profile.audience} onChange={set("audience")} /></Field>
        </div>
        <Field label="Content-Säulen (Komma-getrennt)">
          <input className={inputCls} value={profile.pillars.join(", ")} onChange={setList("pillars")} />
        </Field>
        <Field label="Hashtags (Komma-getrennt)">
          <input className={inputCls} value={profile.hashtags.join(", ")} onChange={setList("hashtags")} />
        </Field>
        <Field label="Posts pro Woche">
          <input type="number" min={1} max={14} className={inputCls} value={profile.postsPerWeek}
            onChange={(e) => onChange({ postsPerWeek: Math.max(1, Math.min(14, Number(e.target.value) || 1)) })} />
        </Field>
        <Field label="Plattformen">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(PLATFORMS).map(([id, p]) => (
              <button key={id} type="button" onClick={() => togglePlatform(id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                  profile.platforms.includes(id) ? "bg-violet-600/30 border-violet-500/50 text-white" : "bg-white/[0.03] border-white/10 text-gray-500"
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </Field>
        {canDelete && (
          <div className="md:col-span-2 flex flex-wrap items-center gap-2 pt-3 border-t border-white/[0.06]">
            {confirmDelete ? (
              <>
                <span className="text-[12px] text-red-300">{profile.name} und {postCount} Posts endgültig löschen?</span>
                <button className={btnCls + " text-red-300"} onClick={onDelete}>Ja, löschen</button>
                <button className={btnCls} onClick={() => setConfirmDelete(false)}>Abbrechen</button>
              </>
            ) : (
              <button className={btnCls + " text-red-300"} onClick={() => setConfirmDelete(true)}>Profil löschen</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Single post card ───────────────────────────────────────────────────────
function PostCard({ post, profile, busy, onUpdate, onGenerate, onDelete }) {
  const setMetric = (key) => (e) => onUpdate({ metrics: { ...(post.metrics || {}), [key]: Number(e.target.value) || 0 } });
  const er = engagementRate(post.metrics);

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#121212] p-3 flex flex-col sm:flex-row gap-3">
      <div className="w-full max-w-[160px] sm:w-28 shrink-0">
        <div className="aspect-[4/5] rounded-lg overflow-hidden bg-[#1a1a1a] border border-white/[0.06] flex items-center justify-center">
          {busy ? (
            <div className="w-6 h-6 border-2 border-violet-500/20 border-t-violet-500 rounded-full animate-spin" />
          ) : safeImageUrl(post.imageUrl) ? (
            <img src={safeImageUrl(post.imageUrl)} alt={post.pillar} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] text-gray-600">kein Bild</span>
          )}
        </div>
        <button className={btnCls + " w-full mt-2"} disabled={busy} onClick={onGenerate}>
          {post.imageUrl ? "Neu" : "Bild"} generieren
        </button>
        {safeImageUrl(post.imageUrl) && (
          <button className={btnCls + " w-full mt-1"} onClick={() => downloadImage(safeImageUrl(post.imageUrl), `${profile.handle.replace(/[^A-Za-z0-9._-]/g, "") || "post"}_${post.id}.png`)}>
            Download
          </button>
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${STATUS_STYLE[post.status]}`}>{STATUS_LABEL[post.status]}</span>
          <select className="bg-transparent text-[11px] text-gray-300 outline-none" value={post.platform}
            onChange={(e) => onUpdate({ platform: e.target.value })}>
            {Object.entries(PLATFORMS).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
          </select>
          <select className="bg-transparent text-[11px] text-gray-300 outline-none" value={post.format}
            onChange={(e) => onUpdate({ format: e.target.value })}>
            {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <span className="text-[11px] text-violet-300 font-semibold">{post.pillar}</span>
          {post.exportedAt && post.status !== "gepostet" && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-violet-500/15 text-violet-300">in Buffer</span>
          )}
          <input type="datetime-local" className="ml-auto bg-transparent text-[11px] text-gray-400 outline-none"
            value={toLocalInput(post.scheduledAt)}
            onChange={(e) => e.target.value && onUpdate({ scheduledAt: new Date(e.target.value).toISOString() })} />
        </div>

        <textarea className={inputCls + " h-28 resize-y font-mono text-[11px]"} value={post.caption}
          onChange={(e) => onUpdate({ caption: e.target.value })} />

        <details className="text-[11px] text-gray-500">
          <summary className="cursor-pointer select-none">Bild-Prompt</summary>
          <textarea className={inputCls + " h-16 mt-1 resize-y text-[11px]"} value={post.prompt}
            onChange={(e) => onUpdate({ prompt: e.target.value })} />
        </details>

        {post.status === "gepostet" && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
            {["reach", "likes", "comments", "shares", "saves"].map((k) => (
              <label key={k} className="block">
                <span className="block text-[9px] uppercase text-gray-600 font-bold">
                  {{ reach: "Reichweite", likes: "Likes", comments: "Kommentare", shares: "Shares", saves: "Saves" }[k]}
                </span>
                <input type="number" min={0} className={inputCls + " py-1"} value={post.metrics?.[k] ?? ""} onChange={setMetric(k)} />
              </label>
            ))}
            <p className="col-span-2 sm:col-span-5 text-[11px] text-gray-500">Engagement: <span className="text-white font-semibold">{(er * 100).toFixed(1)} %</span></p>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          <button className={btnCls} onClick={() => { navigator.clipboard?.writeText(post.caption); toast.success("Caption kopiert"); }}>Caption kopieren</button>
          <button className={btnCls} onClick={() => onUpdate({ caption: buildCaption(profile, post) })}>Neue Caption</button>
          {post.status !== "freigegeben" && post.status !== "gepostet" && (
            <button className={btnCls} disabled={!post.imageUrl} onClick={() => onUpdate({ status: "freigegeben" })}>Freigeben</button>
          )}
          {post.status !== "gepostet" ? (
            <button className={btnCls} onClick={() => onUpdate({ status: "gepostet" })}>Als gepostet markieren</button>
          ) : (
            <button className={btnCls} onClick={() => onUpdate({ status: post.imageUrl ? "freigegeben" : "idee" })}>Zurücksetzen</button>
          )}
          {post.exportedAt && post.status !== "gepostet" && (
            <button className={btnCls} onClick={() => onUpdate({ exportedAt: "" })}>Erneut exportieren</button>
          )}
          <button className={btnCls + " ml-auto text-red-300"} onClick={onDelete}>Löschen</button>
        </div>
      </div>
    </div>
  );
}

// ─── Prompt randomizer ──────────────────────────────────────────────────────
function RandomizerTab({ profile, busyIds, onGenerate, onUseAppearance, onAddToPlan }) {
  const [locked, setLocked] = useState([]);
  const [count, setCount] = useState(3);
  const [mode, setMode] = useState("alltag");
  const [items, setItems] = useState([]);

  const roll = (m = mode) => {
    const base = items[0]?.traits || null;
    setItems(generateBatch(count, base, locked, Math.random, m).map((r) => ({ ...r, id: makeId("idea"), imageUrl: "" })));
  };

  // Switching the mode re-rolls right away; a locked person carries over.
  const switchMode = (m) => {
    if (m === mode) return;
    setMode(m);
    roll(m);
  };

  // Start with a batch so the tab shows what it does right away.
  useEffect(() => { roll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleLock = (group) =>
    setLocked((l) => (l.includes(group) ? l.filter((g) => g !== group) : [...l, group]));
  const updateItem = (id, patch) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const generate = async (item) => {
    const url = await onGenerate(item);
    if (url) updateItem(item.id, { imageUrl: url });
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="rounded-xl border border-white/[0.07] bg-[#121212] p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5" role="group" aria-label="Stil">
            {Object.entries(MODES).map(([id, label]) => (
              <button key={id} type="button" onClick={() => switchMode(id)} aria-pressed={mode === id}
                className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
                  mode === id ? "bg-violet-600 text-white" : "text-gray-400 hover:text-gray-200"
                }`}>
                {label}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-gray-400 flex-1 min-w-[220px]">
            {mode === "glamour"
              ? "Bademode, Fitness-, Abend- und Resort-Looks im Stil von Mode-Shootings – elegant und Instagram-konform."
              : "Alltags- und Lifestyle-Fotos im typischen Instagram-Stil."}
          </p>
        </div>
        <p className="text-[12px] text-gray-500">
          Frauen zwischen 20 und 25. Fixiere Bereiche, die gleich bleiben sollen – z. B. „Person“, um dieselbe Frau
          in immer neuen Szenen zu zeigen, auch beim Wechsel zwischen Alltag und Glamour.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(GROUPS).map(([id, g]) => (
            <button key={id} type="button" onClick={() => toggleLock(id)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                locked.includes(id) ? "bg-violet-600/30 border-violet-500/50 text-white" : "bg-white/[0.03] border-white/10 text-gray-400"
              }`}>
              {locked.includes(id) ? "🔒 " : ""}{g.label} {locked.includes(id) ? "fixiert" : "zufällig"}
            </button>
          ))}
          <select id="idea-count" className="ml-auto bg-[#161616] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-gray-200 outline-none"
            value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[1, 3, 5, 10].map((n) => <option key={n} value={n}>{n} {n === 1 ? "Prompt" : "Prompts"}</option>)}
          </select>
          <button className={primaryBtnCls} onClick={() => roll()}>🎲 Würfeln</button>
        </div>
      </div>

      {items.map((item) => (
        <div key={item.id} className="rounded-xl border border-white/[0.07] bg-[#121212] p-3 flex flex-col sm:flex-row gap-3">
          <div className="w-full max-w-[160px] sm:w-32 shrink-0">
            <div className="aspect-[4/5] rounded-lg overflow-hidden bg-[#1a1a1a] border border-white/[0.06] flex items-center justify-center">
              {busyIds[item.id] ? (
                <div className="w-6 h-6 border-2 border-violet-500/20 border-t-violet-500 rounded-full animate-spin" />
              ) : safeImageUrl(item.imageUrl) ? (
                <img src={safeImageUrl(item.imageUrl)} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] text-gray-600">kein Bild</span>
              )}
            </div>
            <button className={btnCls + " w-full mt-2"} disabled={!!busyIds[item.id]} onClick={() => generate(item)}>
              {item.imageUrl ? "Neu" : "Bild"} generieren
            </button>
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap gap-1">
              {[`${item.traits.age} Jahre`, item.traits.origin, item.traits.hairColor, item.traits.aesthetic, item.traits.location].map((t) => (
                <span key={t} className="px-2 py-0.5 rounded-md text-[10px] bg-white/[0.05] text-gray-400">{t}</span>
              ))}
            </div>
            <textarea className={inputCls + " h-28 resize-y text-[11px]"} value={item.prompt}
              onChange={(e) => updateItem(item.id, { prompt: e.target.value })} />
            <div className="flex flex-wrap gap-1.5">
              <button className={btnCls} onClick={() => {
                navigator.clipboard?.writeText(item.prompt).then(() => toast.success("Prompt kopiert"), () => toast.error("Kopieren nicht möglich – Text markieren und kopieren"));
              }}>Kopieren</button>
              <button className={btnCls} onClick={() => onAddToPlan(item)}>In Content-Plan von {profile.name}</button>
              <button className={btnCls} onClick={() => onUseAppearance(item)}>Als Aussehen von {profile.name}</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function InfluencerManagerStudio({
  apiKey,
  onGenerationStart,
  onGenerationEnd,
  onGenerationComplete,
  onGenerationError,
}) {
  const [state, setState] = useState(createDefaultState);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState("profile_1");
  const [view, setView] = useState("plan");
  const [busyIds, setBusyIds] = useState({});
  const [statusFilter, setStatusFilter] = useState("offen");
  const [followerInput, setFollowerInput] = useState("");
  const importRef = useRef(null);
  const [bulkConfirm, setBulkConfirm] = useState(null);
  // Latest state for the background automation, which runs outside renders.
  const stateRef = useRef(state);
  stateRef.current = state;
  const autoImagesRunning = useRef(false);

  // Load after mount so SSR markup matches the first client render.
  useEffect(() => {
    setState(loadState());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
  }, [state, loaded]);

  const profile = state.profiles.find((p) => p.id === activeId) || state.profiles[0];
  const insightsById = useMemo(
    () => Object.fromEntries(state.profiles.map((p) => [p.id, computeInsights(p, state.posts)])),
    [state],
  );
  const insights = insightsById[profile.id];

  const profilePosts = useMemo(() => {
    const mine = state.posts.filter((p) => p.profileId === profile.id);
    const filtered = statusFilter === "alle" ? mine
      : statusFilter === "offen" ? mine.filter((p) => p.status !== "gepostet")
      : mine.filter((p) => p.status === statusFilter);
    return filtered.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }, [state.posts, profile.id, statusFilter]);

  const updateProfile = (patch) =>
    setState((s) => ({ ...s, profiles: s.profiles.map((p) => (p.id === profile.id ? { ...p, ...patch } : p)) }));

  const updatePost = (id, patch) =>
    setState((s) => ({ ...s, posts: s.posts.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));

  const deletePost = (id) => setState((s) => ({ ...s, posts: s.posts.filter((p) => p.id !== id) }));

  const setBusy = (id, value) => setBusyIds((b) => {
    const next = { ...b };
    if (value) next[id] = true; else delete next[id];
    return next;
  });

  const requireKey = () => {
    if (apiKey) return true;
    toast.error("Bitte zuerst einen MuAPI-Key hinterlegen.");
    return false;
  };

  const runGeneration = async (busyId, fn) => {
    setBusy(busyId, true);
    onGenerationStart?.();
    try {
      const res = await fn();
      const url = safeImageUrl(res?.url);
      if (!url) throw new Error("Keine gültige https-Bild-URL in der Antwort.");
      onGenerationComplete?.({ url });
      return url;
    } catch (err) {
      const message = formatErrorMessage(err);
      toast.error(message);
      onGenerationError?.(message);
      return null;
    } finally {
      setBusy(busyId, false);
      onGenerationEnd?.();
    }
  };

  const generateAvatar = async (target = profile) => {
    if (!requireKey()) return;
    const models = imageModelsFor(stateRef.current.settings, "avatar");
    const url = await runGeneration(`avatar_${target.id}`, () => generateImage(apiKey, {
      model: models.t2i,
      prompt: `Ultra-realistic portrait photo of ${target.appearance}, neutral background, soft studio light, looking at camera, sharp facial detail`,
      aspect_ratio: "3:4",
    }));
    if (url) {
      setState((s) => ({ ...s, profiles: s.profiles.map((p) => (p.id === target.id ? { ...p, avatarUrl: url } : p)) }));
    }
  };

  // With a reference avatar, use the edit model so the face stays consistent.
  const generatePostImage = async (post) => {
    if (!requireKey()) return null;
    const owner = stateRef.current.profiles.find((p) => p.id === post.profileId);
    const aspect_ratio = post.format === "Reel" || post.format === "Story" ? "9:16" : PLATFORMS[post.platform]?.aspectRatio || "4:5";
    const reference = safeImageUrl(owner?.avatarUrl);
    const models = imageModelsFor(stateRef.current.settings, "post");
    const url = await runGeneration(post.id, () => (reference
      ? generateI2I(apiKey, {
          model: models.edit,
          images_list: [reference],
          prompt: `Same person as in the reference image, identical face. ${post.prompt}`,
          aspect_ratio,
        })
      : generateImage(apiKey, { model: models.t2i, prompt: post.prompt, aspect_ratio })));
    if (url) updatePost(post.id, { imageUrl: url, status: post.status === "idee" ? "bild" : post.status });
    return url;
  };

  // Bulk generation asks first and shows the estimated cost, because one
  // click across 20 profiles can mean dozens of paid images.
  const requestBulkImages = (profileIds) => {
    if (!requireKey()) return;
    const queue = bulkImageQueue(state, profileIds);
    if (queue.length === 0) { toast("Keine offenen Posts ohne Bild in den nächsten 7 Tagen."); return; }
    setBulkConfirm({ profileIds, count: queue.length, cost: estimateImageCost(queue.length, state.settings) });
  };

  const runBulkImages = async () => {
    const { profileIds } = bulkConfirm;
    setBulkConfirm(null);
    const queue = bulkImageQueue(stateRef.current, profileIds);
    toast(`${queue.length} Bilder werden generiert…`);
    // Sequential on purpose: keeps credit usage predictable and avoids rate limits.
    for (const post of queue) {
      // eslint-disable-next-line no-await-in-loop
      const url = await generatePostImage(post);
      if (!url) break; // stop on the first failure instead of burning credits
    }
  };

  const createWeekPlan = (profileIds) => {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    setState((s) => {
      const newPosts = s.profiles
        .filter((p) => profileIds.includes(p.id))
        .flatMap((p) => planWeek(p, start, computeInsights(p, s.posts)));
      // Remember the coverage so the automatic planner continues after this week.
      const end = new Date(start);
      end.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() + 7);
      return {
        ...s,
        posts: [...s.posts, ...newPosts],
        profiles: s.profiles.map((p) => (profileIds.includes(p.id) && !(p.plannedUntil && new Date(p.plannedUntil) >= end)
          ? { ...p, plannedUntil: end.toISOString() } : p)),
      };
    });
    toast.success(profileIds.length > 1 ? `Wochenplan für alle ${profileIds.length} Profile erstellt` : "Wochenplan erstellt");
    setView("plan");
  };

  const exportToBuffer = (platform) => {
    const { ready, skipped } = bufferExportFor(state, profile.id, platform);
    if (skipped.length) {
      toast.error(`${skipped.length} Posts übersprungen: Bild fehlt oder der Link endet nicht auf .jpg/.png/.webp.`);
    }
    if (ready.length === 0) {
      toast("Keine neuen freigegebenen Posts mit Bild für diesen Kanal.");
      return;
    }
    const handle = profile.handle.replace(/[^A-Za-z0-9._-]/g, "") || "profil";
    downloadText(`buffer_${handle}_${platform}_${new Date().toISOString().slice(0, 10)}.csv`, buildBufferCsv(ready), "text/csv;charset=utf-8");
    const ids = new Set(ready.map((p) => p.id));
    const exportedAt = new Date().toISOString();
    setState((s) => ({ ...s, posts: s.posts.map((p) => (ids.has(p.id) ? { ...p, exportedAt } : p)) }));
    toast.success(`${ready.length} ${ready.length === 1 ? "Post" : "Posts"} für ${PLATFORMS[platform].label} exportiert. Jetzt in Buffer beim Kanal von ${profile.handle} hochladen.`);
  };

  const generateIdeaImage = async (item) => {
    if (!requireKey()) return null;
    const models = imageModelsFor(stateRef.current.settings, "post");
    return runGeneration(item.id, () => generateImage(apiKey, { model: models.t2i, prompt: item.prompt, aspect_ratio: "4:5" }));
  };

  const useIdeaAppearance = (item) => {
    const image = safeImageUrl(item.imageUrl);
    updateProfile({ appearance: item.appearance, ...(image ? { avatarUrl: image } : {}) });
    toast.success(image
      ? `Aussehen und Referenzbild von ${profile.name} übernommen`
      : `Aussehen übernommen – erzeuge im Tab „Profil“ ein neues Referenzbild`);
  };

  const addIdeaToPlan = (item) => {
    const platform = profile.platforms[0] || "instagram";
    const when = new Date();
    when.setDate(when.getDate() + 1);
    when.setHours(bestHourFor(platform), 0, 0, 0);
    const image = safeImageUrl(item.imageUrl);
    const post = {
      id: makeId("post"),
      profileId: profile.id,
      platform,
      format: "Foto",
      pillar: item.traits.mode === "glamour" ? "Glamour" : "Prompt-Idee",
      scene: "",
      scheduledAt: when.toISOString(),
      status: image ? "bild" : "idee",
      imageUrl: image,
      exportedAt: "",
      metrics: null,
      prompt: item.prompt,
    };
    post.caption = buildCaption(profile, post);
    setState((s) => ({ ...s, posts: [...s.posts, post] }));
    toast.success(`Zum Content-Plan von ${profile.name} hinzugefügt (morgen ${String(when.getHours()).padStart(2, "0")}:00)`);
  };

  const refreshPrompts = () => {
    setState((s) => ({
      ...s,
      posts: s.posts.map((p) => (p.profileId === profile.id && p.status === "idee" ? { ...p, prompt: buildImagePrompt(profile, p) } : p)),
    }));
    toast.success("Prompts der offenen Ideen aktualisiert");
  };

  const logFollowers = () => {
    const count = Number(followerInput);
    if (!Number.isFinite(count) || count < 0) return;
    const date = new Date().toISOString().slice(0, 10);
    const others = (profile.followers || []).filter((f) => f.date !== date);
    updateProfile({ followers: [...others, { date, count }] });
    setFollowerInput("");
  };

  const importBackup = async (file) => {
    if (file.size > MAX_IMPORT_BYTES) {
      toast.error("Backup ist größer als 5 MB und wurde nicht importiert.");
      return;
    }
    try {
      const text = await file.text();
      JSON.parse(text); // reject non-JSON instead of silently resetting to defaults
      const parsed = parseState(text);
      setState(parsed);
      setActiveId(parsed.profiles[0]?.id);
      toast.success("Backup importiert");
    } catch {
      toast.error("Backup konnte nicht gelesen werden");
    }
  };

  const settings = sanitizeSettings(state.settings);
  const updateSettings = (patch) =>
    setState((s) => ({ ...s, settings: { ...sanitizeSettings(s.settings), ...patch } }));

  // Automation: while the app is open, check on start and then hourly that
  // every profile is planned ahead, and (opt-in) pre-generate images for
  // posts due in the next two days, within the daily credit cap.
  useEffect(() => {
    if (!loaded) return undefined;
    const tick = async () => {
      const current = stateRef.current;
      const cfg = sanitizeSettings(current.settings);
      const published = markPublishedExports(current);
      if (published.changed) {
        setState((s) => markPublishedExports(s).state);
        toast(`${published.changed} Posts wurden von Buffer veröffentlicht – trag die Reichweite ein.`);
      }
      let added = [];
      if (cfg.autoPlan) {
        const plan = ensurePlanned(current);
        added = plan.added;
        // Coverage is saved even when nothing new was needed, so the next
        // check starts from the right day.
        setState((s) => applyPlan(s, plan));
        if (added.length) toast.success(`Automatisch geplant: ${added.length} neue Posts`);
      }
      if (!cfg.autoImages || !apiKey || autoImagesRunning.current) return;
      const queue = pickAutoImageQueue({ ...current, posts: [...current.posts, ...added] });
      if (queue.length === 0) return;
      autoImagesRunning.current = true;
      try {
        for (const post of queue) {
          // eslint-disable-next-line no-await-in-loop
          const url = await generatePostImage(post);
          if (!url) break; // stop on the first failure instead of burning credits
          const today = new Date().toISOString().slice(0, 10);
          setState((s) => {
            const log = sanitizeSettings(s.settings).imageLog;
            const count = log.date === today ? log.count + 1 : 1;
            return { ...s, settings: { ...sanitizeSettings(s.settings), imageLog: { date: today, count } } };
          });
        }
      } finally {
        autoImagesRunning.current = false;
      }
    };
    tick();
    const timer = setInterval(tick, 60 * 60 * 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Re-run when profiles are added or removed so new ones get planned at once.
  }, [loaded, apiKey, settings.autoPlan, settings.autoImages, settings.planAheadDays, settings.imagesPerDay, state.profiles.length]);

  const presetsMissing = missingPresetCount(state);

  const addPresets = () => {
    const { state: next, added } = addPresetProfiles(state);
    setState(next);
    toast.success(`${added} Profile hinzugefügt – sie werden automatisch eingeplant.`);
  };

  // New profile with a random adult woman (20–25) from the prompt randomizer.
  const addRandomProfile = () => {
    const [idea] = generateBatch(1);
    const created = createBlankProfile(idea.appearance, state.profiles.length);
    setState((s) => ({ ...s, profiles: [...s.profiles, created] }));
    setActiveId(created.id);
    setView("profil");
    toast.success("Neues Profil angelegt – Name, Nische und Plattformen anpassen.");
  };

  const deleteProfile = () => {
    const name = profile.name;
    const next = removeProfile(state, profile.id);
    setState(next);
    setActiveId(next.profiles[0].id);
    toast.success(`${name} gelöscht`);
  };

  const allIds = state.profiles.map((p) => p.id);
  const dueToday = state.posts.filter((p) => p.status === "freigegeben" && new Date(p.scheduledAt) <= new Date());

  return (
    <div className="h-full w-full flex flex-col md:flex-row bg-[#0b0b0b] text-white overflow-hidden">
      {/* Profiles sidebar */}
      <aside className="w-full md:w-[220px] shrink-0 border-b md:border-b-0 md:border-r border-white/[0.07] bg-[#101010] flex flex-col max-h-[45%] md:max-h-none">
        <div className="px-4 py-4 border-b border-white/[0.07]">
          <p className="text-[13px] font-bold">Influencer Manager</p>
          <p className="text-[10px] text-gray-500 mt-0.5">{state.profiles.length} KI-Profile · Plan · Reichweite</p>
          {(presetsMissing > 0 || state.profiles.length < MAX_PROFILES) && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {presetsMissing > 0 && (
                <button className={btnCls + " px-2 py-1 text-[11px]"} onClick={addPresets}>+ {presetsMissing} Vorlagen</button>
              )}
              {state.profiles.length < MAX_PROFILES && (
                <button className={btnCls + " px-2 py-1 text-[11px]"} onClick={addRandomProfile}>+ Neues Profil</button>
              )}
            </div>
          )}
        </div>
        <div className="md:flex-1 flex md:block gap-1 overflow-x-auto md:overflow-y-auto p-2 md:space-y-1">
          {state.profiles.map((p) => {
            const ins = insightsById[p.id];
            const open = state.posts.filter((x) => x.profileId === p.id && x.status !== "gepostet").length;
            return (
              <button key={p.id} type="button" onClick={() => setActiveId(p.id)}
                className={`min-w-[170px] md:min-w-0 w-full flex items-center gap-2.5 p-2 rounded-xl text-left transition-colors ${
                  p.id === profile.id ? "bg-violet-600/20 border border-violet-500/40" : "border border-transparent hover:bg-white/[0.04]"
                }`}>
                <div className="w-10 h-10 rounded-full overflow-hidden bg-[#1c1c1c] shrink-0 flex items-center justify-center text-[13px] font-bold text-gray-500">
                  {safeImageUrl(p.avatarUrl) ? <img src={safeImageUrl(p.avatarUrl)} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" /> : p.name.slice(0, 1)}
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold truncate">{p.name}</p>
                  <p className="text-[10px] text-gray-500 truncate">{p.handle}</p>
                  <p className="text-[10px] text-gray-600">{formatNumber(ins.followersLatest)} Follower · {open} geplant</p>
                </div>
              </button>
            );
          })}
        </div>
        <div className="p-3 border-t border-white/[0.07] grid grid-cols-2 md:grid-cols-1 gap-1.5">
          <button className={primaryBtnCls + " w-full"} onClick={() => createWeekPlan(allIds)}>Wochenplan für alle</button>
          <button className={btnCls + " w-full"} disabled={Object.keys(busyIds).length > 0} onClick={() => requestBulkImages(allIds)}>Alle Bilder generieren</button>
          <button className={btnCls + " w-full"} onClick={() => downloadText(`content-plan_${new Date().toISOString().slice(0, 10)}.csv`, exportScheduleCsv(state), "text/csv;charset=utf-8")}>Plan als CSV</button>
          <div className="flex gap-1.5 col-span-2 md:col-span-1">
            <button className={btnCls + " flex-1"} onClick={() => downloadText("influencer-backup.json", JSON.stringify(state, null, 2), "application/json")}>Backup</button>
            <button className={btnCls + " flex-1"} onClick={() => importRef.current?.click()}>Import</button>
            <input ref={importRef} type="file" accept="application/json" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importBackup(f); e.target.value = ""; }} />
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 min-h-0 flex flex-col">
        <div className="flex flex-wrap items-center gap-1 px-4 md:px-6 pt-4 pb-3 border-b border-white/[0.07] shrink-0">
          {[["plan", "Content-Plan"], ["profil", "Profil"], ["analytics", "Reichweite"], ["ideen", "Prompt-Ideen"], ["overview", "Übersicht"], ["auto", "Automatik"]].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setView(id)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${view === id ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"}`}>
              {label}
            </button>
          ))}
          {dueToday.length > 0 && (
            <span className="ml-auto text-[11px] text-amber-300 font-semibold">{dueToday.length} freigegebene Posts sind fällig</span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {bulkConfirm && (
            <div className="max-w-4xl mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-wrap items-center gap-3">
              <p className="text-[12px] text-amber-100 flex-1 min-w-[220px]">
                {bulkConfirm.count} Bilder für Posts der nächsten 7 Tage generieren?
                Kosten ca. <span className="font-bold">{formatUsd(bulkConfirm.cost)}</span> ({IMAGE_QUALITY[settings.imageQuality].label}-Qualität).
              </p>
              <button className={primaryBtnCls} onClick={runBulkImages}>Ja, generieren</button>
              <button className={btnCls} onClick={() => setBulkConfirm(null)}>Abbrechen</button>
            </div>
          )}
          {view === "profil" && (
            <ProfileTab key={profile.id} profile={profile} onChange={updateProfile} busy={!!busyIds[`avatar_${profile.id}`]} onGenerateAvatar={() => generateAvatar(profile)}
              canDelete={state.profiles.length > 1} onDelete={deleteProfile}
              postCount={state.posts.filter((p) => p.profileId === profile.id).length} />
          )}

          {view === "plan" && (
            <div className="space-y-3 max-w-4xl">
              <div className="flex flex-wrap items-center gap-2">
                <button className={primaryBtnCls} onClick={() => createWeekPlan([profile.id])}>+ Wochenplan für {profile.name}</button>
                <button className={btnCls} disabled={Object.keys(busyIds).length > 0} onClick={() => requestBulkImages([profile.id])}>Offene Bilder generieren</button>
                <button className={btnCls} onClick={refreshPrompts}>Prompts aus Profil erneuern</button>
                <select className="ml-auto bg-[#161616] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-gray-200 outline-none" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="offen">Offen</option>
                  <option value="alle">Alle</option>
                  {POST_STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-[#121212] px-3 py-2">
                <span className="text-[11px] font-semibold text-gray-400">Für Buffer exportieren:</span>
                {profile.platforms.map((pl) => {
                  const n = bufferExportFor(state, profile.id, pl).ready.length;
                  return (
                    <button key={pl} className={btnCls} disabled={n === 0} onClick={() => exportToBuffer(pl)}>
                      {PLATFORMS[pl]?.label || pl} ({n})
                    </button>
                  );
                })}
                <span className="text-[10px] text-gray-600 w-full">Nur freigegebene Posts mit Bild. Danach in Buffer: Kanal öffnen → Bulk Upload → Datei hochladen.</span>
              </div>
              {!profile.avatarUrl && (
                <p className="text-[11px] text-amber-300/80">Tipp: Erst im Tab „Profil“ ein Referenzbild erzeugen – dann sieht {profile.name} in jedem Post gleich aus.</p>
              )}
              {profilePosts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 p-10 text-center text-[12px] text-gray-500">
                  Keine Posts in dieser Ansicht. Erstelle einen Wochenplan.
                </div>
              ) : profilePosts.map((post) => (
                <PostCard key={post.id} post={post} profile={profile} busy={!!busyIds[post.id]}
                  onUpdate={(patch) => updatePost(post.id, patch)}
                  onGenerate={() => generatePostImage(post)}
                  onDelete={() => deletePost(post.id)} />
              ))}
            </div>
          )}

          {view === "analytics" && (
            <div className="space-y-5 max-w-4xl">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Follower" value={formatNumber(insights.followersLatest)} hint={`${insights.followerGrowth >= 0 ? "+" : ""}${formatNumber(insights.followerGrowth)} seit Start`} />
                <Kpi label="Reichweite gesamt" value={formatNumber(insights.totalReach)} hint={`${insights.postedCount} Posts erfasst`} />
                <Kpi label="Ø Engagement" value={`${(insights.avgEngagement * 100).toFixed(1)} %`} />
                <Kpi label="Top-Säule" value={insights.topPillar || "–"} />
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-[#121212] p-4">
                <p className="text-[12px] font-bold mb-2">Follower-Stand eintragen</p>
                <div className="flex gap-2">
                  <input type="number" min={0} className={inputCls + " max-w-[180px]"} value={followerInput}
                    onChange={(e) => setFollowerInput(e.target.value)} placeholder="z. B. 1250" />
                  <button className={btnCls} onClick={logFollowers}>Speichern (heute)</button>
                </div>
                {profile.followers?.length > 0 && (
                  <div className="flex items-end gap-1 h-24 mt-4">
                    {[...profile.followers].sort((a, b) => a.date.localeCompare(b.date)).slice(-30).map((f) => {
                      const max = Math.max(...profile.followers.map((x) => x.count), 1);
                      return (
                        <div key={f.date} title={`${f.date}: ${formatNumber(f.count)}`} className="flex-1 bg-violet-500/60 rounded-t min-h-[2px]"
                          style={{ height: `${(f.count / max) * 100}%` }} />
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-[#121212] p-4">
                <p className="text-[12px] font-bold mb-2">Empfehlungen</p>
                <ul className="space-y-1.5 text-[12px] text-gray-300 list-disc pl-4">
                  {insights.tips.length ? insights.tips.map((t) => <li key={t}>{t}</li>) : <li>Läuft gut – Kurs halten und regelmäßig posten.</li>}
                </ul>
                {Object.keys(insights.bestHourByPlatform).length > 0 && (
                  <p className="text-[11px] text-gray-500 mt-3">
                    Beste Uhrzeit laut deinen Daten: {Object.entries(insights.bestHourByPlatform).map(([pl, h]) => `${PLATFORMS[pl]?.label || pl} ${h}:00`).join(" · ")}
                  </p>
                )}
              </div>
            </div>
          )}

          {view === "ideen" && (
            <RandomizerTab profile={profile} busyIds={busyIds} onGenerate={generateIdeaImage}
              onUseAppearance={useIdeaAppearance} onAddToPlan={addIdeaToPlan} />
          )}

          {view === "auto" && (
            <div className="space-y-4 max-w-2xl">
              <div className="rounded-xl border border-white/[0.07] bg-[#121212] p-4 space-y-3">
                <p className="text-[13px] font-semibold">Bildkosten</p>
                <div className="grid sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Bildqualität">
                  {Object.entries(IMAGE_QUALITY).map(([id, q]) => (
                    <button key={id} type="button" role="radio" aria-checked={settings.imageQuality === id}
                      onClick={() => updateSettings({ imageQuality: id })}
                      className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                        settings.imageQuality === id ? "border-violet-500/60 bg-violet-600/15" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                      }`}>
                      <span className="block text-[13px] font-semibold">{q.label} · ca. {formatUsd(q.pricePerImage)} pro Bild</span>
                      <span className="block text-[11px] text-gray-500">{q.model}{id === "sparsam" ? " – reicht für Instagram-Auflösung" : " – feinere Details, 4× teurer"}</span>
                    </button>
                  ))}
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input id="avatar-premium" type="checkbox" className="mt-0.5 accent-violet-500" checked={settings.avatarPremium}
                    onChange={(e) => updateSettings({ avatarPremium: e.target.checked })} />
                  <span>
                    <span className="block text-[12px] font-semibold">Referenzbilder immer in Premium</span>
                    <span className="block text-[11px] text-gray-500">Wird pro Profil nur einmal erzeugt und bestimmt das Gesicht in allen Posts – lohnt sich.</span>
                  </span>
                </label>
                <p className="text-[11px] text-gray-500">
                  {(() => {
                    const { posts, cost } = weeklyImageEstimate(state);
                    const premium = estimateImageCost(posts, { ...settings, imageQuality: "premium" });
                    return `Bei ${posts} Posts pro Woche: ca. ${formatUsd(cost)} pro Woche, ${formatUsd(cost * 4.3)} pro Monat`
                      + (settings.imageQuality !== "premium" ? ` (in Premium: ${formatUsd(premium)} pro Woche).` : ".");
                  })()}
                  {" "}Preise laut MuAPI, Stand Oktober 2026 – abgerechnet wird der tatsächliche Betrag.
                </p>
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-[#121212] p-4 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input id="auto-plan" type="checkbox" className="mt-0.5 accent-violet-500" checked={settings.autoPlan}
                    onChange={(e) => updateSettings({ autoPlan: e.target.checked })} />
                  <span>
                    <span className="block text-[13px] font-semibold">Content-Plan automatisch erstellen</span>
                    <span className="block text-[11px] text-gray-500">Beim Öffnen der App und danach stündlich wird für jedes Profil nachgeplant, sodass immer genug Posts geplant sind. Die Planung nutzt deine Reichweiten-Daten.</span>
                  </span>
                </label>
                <Field label="Immer so viele Tage im Voraus planen">
                  <input id="plan-ahead" type="number" min={3} max={28} className={inputCls + " max-w-[120px]"} value={settings.planAheadDays}
                    onChange={(e) => updateSettings({ planAheadDays: Number(e.target.value) })} />
                </Field>
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-[#121212] p-4 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input id="auto-images" type="checkbox" className="mt-0.5 accent-violet-500" checked={settings.autoImages}
                    onChange={(e) => updateSettings({ autoImages: e.target.checked })} />
                  <span>
                    <span className="block text-[13px] font-semibold">Bilder automatisch generieren</span>
                    <span className="block text-[11px] text-gray-500">Erzeugt Bilder für Posts, die in den nächsten 2 Tagen fällig sind. Kostet MuAPI-Guthaben, deshalb mit Tageslimit. Freigeben musst du weiterhin selbst.</span>
                  </span>
                </label>
                <Field label="Maximal Bilder pro Tag">
                  <input id="images-per-day" type="number" min={0} max={50} className={inputCls + " max-w-[120px]"} value={settings.imagesPerDay}
                    onChange={(e) => updateSettings({ imagesPerDay: Number(e.target.value) })} />
                </Field>
                <p className="text-[11px] text-gray-500">
                  Heute automatisch erzeugt: {settings.imageLog.date === new Date().toISOString().slice(0, 10) ? settings.imageLog.count : 0} / {settings.imagesPerDay}
                  {!apiKey && " · Ohne MuAPI-Key werden keine Bilder erzeugt."}
                </p>
              </div>

              <p className="text-[11px] text-gray-600 leading-relaxed">
                Die Automatik läuft, solange die App in einem Browser-Tab offen ist. Ist sie zu, holt sie beim nächsten Öffnen alles nach.
                Veröffentlicht wird über Buffer: Im Content-Plan freigegebene Posts mit „Für Buffer exportieren“ herunterladen und in Buffer hochladen.
                Sobald die geplante Zeit vorbei ist, setzt die App diese Posts automatisch auf „Gepostet“, damit du die Reichweite eintragen kannst.
              </p>
            </div>
          )}

          {view === "overview" && (
            <div className="max-w-5xl overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500">
                    {["Profil", "Nische", "Follower", "Wachstum", "Reichweite", "Ø Engagement", "Geplant", "Fällig"].map((h) => <th key={h} className="py-2 pr-4">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {state.profiles.map((p) => {
                    const ins = insightsById[p.id];
                    const planned = state.posts.filter((x) => x.profileId === p.id && x.status !== "gepostet").length;
                    const due = dueToday.filter((x) => x.profileId === p.id).length;
                    return (
                      <tr key={p.id} className="border-t border-white/[0.06] hover:bg-white/[0.02] cursor-pointer" onClick={() => { setActiveId(p.id); setView("plan"); }}>
                        <td className="py-2 pr-4 font-semibold">{p.name} <span className="text-gray-500 font-normal">{p.handle}</span></td>
                        <td className="py-2 pr-4 text-gray-400">{p.niche}</td>
                        <td className="py-2 pr-4">{formatNumber(ins.followersLatest)}</td>
                        <td className={`py-2 pr-4 ${ins.followerGrowth >= 0 ? "text-emerald-300" : "text-red-300"}`}>{ins.followerGrowth >= 0 ? "+" : ""}{formatNumber(ins.followerGrowth)}</td>
                        <td className="py-2 pr-4">{formatNumber(ins.totalReach)}</td>
                        <td className="py-2 pr-4">{(ins.avgEngagement * 100).toFixed(1)} %</td>
                        <td className="py-2 pr-4">{planned}</td>
                        <td className={`py-2 pr-4 ${due ? "text-amber-300 font-semibold" : "text-gray-600"}`}>{due}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[11px] text-gray-600 mt-4 leading-relaxed">
                Gepostet wird manuell oder per CSV-Import in ein Scheduling-Tool (z. B. Buffer, Later, Meta Business Suite).
                Captions enthalten automatisch einen KI-Hinweis – Instagram, TikTok und YouTube verlangen eine Kennzeichnung von KI-Inhalten.
              </p>
            </div>
          )}
        </div>
      </main>
      <Toaster position="top-right" containerStyle={{ zIndex: 99999 }} toastOptions={{ style: { background: "#18181b", color: "#fff", border: "1px solid rgba(255,255,255,0.15)", fontSize: "13px" } }} />
    </div>
  );
}
