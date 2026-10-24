// 🎞️ CSONG VISUALIZER
//  Song eke thumbnail eka madhyayata (goda circle ekak widihata), eka watawa audio ekata nattuwena rethmy circular spectrum bars,
//  blurred background ekka MP4 video ekak hadanawa.  ffmpeg witharai ona (npm package ona na).
//  Circular effect eka: showfreqs bars -> ffmpeg `remap` filter eken polar coordinates walata (maps tika meke hadanawa).
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const W = 800, H = 450;          // video size (16:9)
const S = 450;                   // spectrum canvas (square)
const R0 = 124, R1 = 224;        // bars inner / outer radius
const DISC = 224;                // thumbnail circle diameter
const FPS = 25;

// gradient: base (blue/cyan) -> purple -> tip (pink)
const STOPS = [[0, [40, 175, 255]], [0.5, [165, 95, 255]], [1, [255, 70, 175]]];
function gradColor(t) {
    t = Math.max(0, Math.min(1, t));
    for (let i = 1; i < STOPS.length; i++) {
        if (t <= STOPS[i][0]) {
            const [t0, c0] = STOPS[i - 1], [t1, c1] = STOPS[i];
            const k = (t - t0) / (t1 - t0);
            return c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
        }
    }
    return STOPS[STOPS.length - 1][1];
}

/** polar remap maps (16-bit PGM) + radial gradient (PPM), S x S */
export function buildPolarAssets() {
    const hdr = (magic, extra) => Buffer.from(`${magic}\n${S} ${S}\n${extra}\n`, 'ascii');
    const xmap = Buffer.alloc(S * S * 2), ymap = Buffer.alloc(S * S * 2), grad = Buffer.alloc(S * S * 3);
    const c = (S - 1) / 2;
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const dx = x - c, dy = y - c, r = Math.hypot(dx, dy), o = y * S + x;
            const t = (r - R0) / (R1 - R0);
            let sx = 65535, sy = 65535;                           // outside ring -> out of range -> black
            if (r >= R0 && r <= R1) {
                const u = ((Math.atan2(dx, dy) / (2 * Math.PI)) + 1) % 1;   // 0 = bottom, clockwise
                sx = Math.min(S - 1, Math.round(u * S));
                sy = Math.round((S - 1) * (1 - t));
            }
            xmap.writeUInt16BE(sx, o * 2); ymap.writeUInt16BE(sy, o * 2);
            const [rr, gg, bb] = gradColor(t);
            grad[o * 3] = rr; grad[o * 3 + 1] = gg; grad[o * 3 + 2] = bb;
        }
    }
    return {
        xmap: Buffer.concat([hdr('P5', '65535'), xmap]),
        ymap: Buffer.concat([hdr('P5', '65535'), ymap]),
        grad: Buffer.concat([hdr('P6', '255'), grad])
    };
}

// pass 1 (frame 1 witharai): blurred background + round thumbnail + ring  -> base.png  (static, nisa frame ekak witharai render karanne)
function baseGraph() {
    const cx = (DISC + 12) / 2;           // disc canvas has 6px margin each side
    const d = `hypot(X-${cx},Y-${cx})`;
    const ringW = `clip(2-abs(${d}-${DISC / 2 + 4}),0,1)*0.92`;          // thin white ring around thumbnail
    const discA = `clip(${DISC / 2 + 1}-${d},0,1)`;
    return [
        `[0:v]split=2[t1][t2]`,
        `[t1]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=22:3,eq=brightness=-0.2:saturation=1.35,format=rgba[bg]`,
        `[t2]scale=${DISC}:${DISC}:force_original_aspect_ratio=increase,crop=${DISC}:${DISC},pad=${DISC + 12}:${DISC + 12}:6:6:black,format=rgba,` +
            `geq=r='r(X,Y)*(1-${ringW})+255*${ringW}':g='g(X,Y)*(1-${ringW})+255*${ringW}':b='b(X,Y)*(1-${ringW})+255*${ringW}':a='255*max(${discA},${ringW})'[disc]`,
        `[bg][disc]overlay=(W-w)/2:(H-h)/2:format=auto,format=rgb24[base]`
    ].join(';');
}

