// 🧰 AI ECO TOOLS
//  AI ECO (inbox auto-reply) ekata real data ganna puluwan tools:
//   weather (wttr.in)   news (Siyatha API)   qr (qrserver)   short (tinyurl)   calc (local, safe)   time (local)
//  - Dependencies nathuwa: Node eke global fetch + Intl witharai (axios / moment ona na)
//  - API keys meke hardcode karala na. pair.js eken `keys` widihata pass karanawa.
//  - Tool ekak fail unoth AI eka normal chat ekata fallback wenawa (pair.js eke catch eka).

const NEWS_URL = process.env.ECO_NEWS_URL || 'https://api-siteh-22e22e4cb068.herokuapp.com/news/siyatha';
const TZ = process.env.ECO_TZ || 'Asia/Colombo';

// ------------------------------------------------------------------ helpers
async function http(url, { timeout = 12000, headers, method = 'GET', body, as = 'json' } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
        const res = await fetch(url, { method, headers: { 'User-Agent': 'curl/8.5.0', ...headers }, body, signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return as === 'text' ? (await res.text()).trim() : await res.json();
    } finally { clearTimeout(timer); }
}

const L3 = (lang, si, sl, en) => (lang === 'si' ? si : lang === 'english' ? en : sl);   // si | singlish | english
const URL_RE = /https?:\/\/\S+/i;

export function ecoNowLine() {
    const d = new Date();
    const date = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    const time = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
    return `${date}, ${time}`;
}

export function ecoCapabilityLine() {
    return 'Extra things you CAN do for them (they just say it in chat): weather (e.g. "colombo weather"), latest Sri Lanka news ("news dapan"), a QR code ("qr hadanna <text or link>"), shorten a link ("short <url>"), a calculator ("5*(3+2) kiyada"), the current time or date ("welawa kiyada"). You can answer the time/date from the line above.';
}

// ------------------------------------------------------------------ circuit breaker (AI API down unoth nawatha nawatha hit karanne na)
let _fails = 0, _openUntil = 0;
export const ecoBreaker = {
    isOpen: () => Date.now() < _openUntil,
    ok: () => { _fails = 0; },
    fail: () => { if (++_fails >= 3) { _openUntil = Date.now() + 60_000; _fails = 0; } }
};

// ------------------------------------------------------------------ safe calculator (eval / Function na)
export function safeCalc(src) {
    const s = String(src).replace(/\s+/g, '').replace(/\*\*/g, '^');
    if (!s || s.length > 80 || !/^[0-9+\-*/().^%]+$/.test(s)) throw new Error('bad expr');
    let i = 0, depth = 0;
    const peek = () => s[i];
    const num = () => {
        const m = /^\d+(\.\d+)?/.exec(s.slice(i));
        if (!m) throw new Error('number expected');
        i += m[0].length;
        return parseFloat(m[0]);
    };
    const prim = () => {
        const ch = peek();
        if (ch === '(') {
            if (++depth > 20) throw new Error('too deep');
            i++; const v = add();
            if (peek() !== ')') throw new Error('missing )');
            i++; depth--; return v;
        }
        if (ch === '-') { i++; return -pow(); }
        if (ch === '+') { i++; return pow(); }
        return num();
    };
    const pow = () => { const b = prim(); if (peek() === '^') { i++; return Math.pow(b, pow()); } return b; };
    const mul = () => {
        let v = pow();
        while (peek() === '*' || peek() === '/' || peek() === '%') {
            const op = s[i++]; const r = pow();
            v = op === '*' ? v * r : op === '/' ? v / r : v % r;
        }
        return v;
    };
    const add = () => {
        let v = mul();
        while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = mul(); v = op === '+' ? v + r : v - r; }
        return v;
    };
    const v = add();
    if (i !== s.length) throw new Error('syntax');
    if (!Number.isFinite(v)) throw new Error('math');
    return Number(v.toFixed(10));
}

