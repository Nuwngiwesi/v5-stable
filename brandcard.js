// 🪪 SHAGGY XMD v5 brand card (v5 stable)
// Hama command reply ekakatama v5 logo preview card ekak attach karanawa.
// Text + image/video/document (caption ekka) walata apply wenawa.
// Poll / react / delete / edit / buttons / audio / sticker wage ewata kisima wenasak karanne na.
//
// .env options:
//   LOGO_CARD=false          -> card eka off
//   LOGO_CARD_SIZE=auto      -> auto (default) | large | small
//   LOGO_CARD_TITLE / LOGO_CARD_BODY  -> custom text

import axios from 'axios';

const SKIP_JID = /@(newsletter|broadcast)$|^status@broadcast$/;
const BLOCKED = ['react', 'delete', 'poll', 'buttons', 'sections', 'interactiveButtons', 'edit', 'forward', 'sticker', 'audio', 'location', 'contacts'];

// logo eka ekapaara download karala cache karanawa (card eka hama welawema ikmanata load wenna)
const thumbCache = new Map();
async function getThumb(url) {
    if (!url) return null;
    if (thumbCache.has(url)) return thumbCache.get(url);
    const job = axios.get(url, { responseType: 'arraybuffer', timeout: 8000 })
        .then(r => Buffer.from(r.data))
        .catch(() => null);
    thumbCache.set(url, job);
    const buf = await job;
    if (!buf) thumbCache.delete(url);   // fail unoth passe aye try karanna
    return buf;
}

function pickSize(o, textLen) {
    const mode = String(o.size || process.env.LOGO_CARD_SIZE || 'auto').toLowerCase();
    if (mode === 'large') return true;
    if (mode === 'small') return false;
    return textLen >= 250;   // auto: lamga reply (menu / info) walata loku banner, short ewata podi card
}

export function installBrandCard(socket, getOpts) {
    if (!socket || socket.__brandCard) return;
    const original = socket.sendMessage.bind(socket);

    socket.sendMessage = async (jid, content, options) => {
        try {
            const o = (typeof getOpts === 'function' ? getOpts() : getOpts) || {};
            const isObj = content && typeof content === 'object';
            const ok =
                o.enabled !== false && o.logo && isObj &&
                typeof jid === 'string' && !SKIP_JID.test(jid) &&
                !BLOCKED.some(k => content[k]);

            if (ok) {
                const text = typeof content.text === 'string' ? content.text
                    : typeof content.caption === 'string' ? content.caption : '';
                const isText = typeof content.text === 'string' && content.text.length > 0;
                // logo image ekama send karanawa nam (menu / alive) duplicate card ekak epa
                const isLogoImg = content.image && content.image.url === o.logo;
                const isMedia = !isLogoImg && !!(content.image || content.video || content.document);

                if (isText || isMedia) {
                    const ci = content.contextInfo || {};
                    if (!ci.externalAdReply) {
                        const thumb = await getThumb(o.logo);
                        const large = pickSize(o, text.length);
                        content = {
                            ...content,
                            contextInfo: {
                                ...ci,
                                externalAdReply: {
                                    title: process.env.LOGO_CARD_TITLE || o.title || '✦ SHAGGY XMD v5 ✦',
                                    body: process.env.LOGO_CARD_BODY || o.body || '⚡ Stable • Fast • Always Online',
                                    thumbnailUrl: o.logo,
                                    ...(thumb ? { thumbnail: thumb } : {}),
                                    sourceUrl: o.link || o.logo,
                                    mediaType: 1,
                                    renderLargerThumbnail: large,
                                    showAdAttribution: false
                                }
                            }
                        };
                    }
                }
            }
        } catch { /* branding fail unath message eka yanna oni */ }
        return original(jid, content, options);
    };
    socket.__brandCard = true;
}
