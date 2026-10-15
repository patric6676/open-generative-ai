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
    const { createDefaultState, MAX_PROFILES } = await load();
    const state = createDefaultState();
    assert.equal(state.profiles.length, MAX_PROFILES);
    assert.equal(new Set(state.profiles.map((p) => p.id)).size, 5);
    assert.deepEqual(state.posts, []);
});

test('parseState falls back to defaults on garbage and caps profiles', async () => {
    const { parseState, createDefaultState } = await load();
    assert.equal(parseState('not json').profiles.length, 5);
    assert.equal(parseState({ foo: 1 }).profiles.length, 5);
    const many = createDefaultState();
    many.profiles = [...many.profiles, ...many.profiles];
    assert.equal(parseState(JSON.stringify(many)).profiles.length, 5);
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