// ------------------------------------------------------------------ intent detection
const CITY_MAP = {
    'කොළඹ': 'Colombo', 'මහනුවර': 'Kandy', 'ගාල්ල': 'Galle', 'කුරුණෑගල': 'Kurunegala', 'යාපනය': 'Jaffna', 'මාතර': 'Matara',
    'රත්නපුර': 'Ratnapura', 'අනුරාධපුර': 'Anuradhapura', 'නුවරඑළිය': 'Nuwara Eliya', 'ගම්පහ': 'Gampaha', 'කළුතර': 'Kalutara',
    'මීගමුව': 'Negombo', 'බදුල්ල': 'Badulla', 'හම්බන්තොට': 'Hambantota', 'ත්‍රිකුණාමලය': 'Trincomalee', 'මඩකලපුව': 'Batticaloa'
};
const CITY_STOP = new Set(('kohomada kohomd kohoma kohomda mokakda mokada mokk adha ada dan dawasa dawase dawas dawal now today tonight tomorrow ' +
    'the is are in at of for what whats how hows like be will it ekak eka ekata eke ge gana thiyenawada thiyeda thiyanawada kiyanna kiyala kiyapan ' +
    'dennako denna dapan dapn one oni ona danna balanna balala ba na hari please pls plz mata mama oya oyaa me meka ekaka wage nagaraye nagare pradeshaye ' +
    'dan thama ada-dawase report forecast show tell give hodai kharai hithenne wage').split(/\s+/));
