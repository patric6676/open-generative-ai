const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const modulePath = pathToFileURL(path.join(__dirname, '../packages/studio/src/influencerManager.js')).href;
const load = () => import(modulePath);

// Deterministic PRNG so plans are reproducible.
function seeded(seed = 1) {
    let s = seed;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

test('default state has five distinct profiles', async () => {
    const { createDefaultState } = await load();
    const state = createDefaultState();
    assert.equal(state.profiles.length, 5);
    assert.equal(new Set(state.profiles.map((p) => p.id)).size, 5);
    assert.deepEqual(state.posts, []);
});

test('parseState falls back to defaults on garbage and caps profiles', async () => {
    const { parseState, createDefaultState } = await load();
    assert.equal(parseState('not json').profiles.length, 5);
    assert.equal(parseState({ foo: 1 }).profiles.length, 5);
    const many = createDefaultState();
    many.profiles = Array.from({ length: 5 }, () => many.profiles).flat();
    assert.equal(parseState(JSON.stringify(many)).profiles.length, 20);
});

test('planWeek creates postsPerWeek posts within 7 days with captions and AI disclosure', async () => {
    const { createDefaultState, planWeek, AI_DISCLOSURE } = await load();
    const profile = createDefaultState().profiles[0];
    const start = new Date('2026-10-19T00:00:00');
    const posts = planWeek(profile, start, null, seeded());
    assert.equal(posts.length, profile.postsPerWeek);
    for (const post of posts) {
        const diffDays = (new Date(post.scheduledAt) - start) / 86400000;
        assert.ok(diffDays >= 0 && diffDays < 7, `post outside week: ${post.scheduledAt}`);
        assert.ok(profile.platforms.includes(post.platform));
        assert.ok(post.caption.includes(AI_DISCLOSURE));
        assert.ok(post.prompt.includes(profile.appearance));
        assert.equal(post.status, 'idee');
    }
    // Every pillar is used at least once when there are enough slots.
    assert.deepEqual(new Set(posts.map((p) => p.pillar)), new Set(profile.pillars));
});

test('caption respects per-platform hashtag limit', async () => {
    const { createDefaultState, buildCaption } = await load();
    const profile = createDefaultState().profiles[2];
    const caption = buildCaption(profile, { platform: 'x', format: 'Foto', pillar: 'Tech-News' }, seeded());
    const tags = caption.split(/\s+/).filter((w) => w.startsWith('#'));
    assert.ok(tags.length <= 3, `too many hashtags: ${tags.length}`);
});

test('engagementRate weights interactions against reach', async () => {
    const { engagementRate } = await load();
    assert.equal(engagementRate(null), 0);
    assert.equal(engagementRate({ reach: 0, likes: 10 }), 0);
    assert.equal(engagementRate({ reach: 100, likes: 5, comments: 1, shares: 1, saves: 0 }), 0.1);
});

test('computeInsights learns top pillar, best hour and follower growth', async () => {
    const { createDefaultState, computeInsights } = await load();
    const profile = { ...createDefaultState().profiles[0], followers: [{ date: '2026-10-01', count: 100 }, { date: '2026-10-10', count: 340 }] };
    const at = (h) => new Date(2026, 9, 12, h).toISOString();
    const posts = [
        { profileId: profile.id, status: 'gepostet', pillar: 'Mindset', platform: 'instagram', scheduledAt: at(20), metrics: { reach: 1000, likes: 200 } },
        { profileId: profile.id, status: 'gepostet', pillar: 'Meal-Prep', platform: 'instagram', scheduledAt: at(7), metrics: { reach: 1000, likes: 10 } },
        { profileId: 'other', status: 'gepostet', pillar: 'X', platform: 'instagram', scheduledAt: at(7), metrics: { reach: 99999, likes: 1 } },
    ];
    const ins = computeInsights(profile, posts);
    assert.equal(ins.postedCount, 2);
    assert.equal(ins.totalReach, 2000);
    assert.equal(ins.topPillar, 'Mindset');
    assert.equal(ins.bestHourByPlatform.instagram, 20);
    assert.equal(ins.followerGrowth, 240);
    assert.equal(ins.followersLatest, 340);
});

test('insights feed back into the next plan (learned hour is used)', async () => {
    const { createDefaultState, planWeek } = await load();
    const profile = { ...createDefaultState().profiles[0], platforms: ['instagram'] };
    const posts = planWeek(profile, new Date('2026-10-19T00:00:00'), { bestHourByPlatform: { instagram: 21 }, pillarScore: {} }, seeded());
    for (const post of posts) assert.equal(new Date(post.scheduledAt).getHours(), 21);
});

test('exportScheduleCsv escapes multi-line captions', async () => {
    const { createDefaultState, planWeek, exportScheduleCsv } = await load();
    const state = createDefaultState();
    state.posts = planWeek(state.profiles[0], new Date('2026-10-19T00:00:00'), null, seeded());
    const csv = exportScheduleCsv(state);
    assert.ok(csv.startsWith('profil,handle,plattform'));
    // Captions contain newlines, so each must be wrapped in quotes.
    const quoted = csv.match(/"[^"]*🤖 KI-generierter Charakter"/g) || [];
    assert.equal(quoted.length, state.posts.length);
});

test('safeImageUrl only allows plain https URLs', async () => {
    const { safeImageUrl } = await load();
    assert.equal(safeImageUrl('https://cdn.muapi.ai/a.png'), 'https://cdn.muapi.ai/a.png');
    for (const bad of ['javascript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>', 'http://example.com/a.png',
        'file:///etc/passwd', 'https://user:pw@example.com/a.png', '  ', null, 42, 'https://x.com/' + 'a'.repeat(3000)]) {
        assert.equal(safeImageUrl(bad), '', `should reject ${String(bad).slice(0, 40)}`);
    }
});

test('parseState sanitises a hostile backup', async () => {
    const { parseState } = await load();
    const hostile = {
        profiles: [
            { id: 'p1', name: 'A'.repeat(10000), tone: 'constructor', platforms: ['instagram', '__proto__', 'evil'],
              avatarUrl: 'javascript:alert(1)', postsPerWeek: 1e9, pillars: ['__proto__', 'ok'],
              followers: [{ date: '2026-01-01', count: 'NaN' }, { date: '<img>', count: 5 }] },
            { id: 'p1', name: 'Duplicate' },
            { id: '../../etc', name: 'Bad id' },
        ],
        posts: [
            { id: 'x', profileId: 'p1', scheduledAt: '2026-10-20T10:00:00Z', platform: '__proto__', status: 'hacked',
              imageUrl: 'data:text/html,<script>', caption: '=HYPERLINK("http://evil")', metrics: { reach: -5, likes: 'abc' } },
            { id: 'y', profileId: 'unknown', scheduledAt: '2026-10-20T10:00:00Z' },
            { id: 'z', profileId: 'p1', scheduledAt: 'not a date' },
            '<script>',
        ],
    };
    const state = parseState(JSON.stringify(hostile));
    const [p1, dup, bad] = state.profiles;
    assert.equal(p1.name.length, 80);
    assert.equal(p1.tone, 'motivierend');
    assert.deepEqual(p1.platforms, ['instagram']);
    assert.equal(p1.avatarUrl, '');
    assert.equal(p1.postsPerWeek, 14);
    assert.deepEqual(p1.followers, [{ date: '2026-01-01', count: 0 }]);
    assert.notEqual(dup.id, 'p1');
    assert.equal(bad.id, 'profile_3');
    assert.equal(state.posts.length, 1);
    const post = state.posts[0];
    assert.equal(post.platform, 'instagram');
    assert.equal(post.status, 'idee');
    assert.equal(post.imageUrl, '');
    assert.deepEqual(post.metrics, { reach: 0, likes: 0, comments: 0, shares: 0, saves: 0 });
});

test('analytics survive a pillar called __proto__', async () => {
    const { parseState, computeInsights, planWeek } = await load();
    const state = parseState({
        profiles: [{ id: 'p1', name: 'A', pillars: ['__proto__', 'constructor'], platforms: ['instagram'] }],
        posts: [{ id: 'a', profileId: 'p1', pillar: '__proto__', status: 'gepostet', platform: 'instagram',
                  scheduledAt: '2026-10-20T10:00:00Z', metrics: { reach: 100, likes: 10 } }],
    });
    const ins = computeInsights(state.profiles[0], state.posts);
    assert.equal(ins.postedCount, 1);
    assert.equal(Object.getPrototypeOf({}).push, undefined); // prototype untouched
    assert.equal(planWeek(state.profiles[0], new Date('2026-10-19T00:00:00'), ins, seeded()).length, 3);
});

test('CSV export neutralises spreadsheet formulas', async () => {
    const { createDefaultState, planWeek, exportScheduleCsv } = await load();
    const state = createDefaultState();
    const [post] = planWeek(state.profiles[0], new Date('2026-10-19T00:00:00'), null, seeded());
    post.caption = '=cmd|" /C calc"!A0';
    state.profiles[0].name = '@SUM(1+1)';
    state.posts = [post];
    const line = exportScheduleCsv(state).split('\n')[1];
    assert.ok(line.startsWith("'@SUM(1+1)"), line);
    assert.ok(line.includes(`"'=cmd|"" /C calc""!A0"`), line);
});

test('ensurePlanned plans exactly one week and is idempotent', async () => {
    const { createDefaultState, ensurePlanned, applyPlan } = await load();
    let state = createDefaultState();
    const now = new Date('2026-10-15T10:00:00');
    const first = ensurePlanned(state, now, seeded());
    // One week per profile: 5 + 4 + 6 + 4 + 5 posts.
    assert.equal(first.added.length, 24);
    state = applyPlan(state, first);
    assert.equal(ensurePlanned(state, now, seeded()).added.length, 0, 'second run must not duplicate');
    // A week later exactly one more week is added, after the covered range.
    const covered = Math.min(...Object.values(first.plannedUntil).map((d) => +new Date(d)));
    const more = ensurePlanned(state, new Date('2026-10-22T10:00:00'), seeded());
    assert.equal(more.added.length, 24);
    assert.ok(more.added.every((p) => +new Date(p.scheduledAt) >= covered));
});

test('ensurePlanned respects planAheadDays and handles data without coverage', async () => {
    const { createDefaultState, ensurePlanned } = await load();
    const state = createDefaultState();
    state.settings.planAheadDays = 14;
    const now = new Date('2026-10-15T10:00:00');
    const { added } = ensurePlanned(state, now, seeded());
    assert.equal(added.length, 48, 'two full weeks for 14 days ahead');
    // Old data without plannedUntil falls back to the last open post.
    state.settings.planAheadDays = 7;
    state.posts = added;
    assert.equal(ensurePlanned(state, now, seeded()).added.length, 0);
});

test('pickAutoImageQueue is opt-in and respects the daily cap', async () => {
    const { createDefaultState, ensurePlanned, pickAutoImageQueue } = await load();
    const state = createDefaultState();
    const now = new Date('2026-10-15T10:00:00');
    state.posts = ensurePlanned(state, now, seeded()).added;
    assert.equal(pickAutoImageQueue(state, now).length, 0, 'off by default');
    state.settings.autoImages = true;
    state.settings.imagesPerDay = 3;
    const queue = pickAutoImageQueue(state, now);
    assert.ok(queue.length <= 3 && queue.length > 0);
    assert.ok(queue.every((p) => +new Date(p.scheduledAt) <= +now + 2 * 86400000));
    state.settings.imageLog = { date: '2026-10-15', count: 3 };
    assert.equal(pickAutoImageQueue(state, now).length, 0, 'quota used up');
});

test('Buffer export: exact headers, time format, only approved future posts with direct images', async () => {
    const { createDefaultState, planWeek, bufferExportFor, buildBufferCsv } = await load();
    const state = createDefaultState();
    const profile = { ...state.profiles[0], platforms: ['instagram'] };
    const now = new Date('2026-10-15T10:00:00');
    const posts = planWeek(profile, new Date('2026-10-16T00:00:00'), null, seeded());
    posts[0].status = 'freigegeben'; posts[0].imageUrl = 'https://cdn.muapi.ai/out/a.png';
    posts[1].status = 'freigegeben'; posts[1].imageUrl = 'https://cdn.muapi.ai/out/no-extension';
    posts[2].status = 'bild'; posts[2].imageUrl = 'https://cdn.muapi.ai/out/c.jpg';
    posts[3].status = 'freigegeben'; posts[3].imageUrl = 'https://cdn.muapi.ai/out/d.jpg'; posts[3].exportedAt = now.toISOString();
    state.posts = posts;
    const { ready, skipped } = bufferExportFor(state, profile.id, 'instagram', now);
    assert.deepEqual(ready.map((p) => p.id), [posts[0].id]);
    assert.deepEqual(skipped.map((p) => p.id), [posts[1].id]);
    const csv = buildBufferCsv(ready);
    const [header, row] = csv.replace(/^﻿/, '').split('\r\n');
    assert.equal(header, 'Text,Image URL,Tags,Posting Time');
    assert.match(row, /,https:\/\/cdn\.muapi\.ai\/out\/a\.png,,\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});

test('exported posts become posted once their time has passed', async () => {
    const { markPublishedExports } = await load();
    const state = { profiles: [], posts: [
        { id: 'a', status: 'freigegeben', exportedAt: '2026-10-10T00:00:00Z', scheduledAt: '2026-10-14T10:00:00Z' },
        { id: 'b', status: 'freigegeben', exportedAt: '2026-10-10T00:00:00Z', scheduledAt: '2026-10-20T10:00:00Z' },
        { id: 'c', status: 'freigegeben', exportedAt: '', scheduledAt: '2026-10-14T10:00:00Z' },
    ] };
    const { state: next, changed } = markPublishedExports(state, new Date('2026-10-15T10:00:00Z'));
    assert.equal(changed, 1);
    assert.deepEqual(next.posts.map((p) => p.status), ['gepostet', 'freigegeben', 'freigegeben']);
});

const randomizerPath = pathToFileURL(path.join(__dirname, '../packages/studio/src/promptRandomizer.js')).href;
const loadRandomizer = () => import(randomizerPath);

test('randomizer: every prompt names an adult aged 20-25', async () => {
    const { generateBatch } = await loadRandomizer();
    const batch = generateBatch(20, null, [], seeded(7));
    assert.equal(batch.length, 20);
    for (const { traits, prompt, appearance } of batch) {
        assert.ok(traits.age >= 20 && traits.age <= 25, `age ${traits.age}`);
        assert.match(prompt, new RegExp(`^Instagram photo of a ${traits.age}-year-old adult `));
        assert.match(appearance, new RegExp(`^${traits.age} year old adult `));
    }
    assert.equal(new Set(batch.map((b) => b.prompt)).size, 20, 'prompts are distinct');
});

test('randomizer: option lists stay Instagram-safe', async () => {
    const { OPTIONS } = await loadRandomizer();
    const banned = /\b(girl|teen|teenage|young-looking|child|kid|school|lingerie|underwear|nude|naked|topless|sexy|bikini)\b/i;
    const values = Object.entries(OPTIONS).flatMap(([key, list]) => (Array.isArray(list)
        ? list.map((v) => [key, v])
        : Object.entries(list).flatMap(([style, outfits]) => [[key, style], ...outfits.map((o) => [style, o])])));
    assert.ok(values.length > 100);
    for (const [key, value] of values) assert.doesNotMatch(value, banned, `${key}: ${value}`);
});

test('randomizer: locked groups are kept, others change', async () => {
    const { generateBatch, GROUPS, randomizeTraits } = await loadRandomizer();
    const batch = generateBatch(8, null, ['person'], seeded(3));
    const first = batch[0].traits;
    for (const { traits } of batch) {
        for (const key of GROUPS.person.keys) assert.equal(traits[key], first[key], key);
    }
    assert.ok(new Set(batch.map((b) => b.traits.location + b.traits.outfit)).size > 1, 'scenes vary');
    // A tampered previous age is clamped back into range.
    assert.equal(randomizeTraits({ ...first, age: 15 }, ['person'], seeded()).age, 20);
    assert.equal(randomizeTraits({ ...first, age: 40 }, ['person'], seeded()).age, 25);
});

test('randomizer: outfits always match the chosen style', async () => {
    const { generateBatch, OPTIONS } = await loadRandomizer();
    for (const { traits } of generateBatch(20, null, [], seeded(11))) {
        assert.ok(OPTIONS.outfitsByAesthetic[traits.aesthetic].includes(traits.outfit), `${traits.aesthetic} / ${traits.outfit}`);
    }
});

test('randomizer: night locations get night light', async () => {
    const { generateBatch, OPTIONS } = await loadRandomizer();
    for (const { traits } of generateBatch(20, null, [], seeded(5)).concat(generateBatch(20, null, [], seeded(9)))) {
        const night = traits.location.includes('at night');
        assert.ok((night ? OPTIONS.nightLight : OPTIONS.light).includes(traits.light), `${traits.location} / ${traits.light}`);
    }
});

const presetsPath = pathToFileURL(path.join(__dirname, '../packages/studio/src/profilePresets.js')).href;

test('presets: 15 adult women aged 20-25 with valid, Instagram-safe data', async () => {
    const { PRESET_PROFILES } = await import(presetsPath);
    const { sanitizeProfile, TONES, PLATFORMS } = await load();
    assert.equal(PRESET_PROFILES.length, 15);
    assert.equal(new Set(PRESET_PROFILES.map((p) => p.id)).size, 15);
    assert.equal(new Set(PRESET_PROFILES.map((p) => p.handle)).size, 15);
    const banned = /\b(girl|teen|teenage|young-looking|child|kid|school|lingerie|underwear|nude|naked|topless|sexy)\b/i;
    for (const p of PRESET_PROFILES) {
        const age = Number(p.appearance.match(/^(\d+) year old adult [A-Za-z -]+ woman,/)?.[1]);
        assert.ok(age >= 20 && age <= 25, `${p.name}: ${p.appearance}`);
        assert.ok(TONES.includes(p.tone), p.tone);
        assert.ok(p.platforms.every((pl) => pl in PLATFORMS));
        assert.doesNotMatch(JSON.stringify(p), banned, p.name);
        // Survives sanitising unchanged (nothing truncated or dropped).
        const clean = sanitizeProfile(p, 0);
        for (const key of ['id', 'name', 'handle', 'appearance', 'tone', 'postsPerWeek']) assert.equal(clean[key], p[key], `${p.name}.${key}`);
        assert.deepEqual(clean.pillars, p.pillars);
    }
});

test('presets can be added once, up to 20 profiles, and survive a reload', async () => {
    const { createDefaultState, addPresetProfiles, missingPresetCount, parseState, MAX_PROFILES } = await load();
    const state = createDefaultState();
    assert.equal(missingPresetCount(state), 15);
    const { state: full, added } = addPresetProfiles(state);
    assert.equal(added, 15);
    assert.equal(full.profiles.length, MAX_PROFILES);
    assert.equal(addPresetProfiles(full).added, 0, 'no duplicates');
    assert.equal(missingPresetCount(full), 0);
    assert.equal(parseState(JSON.stringify(full)).profiles.length, 20);
});

test('removeProfile drops its posts and keeps at least one profile', async () => {
    const { createDefaultState, ensurePlanned, applyPlan, removeProfile } = await load();
    let state = createDefaultState();
    state = applyPlan(state, ensurePlanned(state, new Date('2026-10-15T10:00:00'), seeded()));
    const next = removeProfile(state, 'profile_1');
    assert.equal(next.profiles.length, 4);
    assert.ok(next.posts.every((p) => p.profileId !== 'profile_1'));
    assert.ok(next.posts.length < state.posts.length);
    const single = { ...state, profiles: [state.profiles[0]] };
    assert.equal(removeProfile(single, 'profile_1'), single);
});

test('glamour: adult 20-25, tasteful, outfits and locations match the theme', async () => {
    const { generateBatch, GLAMOUR } = await loadRandomizer();
    const batch = generateBatch(20, null, [], seeded(21), 'glamour');
    assert.equal(batch.length, 20);
    for (const { traits, prompt } of batch) {
        assert.equal(traits.mode, 'glamour');
        assert.ok(traits.age >= 20 && traits.age <= 25);
        assert.match(prompt, new RegExp(`^Instagram fashion photo of a ${traits.age}-year-old adult `));
        assert.match(prompt, /tasteful and elegant, Instagram-appropriate/);
        const theme = GLAMOUR.themes[traits.aesthetic];
        assert.ok(theme, traits.aesthetic);
        assert.ok(theme.outfits.includes(traits.outfit), `${traits.aesthetic} / ${traits.outfit}`);
        assert.ok(theme.locations.includes(traits.location), `${traits.aesthetic} / ${traits.location}`);
        const night = / at night$/.test(traits.location);
        assert.ok((night ? GLAMOUR.nightLight : theme.light || GLAMOUR.light).includes(traits.light), `${traits.location} / ${traits.light}`);
    }
});

test('glamour: vocabulary stays Instagram-safe', async () => {
    const { GLAMOUR } = await loadRandomizer();
    const banned = /\b(girl|teen|teenage|young-looking|child|kid|school|lingerie|underwear|nude|naked|topless|sexy|seductive|sensual|revealing|see-through|sheer|cleavage|thong|braless|wet)\b/i;
    const values = [
        ...Object.entries(GLAMOUR.themes).flatMap(([theme, t]) => [theme, ...t.outfits, ...t.locations, ...(t.light || [])]),
        ...GLAMOUR.activity, ...GLAMOUR.shot, ...GLAMOUR.light, ...GLAMOUR.nightLight, ...GLAMOUR.camera,
    ];
    assert.ok(values.length > 40);
    for (const v of values) assert.doesNotMatch(v, banned, v);
});

test('switching modes keeps a locked person but not an everyday look', async () => {
    const { generateBatch, GROUPS, GLAMOUR } = await loadRandomizer();
    const [everyday] = generateBatch(1, null, [], seeded(2), 'alltag');
    const glam = generateBatch(5, everyday.traits, ['person', 'look', 'scene', 'camera'], seeded(4), 'glamour');
    for (const { traits } of glam) {
        for (const key of GROUPS.person.keys) assert.equal(traits[key], everyday.traits[key], key);
        assert.ok(GLAMOUR.themes[traits.aesthetic], 'look switched to a glamour theme');
    }
    // Within glamour, the locked look/scene now stays fixed across the batch.
    assert.equal(new Set(glam.map((g) => g.traits.outfit + g.traits.location)).size, 1);
});

test('image cost: cheap model by default, premium reference images, estimates', async () => {
    const { createDefaultState, imageModelsFor, estimateImageCost, weeklyImageEstimate, sanitizeSettings, formatUsd } = await load();
    const state = createDefaultState();
    assert.equal(imageModelsFor(state.settings, 'post').t2i, 'nano-banana-2-lite');
    assert.equal(imageModelsFor(state.settings, 'post').edit, 'nano-banana-2-lite-edit');
    assert.equal(imageModelsFor(state.settings, 'avatar').t2i, 'nano-banana-pro');
    assert.equal(imageModelsFor({ ...state.settings, avatarPremium: false }, 'avatar').t2i, 'nano-banana-2-lite');
    assert.equal(imageModelsFor({ ...state.settings, imageQuality: 'premium' }, 'post').t2i, 'nano-banana-pro');
    assert.equal(sanitizeSettings({ imageQuality: '__proto__' }).imageQuality, 'sparsam');
    assert.equal(formatUsd(estimateImageCost(10, state.settings)), '$0.30');
    assert.equal(formatUsd(estimateImageCost(10, { imageQuality: 'premium' })), '$1.20');
    // 5 starter profiles post 24 times a week.
    assert.deepEqual(weeklyImageEstimate(state), { posts: 24, cost: 24 * 0.03 });
});

test('bulk image queue only covers open posts without image due within 7 days', async () => {
    const { createDefaultState, bulkImageQueue } = await load();
    const state = createDefaultState();
    const now = new Date('2026-10-15T10:00:00');
    const at = (d) => new Date(now.getTime() + d * 86400000).toISOString();
    state.posts = [
        { id: 'a', profileId: 'profile_1', status: 'idee', imageUrl: '', scheduledAt: at(1) },
        { id: 'b', profileId: 'profile_1', status: 'idee', imageUrl: '', scheduledAt: at(10) },
        { id: 'c', profileId: 'profile_1', status: 'bild', imageUrl: 'https://x/a.png', scheduledAt: at(2) },
        { id: 'd', profileId: 'profile_1', status: 'gepostet', imageUrl: '', scheduledAt: at(-1) },
        { id: 'e', profileId: 'profile_2', status: 'idee', imageUrl: '', scheduledAt: at(3) },
    ];
    assert.deepEqual(bulkImageQueue(state, ['profile_1'], now).map((p) => p.id), ['a']);
    assert.deepEqual(bulkImageQueue(state, ['profile_1', 'profile_2'], now).map((p) => p.id), ['a', 'e']);
});

test('reference image prompt: appearance first and unchanged, adult, no empty superlatives', async () => {
    const { createDefaultState, addPresetProfiles, buildAvatarPrompt } = await load();
    const { state } = addPresetProfiles(createDefaultState());
    assert.equal(state.profiles.length, 20);
    for (const p of state.profiles) {
        const prompt = buildAvatarPrompt(p);
        const subject = /\badult\b/i.test(p.appearance) ? p.appearance : `adult, ${p.appearance}`;
        assert.ok(prompt.startsWith(subject), `${p.name}: ${prompt.slice(0, 80)}`);
        assert.match(prompt, /\badult\b/i);
        assert.match(prompt, /soft window light from the left/);
        assert.match(prompt, /3:4$/);
        assert.doesNotMatch(prompt, /ultra|8k|masterpiece|best quality|flawless|perfect skin|cinematic/i, p.name);
    }
    // Profile without age gets an adult age range instead of none.
    assert.match(buildAvatarPrompt({ appearance: 'woman with red hair' }), /^adult in their mid-twenties, woman with red hair/);
});

test('caption hooks fit every niche and never repeat within a week', async () => {
    const { createDefaultState, addPresetProfiles, planWeek } = await load();
    const { state } = addPresetProfiles(createDefaultState());
    // Words that tie a hook to one niche (the old cooking/travel/tech/fashion lines).
    const nicheWords = /rezept|koche|outfit|tool|ort\b|touri|wallet|look/i;
    for (const profile of state.profiles) {
        for (const seed of [1, 7, 42]) {
            const posts = planWeek(profile, new Date('2026-10-19T00:00:00'), null, seeded(seed));
            const firstLines = posts.map((p) => p.caption.split('\n')[0]);
            for (const [i, line] of firstLines.entries()) {
                assert.ok(line.includes(posts[i].pillar), `${profile.name}: hook names the pillar: ${line}`);
                assert.doesNotMatch(line.replace(posts[i].pillar, ''), nicheWords, `${profile.name}: ${line}`);
                assert.ok(!line.includes('{pillar}'), line);
            }
            if (posts.length <= 5) assert.equal(new Set(firstLines).size, posts.length, `${profile.name}: ${firstLines}`);
        }
    }
});