// pass 2: audio-reactive circular spectrum (showfreqs -> mirrored -> gaps -> polar remap -> gradient) screen-blended on base
function videoGraph() {
    const half = S / 10;                  // bars per half (mirrored) -> S/5 total bars, each 5px
    return [
        `[1:a]asplit=2[aout][avis]`,
        `[avis]aformat=channel_layouts=stereo,dynaudnorm=f=200:g=11:p=0.9:m=12,showfreqs=s=${half}x${S}:mode=bar:fscale=log:ascale=cbrt:win_size=2048:cmode=combined:colors=white:rate=${FPS}:averaging=2,format=gray,split=2[f1][f2]`,
        `[f2]hflip[f2h]`,
        `[f1][f2h]hstack,scale=${S}:${S}:flags=neighbor,drawgrid=w=5:h=ih:t=2:c=black,format=rgb24[rect]`,
        `[2:v]format=gray16le[xm]`,
        `[3:v]format=gray16le[ym]`,
        `[rect][xm][ym]remap,format=gbrp[polar]`,
        `[4:v]format=gbrp[gr]`,
        `[polar][gr]blend=all_mode=multiply,split=2[b1][b2]`,
        `[b2]scale=${S / 3}:${S / 3},gblur=sigma=3,scale=${S}:${S}:flags=bilinear[glow]`,
        `[b1][glow]blend=all_mode=screen,pad=${W}:${H}:${(W - S) / 2}:0:black[bars]`,
        `[5:v]format=gbrp[base]`,
        `[base][bars]blend=all_mode=screen,format=yuv420p[vout]`
    ].join(';');
}

// fallback: circular remap nathuwa, base image eka mathin audio waveform (palaya ffmpeg build walatath wada karanawa)
function simpleGraph() {
    return [
        `[0:a]asplit=2[aout][avis]`,
        `[avis]aformat=channel_layouts=mono,showwaves=s=${W - 120}x110:mode=cline:rate=${FPS}:colors=0xA55FFF|0x28AFFF,format=rgba[wv]`,
        `[1:v]format=rgba[bs]`,
        `[bs][wv]overlay=60:H-h-26:format=auto,format=yuv420p[vout]`
    ].join(';');
}

function run(bin, args, timeoutMs) {
    return new Promise((resolve, reject) => {
        const pr = spawn(bin, args);
        let err = '';
        const timer = setTimeout(() => { pr.kill('SIGKILL'); reject(new Error(`visualizer timeout (${Math.round(timeoutMs / 1000)}s)`)); }, timeoutMs);
        pr.stderr.on('data', (d) => { err = (err + d.toString()).slice(-600); });
        pr.on('error', (e) => { clearTimeout(timer); reject(new Error(`ffmpeg start wenne na (${e.message})`)); });
        pr.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`ffmpeg fail (code ${code}): ${err.slice(-220)}`)); });
    });
}

/**
 * @param {object} o
 * @param {string} o.ffmpeg      ffmpeg binary path
 * @param {Buffer} o.audio       mp3 buffer
 * @param {Buffer} o.thumb       thumbnail image buffer (jpg / png / webp)
 * @param {number} [o.maxSec]    video duration cap (default 300s)
 * @param {number} [o.timeoutMs] render timeout (default 240s)
 * @param {string} [o.outPath]   output path (testing)
 * @returns {Promise<Buffer>} mp4
 */
export async function makeSongVisualizer({ ffmpeg = 'ffmpeg', audio, thumb, maxSec = 300, timeoutMs = 240000, outPath }) {
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const dir = path.join(os.tmpdir(), `csvis_${stamp}`);
    await fs.mkdir(dir, { recursive: true });
    const f = (n) => path.join(dir, n);
    try {
        const assets = buildPolarAssets();
        await Promise.all([
            fs.writeFile(f('a.mp3'), audio), fs.writeFile(f('t.img'), thumb),
            fs.writeFile(f('x.pgm'), assets.xmap), fs.writeFile(f('y.pgm'), assets.ymap), fs.writeFile(f('g.ppm'), assets.grad)
        ]);
        const out = outPath || f('out.mp4');
        const loopIn = (file) => ['-loop', '1', '-framerate', String(FPS), '-i', file];
        // pass 1: static base image
        await run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', f('t.img'), '-filter_complex', baseGraph(), '-map', '[base]', '-frames:v', '1', f('base.png')], 60000);
        // pass 2: animated video (circular spectrum). Fail unoth (ffmpeg eka palaya / remap nathnam) -> simple waveform version
        const enc = ['-t', String(maxSec), '-shortest', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', String(FPS * 2),
            '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'];
        try {
            await run(ffmpeg, [
                '-y', '-hide_banner', '-loglevel', 'error',
                '-i', f('t.img'), '-i', f('a.mp3'), ...loopIn(f('x.pgm')), ...loopIn(f('y.pgm')), ...loopIn(f('g.ppm')), ...loopIn(f('base.png')),
                '-filter_complex', videoGraph(), '-map', '[vout]', '-map', '[aout]', ...enc, out
            ], timeoutMs);
        } catch (circErr) {
            console.error('[csong] circular visualizer failed, simple waveform ekata maaru wenawa:', circErr.message);
            await run(ffmpeg, [
                '-y', '-hide_banner', '-loglevel', 'error',
                '-i', f('a.mp3'), ...loopIn(f('base.png')),
                '-filter_complex', simpleGraph(), '-map', '[vout]', '-map', '[aout]', ...enc, out
            ], timeoutMs);
        }
        const buf = await fs.readFile(out);
        if (buf.length < 20 * 1024) throw new Error('visualizer video eka godak podi');
        return buf;
    } finally {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
}