const WEATHER_W = /\b(weather|whether|wether|kalawa|kaalaya|kaalagunaya|climate|temperature|temp|rain|rains|raining|wessa|wassa|wahinawada|wahinawa|wahinna|hot|cold)\b|කාලගුණ\S*|වැස්ස|වහිනවද/iu;
const NEWS_W = /\b(news|pawathi|pawathak|pawath|hawatha|havatha|headlines?)\b|පුවත්\S*|පුවතක්/iu;
const QR_W = /\bqr\b|\bqrcode\b|කියුආර්/iu;
const SHORT_W = /\b(short|shorten|shorter|tinyurl)\b/i;
const TIME_W = /(what('?s| is)?\s+(the\s+)?(time|date|day)|what\s+time|time\s+(kiyada|kiyada\?|mokakda|mokada|ekak)|welawa\s+(kiyada|kohomada|mokakda)|dan\s+welawa|(ada|adha)\s+(dawasa|dawas|date)|dawasa\s+(kiyada|mokakda)|date\s+(kiyada|mokakda)|වෙලාව|අද\s*දිනය|දිනය\s*කීයද)/iu;
const CALC_CUE = /\b(calc|calculate|calculator|ganna|gananna|gannako|kiyada|kiyanna|answer|ethuwa|ekathu|plus|minus|total|equals?)\b|ගණන|=\s*\?/iu;
const ASKY = /\b(one|oni|ona|dapan|dennako|denna|kiyanna|kiyapan|kohomada|kohomd|mokakda|mokada|what|whats|how|latest|today|adha|ada|dan|thiyenawada|thiyeda|balanna|show|tell|give|ewapan|ewanna|hodai|dawasa)\b|\?|ඕනේ|ඕන|කොහොමද|මොකද/iu;
const FILL = /\b(ekak|ekk|eka|hadanna|hadapan|hadala|generate|create|make|code|for|karanna|karala|denna|dennako|dapan|plz|pls|please|one|oni|ona|mata|me|this|link|eke|ekata|kiyala)\b/gi;

export function ecoToolCleanCity(raw) {
    let t = String(raw || '').trim();
    for (const [si, en] of Object.entries(CITY_MAP)) if (t.includes(si)) return en;
    const toks = t.toLowerCase().replace(WEATHER_W, ' ').replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter(w => w && !CITY_STOP.has(w));
    return toks.slice(0, 3).join(' ');
}

function extractExpr(text) {
    const t = text.replace(/(\d)\s*[x×]\s*(?=[\d(])/gi, '$1*').replace(/÷/g, '/').replace(/(\d),(?=\d{3}\b)/g, '$1');
    const runs = t.match(/[0-9+\-*/().^%\s]+/g) || [];
    let best = null;
    for (const r of runs) {
        const tr = r.trim();
        if (!/\d\s*(\*\*|[+\-*/^%])\s*[(\d-]/.test(tr)) continue;
        if (!best || tr.length > best.length) best = tr;
    }
    if (!best) return null;
    const hasCue = CALC_CUE.test(text);
    const dateLike = /^\d{1,4}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{1,4}$/.test(best);
    const phoneLike = /\d{9,}/.test(best.replace(/[\s-]/g, '')) && !/[*/^%+]/.test(best);
    if (!hasCue && (dateLike || phoneLike)) return null;
    if (!hasCue && best.length < t.trim().length * 0.7) return null;   // sentence ekak athule thiyena numbers wage ewa ignore
    try { safeCalc(best); } catch { return null; }
    return best;
}

/** @returns null | {type:'tool',tool,arg} | {type:'ask',what,kind:'tool',tool} */
export function ecoToolIntent(textRaw) {
    const text = String(textRaw || '').trim();
    if (!text || text.length > 200) return null;
    const words = text.split(/\s+/).length;
    const url = (text.match(URL_RE) || [])[0] || '';

    const expr = extractExpr(text);
    if (expr) return { type: 'tool', tool: 'calc', arg: expr };

    if (QR_W.test(text)) {
        const payload = url || text.replace(QR_W, ' ').replace(FILL, ' ').replace(/\s+/g, ' ').trim();
        if (payload.length < 2) return { type: 'ask', what: 'qr', kind: 'tool', tool: 'qr' };
        return { type: 'tool', tool: 'qr', arg: payload.slice(0, 300) };
    }
    if (SHORT_W.test(text) && (url || words <= 4)) {
        if (!url) return { type: 'ask', what: 'short', kind: 'tool', tool: 'short' };
        return { type: 'tool', tool: 'short', arg: url };
    }
    if (TIME_W.test(text) && words <= 8) return { type: 'tool', tool: 'time', arg: '' };
    if (WEATHER_W.test(text) && words <= 10 && (words <= 2 || ASKY.test(text))) return { type: 'tool', tool: 'weather', arg: ecoToolCleanCity(text) };
    if (NEWS_W.test(text) && words <= 8 && (words <= 2 || ASKY.test(text))) return { type: 'tool', tool: 'news', arg: '' };
    return null;
}

/** bot ahapu prashnayata (city / link / text) uththara eka tool ekakata yawanawa */
export function ecoToolFollowUp(tool, textRaw) {
    const t = String(textRaw || '').trim();
    if (!t || t.length > 200 || /^\d+$/.test(t)) return null;
    if (tool === 'weather') { const c = ecoToolCleanCity(t); return c ? { type: 'tool', tool, arg: c } : null; }
    if (tool === 'short') { const u = (t.match(URL_RE) || [])[0]; return u ? { type: 'tool', tool, arg: u } : null; }
    if (tool === 'qr') return { type: 'tool', tool, arg: (t.match(URL_RE) || [t])[0].slice(0, 300) };
    return null;
}

export function ecoToolAskText(tool, lang, n = '') {
    const m = {
        weather: L3(lang, `මොන ප්‍රදේශයේ කාලගුණයද බලන්න ඕනේ${n}? නගරයේ නම කියන්න 🌦️`, `Mona nagaraye weather ekada balanna one${n}? Nagaraye nama kiyanna 🌦️`, `Which city's weather do you want${n}? Tell me the city name 🌦️`),
        qr: L3(lang, `QR එකට දාන්න ඕනේ text එක හරි ලින්ක් එක හරි එවන්න${n} 🔳`, `QR ekata danna one text eka hari link eka hari yawanna${n} 🔳`, `Send me the text or link to put in the QR${n} 🔳`),
        short: L3(lang, `short කරන්න ඕනේ ලින්ක් එක එවන්න${n} 🔗`, `Short karanna one link eka yawanna${n} 🔗`, `Send me the link to shorten${n} 🔗`)
    };
    return m[tool] || L3(lang, 'තව ටිකක් විස්තර කියන්න 🙂', 'Thawa poddak kiyanna 🙂', 'Tell me a bit more 🙂');
}

// ------------------------------------------------------------------ tool runners
async function toolWeather(city) {
    const q = encodeURIComponent(city || 'Colombo');
    const d = await http(`https://wttr.in/${q}?format=j1`, { timeout: 12000 });
    const cur = d?.current_condition?.[0];
    if (!cur || typeof d !== 'object') throw new Error('weather: unknown location');
    const area = d.nearest_area?.[0]?.areaName?.[0]?.value || city;
    const country = d.nearest_area?.[0]?.country?.[0]?.value || '';
    const days = (d.weather || []).slice(0, 3).map((w, i) => {
        const rain = Math.max(...(w.hourly || []).map(h => Number(h.chanceofrain) || 0), 0);
        const desc = w.hourly?.[4]?.weatherDesc?.[0]?.value || '';
        return `${['Today', 'Tomorrow', 'Day after'][i]}: ${w.mintempC}-${w.maxtempC}°C, ${desc}, rain chance ${rain}%`;
    });
    const facts = `Place: ${area}${country ? ', ' + country : ''}\nNow: ${cur.weatherDesc?.[0]?.value || ''}, ${cur.temp_C}°C (feels ${cur.FeelsLikeC}°C), humidity ${cur.humidity}%, wind ${cur.windspeedKmph} km/h, rain ${cur.precipMM} mm\n${days.join('\n')}`;
    return { facts, plain: `🌦️ ${area}: ${cur.weatherDesc?.[0]?.value || ''}, ${cur.temp_C}°C (feels ${cur.FeelsLikeC}°C), 💧 ${cur.humidity}%, 💨 ${cur.windspeedKmph} km/h` };
}

async function toolNews(keys) {
    const key = keys?.news;
    const u = `${NEWS_URL}${key ? `?api_key=${encodeURIComponent(key)}` : ''}`;
    const d = await http(u, { timeout: 15000 });
    const r = d?.result;
    if (!d?.status || !r?.title) throw new Error('news: empty');
    return {
        facts: `Title: ${r.title}\nDate: ${r.date || ''}\nDetails: ${String(r.desc || '').slice(0, 600)}`,
        title: r.title, link: r.link || '', image: r.image || '', plain: String(r.desc || '').slice(0, 300)
    };
}

function toolTime(lang) {
    const d = new Date();
    const date = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    const time = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
    return L3(lang, `දැන් වෙලාව ${time} 🕐\nඅද ${date}`, `Dan welawa ${time} 🕐\nAda ${date}`, `It's ${time} now 🕐\nToday is ${date}`);
}

// ------------------------------------------------------------------ grounded AI phrasing
function langRule(lang) {
    return lang === 'english' ? 'Reply in simple, casual English.'
        : lang === 'singlish' ? 'Reply in Singlish (Sinhala words written in English letters).'
        : 'Reply in natural, spoken Sinhala using Sinhala script (keep place names and numbers as they are).';
}
function groundedPrompt({ kind, facts, question, name, ownerName, lang }) {
    const task = kind === 'weather'
        ? 'Answer their weather question using ONLY the facts below. Give temperature, conditions and rain chance in 2-3 short lines; add a tiny friendly tip (umbrella / hot day) if it fits.'
        : 'Summarize this news item in 2 short lines using ONLY the facts below.';
    return `You are ${ownerName}'s AI assistant replying on WhatsApp to their contact "${name || 'friend'}". Write ONLY the message to send (no notes, no quotes, no brackets), max 1-2 emojis. ${langRule(lang)} Never invent facts that are not listed.
${task}
${question ? `Their message: ${question}\n` : ''}FACTS:
${facts}`;
}

/**
 * Tool eka run karala contact ta yawana text (+ image) eka hadanawa.
 * ask(prompt) = AI text function (pair.js eke aiEcoReply)
 * @returns {Promise<{text:string, image?:string}>}
 */
export async function ecoToolReply({ tool, arg, lang, name, ownerName, question, keys, ask }) {
    if (tool === 'calc') {
        const v = safeCalc(arg);
        return { text: `🧮 ${arg.replace(/\s+/g, '')} = *${v}*` };
    }
    if (tool === 'time') return { text: toolTime(lang) };
    if (tool === 'qr') {
        const image = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(arg)}`;
        return { image, text: L3(lang, '🔳 ඔන්න QR code එක', '🔳 Meka oyage QR code eka', '🔳 Here is your QR code') };
    }
    if (tool === 'short') {
        const out = await http(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(arg)}`, { timeout: 12000, as: 'text' });
        if (!/^https?:\/\//.test(out)) throw new Error('short: bad response');
        return { text: `🔗 ${out}` };
    }
    if (tool === 'weather' || tool === 'news') {
        const r = tool === 'weather' ? await toolWeather(arg) : await toolNews(keys);
        let phrased = '';
        try { phrased = await ask(groundedPrompt({ kind: tool, facts: r.facts, question, name, ownerName, lang })); }
        catch { /* AI down: plain facts walin reply karanawa */ }
        const body = phrased || r.plain;
        if (tool === 'weather') return { text: body };
        return { text: `📰 *${r.title}*\n\n${body}${r.link ? `\n\n🔗 ${r.link}` : ''}`, image: r.image || undefined };
    }
    throw new Error(`unknown tool ${tool}`);
}

// ------------------------------------------------------------------ live API check  (.aieco test | .aieco test full)
export async function ecoApiCheck({ keys, ask, genImage, full = false } = {}) {
    const run = async (name, fn) => {
        const t = Date.now();
        try { const info = await fn(); return { ok: true, text: `✅ ${name} - ${info} (${Date.now() - t}ms)` }; }
        catch (e) { return { ok: false, text: `❌ ${name} - ${e.name === 'AbortError' ? 'timeout' : e.message} (${Date.now() - t}ms)` }; }
    };
    const jobs = [
        run('AI chat (code-x-ai)', async () => { const r = await ask('Reply with the single word: pong'); if (!r) throw new Error('empty reply'); return `reply "${String(r).slice(0, 20)}"`; }),
        run('weather (wttr.in)', async () => { const r = await toolWeather('Colombo'); return r.plain.slice(0, 40); }),
        run('news (siyatha)', async () => { const r = await toolNews(keys); return r.title.slice(0, 40); }),
        run('qr (qrserver)', async () => { const res = await fetch('https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=test', { headers: { Range: 'bytes=0-0' } }); if (res.status >= 400) throw new Error(`HTTP ${res.status}`); return `HTTP ${res.status}`; }),
        run('short (tinyurl)', async () => { const o = await http('https://tinyurl.com/api-create.php?url=https%3A%2F%2Fexample.com', { as: 'text', timeout: 12000 }); if (!/^https?:/.test(o)) throw new Error('bad response'); return o; })
    ];
    if (full && genImage) jobs.push(run('image gen (kcey)', async () => { const d = await genImage('a red apple'); if (!d?.image) throw new Error('no image'); return 'image url ok'; }));
    else jobs.push(Promise.resolve({ ok: true, text: '⏭️ image gen (kcey) - skipped (.aieco test full)' }));
    const out = await Promise.all(jobs);
    return out;
}
