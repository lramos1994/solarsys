/**
 * Builds a standalone page that measures animation smoothness of several
 * variants of the same scene, to find what makes Firefox's SMIL "jump".
 *
 * Run:  npx vite-node scripts/firefox-bench.ts
 * Then open firefox-bench.html (written to the repo root, git-ignored by
 * being untracked) in Firefox AND Chrome and compare the table.
 *
 * Variants (same scene, same seed):
 *   current      — the artefact exactly as the app renders it
 *   no-clip      — without the clip-path on the content group
 *   no-willchange — without the will-change compositing hint
 *   neither      — without both
 *   few-stars    — current, scene regenerated at a tiny canvas (cost baseline)
 */
import { writeFileSync } from 'node:fs';
import { generateScene, type SceneParams } from '../ts/generator/scene.ts';

const SEED = 20260826;
const SIZE = Number(process.argv[2] ?? 1500);

function params(size: number): SceneParams {
  const k = size / 1000;
  return {
    canvas: { width: size, height: size },
    palette: 'Aurora',
    sunType: 'YellowDwarf',
    planets: [
      { size: 12 * k, distance: 120 * k, moon: false, ring: false },
      {
        size: 33 * k,
        distance: 250 * k,
        moon: { size: 9 * k, distance: 66 * k, period: 12 },
        ring: { type: 'Banded', sizePercent: 210, inclinationDegrees: 24 },
      },
      { size: 18 * k, distance: 380 * k, moon: false, ring: false },
    ],
    asteroidBelt: false,
  };
}

const base = generateScene(params(SIZE), SEED);
const stripClip = (s: string): string => s.replace(/ clip-path="url\(#scene-clip\)"/, '');
const stripWill = (s: string): string => s.replace(/<style>[^]*?<\/style>/, '');

const variants: Record<string, string> = {
  current: base,
  'no-clip': stripClip(base),
  'no-willchange': stripWill(base),
  neither: stripWill(stripClip(base)),
  'small-canvas-600': generateScene(params(600), SEED),
};

const html = `<!doctype html><meta charset="utf-8"><title>SolarSys bench</title>
<style>body{background:#111;color:#eee;font:14px system-ui;margin:16px}
.box{width:900px;height:900px;max-width:100%}.box svg{width:100%;height:100%;display:block}
table{border-collapse:collapse;margin:12px 0}td,th{border:1px solid #444;padding:4px 10px;text-align:right}
button{font-size:16px;padding:8px 14px}</style>
<h1>SolarSys — Firefox animation bench (canvas ${SIZE})</h1>
<p>Clique em "Rodar". Cada variante roda 5 s, uma por vez. Compare os resultados no Firefox e no Chrome
e olhe a animação com os olhos também: diga qual variante ficou lisa.</p>
<button id="go">Rodar</button><span id="status"></span>
<table id="t"><tr><th>variante</th><th>fps</th><th>p95 ms</th><th>quadros &gt;25ms</th></tr></table>
<div class="box" id="box"></div>
<script>
const V = ${JSON.stringify(variants).replace(/</g, '\\u003c')};
const box = document.getElementById('box'), t = document.getElementById('t'), st = document.getElementById('status');
function run(name){return new Promise(res=>{
  box.innerHTML = V[name]; st.textContent = ' rodando: '+name;
  const ts=[]; let last=performance.now(), end=last+5000;
  (function f(now){ ts.push(now-last); last=now; if(now<end) requestAnimationFrame(f); else {
    ts.shift(); const s=[...ts].sort((a,b)=>a-b);
    const fps=(ts.length/(ts.reduce((a,b)=>a+b,0)/1000)).toFixed(1);
    const row=t.insertRow(); [name,fps,s[Math.floor(s.length*.95)].toFixed(1),ts.filter(x=>x>25).length].forEach(v=>row.insertCell().textContent=v);
    res(); }})(last); });}
document.getElementById('go').onclick=async()=>{for(const n of Object.keys(V)){await run(n);} st.textContent=' pronto';};
</script>`;

writeFileSync(new URL('../firefox-bench.html', import.meta.url), html);
console.log('wrote firefox-bench.html');
