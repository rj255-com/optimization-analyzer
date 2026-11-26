const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = v => v == null ? "—" : (v !== 0 && (Math.abs(v) >= 1e7 || Math.abs(v) < 1e-4)) ? v.toExponential(4) : String(+v.toPrecision(8));
const near = (a, b) => a != null && b != null && Math.abs(a - b) <= 1e-6 * (1 + Math.abs(b));
const PAGES = [["overview", "Overview"], ["analyzer", "Analyzer"], ["graph", "Graph"], ["critical", "Critical points"], ["multi", "Multivariable"], ["compare", "Compare"], ["dataset", "Dataset"], ["testing", "Testing"], ["slides", "Slides"]];
var lastGeom = null; let cur = null, cands = [], sel = 0, DATA = [], slide = 0, lastMulti = null;
const empty = '<div class="card"><p>Nothing to show yet. <a href="#analyzer">Run an analysis</a> first.</p></div>';

/* ---------- theme ---------- */
function setTheme(t) { document.documentElement.dataset.theme = t; $("#theme").textContent = t === "dark" ? "Light theme" : "Dark theme"; try { localStorage.setItem("oa-theme", t); } catch (e) {} if (lastMulti) drawHeat(lastMulti); }
let sv = null; try { sv = localStorage.getItem("oa-theme"); } catch (e) {}
setTheme(sv || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
$("#theme").onclick = e => { setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"); if (matchMedia("(prefers-reduced-motion: reduce)").matches) return; const b = e.currentTarget.getBoundingClientRect(), w = document.createElement("i"); w.className = "wave"; w.style.cssText = `left:${b.left + b.width / 2}px;top:${b.top + b.height / 2}px`; document.body.appendChild(w); setTimeout(() => w.remove(), 900); };

/* ---------- navigation: the menu is a curve ---------- */
$("#nav").innerHTML = PAGES.map(([id, l]) => `<li><a href="#${id}" data-id="${id}"><i></i><span>${l}</span></a></li>`).join("");
function railPath() {
  const ol = $("#nav"), b = ol.getBoundingClientRect(), svg = $("#rp");
  const p = $$("#nav i").map(n => { const r = n.getBoundingClientRect(); return [r.left - b.left + r.width / 2, r.top - b.top + r.height / 2]; });
  let d = `M${p[0]}`;
  for (let i = 1; i < p.length; i++) { const [a, y0] = p[i - 1], [c, y1] = p[i], m = (y0 + y1) / 2; d += `C${a},${m} ${c},${m} ${c},${y1}`; }
  let pa = $("#rp path"); if (pa) { pa.setAttribute("d", d); return; }
  svg.innerHTML = `<path d="${d}"/>`; pa = $("#rp path"); pa.style.setProperty("--len", Math.ceil(pa.getTotalLength())); pa.classList.add("draw"); pa.addEventListener("animationend", () => pa.classList.remove("draw"));
}
addEventListener("resize", railPath); (document.fonts ? document.fonts.ready : Promise.resolve()).then(railPath); railPath();
function go() {
  const h = (location.hash || "#overview").slice(1), id = PAGES.some(p => p[0] === h) ? h : "overview";
  $$(".page").forEach(p => p.hidden = p.id !== id);
  $$("#nav a").forEach(a => a.setAttribute("aria-current", a.dataset.id === id ? "page" : "false"));
  ({ graph: renderGraph, critical: renderCritical, slides: showSlide, dataset: renderDataset, testing: renderTesting }[id] || (() => {}))();
  heroOn = id === "overview"; if (heroOn) heroLoop(); scrollTo(0, 0); reveal(id); if (id === "multi" && gdR && !gdRaf) gdRaf = requestAnimationFrame(gdLoop); if (id === "multi" && s3R && !s3Raf) s3Raf = requestAnimationFrame(s3Loop);
  if (id !== "slides" && sTimer) { clearInterval(sTimer); sTimer = null; $("#sa").textContent = "Auto-play"; }
}
addEventListener("hashchange", go);

/* ---------- generic plot ---------- */
function nice(a, b, n = 6) {
  const raw = (b - a) / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p, st = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p, out = [];
  for (let v = Math.ceil(a / st) * st; v <= b + st * 1e-9; v += st) out.push(+v.toPrecision(12)); return out;
}
let pid = 0;
function plot(svg, o) {
  const W = 820, H = o.h || 420, M = { l: 62, r: 22, t: 22, b: 40 }, { lo, hi } = o, id = "c" + (++pid);
  const all = o.series.flatMap(s => s.y.filter(v => v != null)); let y0 = Math.min(...all), y1 = Math.max(...all);
  if (o.zero) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); } if (y0 === y1) { y0 -= 1; y1 += 1; }
  const pd = (y1 - y0) * .12; y0 -= pd; y1 += pd;
  const sx = v => M.l + (v - lo) / (hi - lo) * (W - M.l - M.r), sy = v => H - M.b - (v - y0) / (y1 - y0) * (H - M.t - M.b);
  const pw = W - M.l - M.r, ph = H - M.t - M.b;
  const path = (xs, ys) => xs.map((x, i) => ys[i] == null ? "" : `${i && ys[i - 1] != null ? "L" : "M"}${sx(x).toFixed(1)},${sy(ys[i]).toFixed(1)}`).join("");
  let s = `<defs><clipPath id="${id}"><rect x="${M.l}" y="${M.t}" width="${pw}" height="${ph}"/></clipPath>${["max","min","end","other"].map(k => `<radialGradient id="sg${id}${k}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".4" style="stop-color:var(--${k === "other" ? "muted" : k})"/><stop offset="1" style="stop-color:color-mix(in srgb,var(--${k === "other" ? "muted" : k}) 55%,#000)"/></radialGradient>`).join("")}<linearGradient id="pg${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--pb1)"/><stop offset="1" style="stop-color:var(--pb2)"/></linearGradient><linearGradient id="ag${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent);stop-opacity:.36"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:0"/></linearGradient></defs><rect class="pbg" x="${M.l}" y="${M.t}" width="${pw}" height="${ph}" fill="url(#pg${id})"/>`;
  nice(y0, y1).forEach(v => s += `<line class="tick" x1="${M.l}" x2="${W - M.r}" y1="${sy(v)}" y2="${sy(v)}"/><text x="${M.l - 8}" y="${sy(v) + 4}" text-anchor="end">${fmt(v)}</text>`);
  nice(lo, hi).forEach(v => s += `<line class="tick" y1="${M.t}" y2="${H - M.b}" x1="${sx(v)}" x2="${sx(v)}"/><text x="${sx(v)}" y="${H - M.b + 20}" text-anchor="middle">${fmt(v)}</text>`);
  if (y0 < 0 && y1 > 0) s += `<line class="axis" x1="${M.l}" x2="${W - M.r}" y1="${sy(0)}" y2="${sy(0)}"/>`;
  if (lo < 0 && hi > 0) s += `<line class="axis" y1="${M.t}" y2="${H - M.b}" x1="${sx(0)}" x2="${sx(0)}"/>`;
  s += `<rect class="axis" x="${M.l}" y="${M.t}" width="${pw}" height="${ph}" fill="none"/><g clip-path="url(#${id})">`;
  if (!o.noarea) { const S0 = o.series[0], bs = (H - M.b).toFixed(1); let d = "", st = null, lx = 0; S0.x.forEach((x, i) => { const y = S0.y[i]; if (y == null) { if (st != null) { d += `L${lx},${bs}L${st},${bs}Z`; st = null; } return; } const qx = sx(x).toFixed(1), qy = sy(y).toFixed(1); if (st == null) { st = qx; d += `M${qx},${bs}L${qx},${qy}`; } else d += `L${qx},${qy}`; lx = qx; }); if (st != null) d += `L${lx},${bs}L${st},${bs}Z`; s += `<path class="area" d="${d}" fill="url(#ag${id})"/>`; }
  o.series.forEach(se => s += `<path class="curve ${se.cls || ""}" d="${path(se.x, se.y)}"/>`);
  s += `<line class="tan" hidden/></g>`;
  (o.marks || []).forEach((c, i) => { const col = `var(--${c.kind === "other" ? "muted" : c.kind})`;
    if (!o.zero) s += `<line class="drop" stroke="${col}" x1="${sx(c.x)}" x2="${sx(c.x)}" y1="${sy(c.value)}" y2="${H - M.b}"/>`;
    s += `<circle style="fill:url(#sg${id}${c.kind})" class="mk ${c.kind}${i === o.sel ? " on" : ""}" data-i="${i}" cx="${sx(c.x)}" cy="${sy(c.value)}" r="${i === o.sel ? 9 : 7}"><title>x = ${fmt(c.x)}, y = ${fmt(c.value)}</title></circle>`; });
  s += `<circle class="tdot" r="5" hidden/><g class="hv" hidden><line class="cross" y1="${M.t}" y2="${H - M.b}"/><g class="tip"><rect rx="5" height="24"/><text></text></g></g><rect class="ov" x="${M.l}" y="${M.t}" width="${pw}" height="${ph}" fill="transparent" style="pointer-events:all"/>`;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.innerHTML = s;
  if (!o.still) $$(".curve", svg).forEach(p => { try { p.style.setProperty("--len", Math.ceil(p.getTotalLength())); p.classList.add("draw"); } catch (e) {} });
  $$("circle.mk", svg).forEach(m => m.onclick = () => o.onmark && o.onmark(+m.dataset.i));
  const hv = $(".hv", svg), S = o.series[0], mv = e => {
    const b = svg.getBoundingClientRect(), px = (e.clientX - b.left) / b.width * W, x = lo + (px - M.l) / pw * (hi - lo);
    const i = Math.max(0, Math.min(S.x.length - 1, Math.round((x - lo) / (hi - lo) * (S.x.length - 1)))), y = S.y[i]; if (y == null) return;
    hv.removeAttribute("hidden"); const gx = sx(S.x[i]), t = `x = ${fmt(+S.x[i].toPrecision(5))}   y = ${fmt(+y.toPrecision(5))}`, tw = t.length * 7.2 + 16;
    const tx = Math.min(Math.max(gx - tw / 2, M.l), W - M.r - tw), ty = Math.max(M.t + 4, sy(y) - 40);
    $(".cross", svg).setAttribute("x1", gx); $(".cross", svg).setAttribute("x2", gx);
    const r = $(".tip rect", svg), tt = $(".tip text", svg); r.setAttribute("x", tx); r.setAttribute("y", ty); r.setAttribute("width", tw);
    tt.setAttribute("x", tx + 8); tt.setAttribute("y", ty + 16); tt.textContent = t;
  };
  const ov = $(".ov", svg); ov.onpointermove = mv; ov.onpointerdown = mv; ov.onpointerleave = () => hv.setAttribute("hidden", "");
  return { tan(x0, y0, m) {
    const d = $(".tdot", svg); d.removeAttribute("hidden"); d.setAttribute("cx", sx(x0)); d.setAttribute("cy", sy(y0));
    const l = $(".tan", svg); if (m == null) return l.setAttribute("hidden", "");
    const w = (hi - lo) * .2; l.removeAttribute("hidden");
    l.setAttribute("x1", sx(x0 - w)); l.setAttribute("x2", sx(x0 + w)); l.setAttribute("y1", sy(y0 - m * w)); l.setAttribute("y2", sy(y0 + m * w)); } };
}
const deriv = (X, Y) => X.map((_, i) => { const a = Math.max(0, i - 1), b = Math.min(X.length - 1, i + 1); return Y[a] == null || Y[b] == null ? null : (Y[b] - Y[a]) / (X[b] - X[a]); });

/* ---------- overview: tangent slides along the curve ---------- */
const HX = Array.from({ length: 241 }, (_, i) => i / 40), HF = x => x * (12 - 2 * x) ** 2, HD = x => (12 - 2 * x) * (12 - 6 * x);
const hp = plot($("#hg"), { lo: 0, hi: 6, series: [{ x: HX, y: HX.map(HF) }], marks: [{ x: 2, value: 128, kind: "max" }, { x: 0, value: 0, kind: "end" }, { x: 6, value: 0, kind: "end" }], h: 340 });
let heroOn = true, auto = !matchMedia("(prefers-reduced-motion: reduce)").matches, t0 = 0;
function heroSet(i) {
  const x = HX[i], y = HF(x), m = HD(x); hp.tan(x, y, m); $("#hs").value = i;
  $("#hro").textContent = `x = ${x.toFixed(2)}   slope = ${m.toFixed(1)}`;
  const f = $("#hflag"), z = Math.abs(m) < 3; f.className = "flag" + (z ? " on" : ""); f.textContent = z ? "Slope is zero: a candidate" : "";
}
function heroLoop(t) { if (!heroOn) return; if (auto) { t0 = t0 || performance.now(); heroSet(Math.round(120 + 120 * Math.sin((performance.now() - t0) / 1900 - 1.2))); requestAnimationFrame(heroLoop); } }
$("#hs").oninput = e => { auto = false; heroSet(+e.target.value); };
heroSet(40);

/* ---------- API ---------- */
async function api(body, url = "/api/analyze") {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error || "The analysis failed."); return d;
}
const netMsg = x => x.message.startsWith("Failed to fetch") ? "Cannot reach the server. Start the app with START_APP_WINDOWS.bat and open http://127.0.0.1:5000." : x.message;
$("#form").onsubmit = e => { e.preventDefault(); run(); };
async function run() {
  const btn = $("#run"), err = $("#err"); err.hidden = true; btn.disabled = true; btn.textContent = "Analyzing…";
  try { cur = await api({ function: $("#fn").value, lo: $("#lo").value, hi: $("#hi").value, include_endpoints: $("#ends").checked }); build(); }
  catch (x) { err.textContent = netMsg(x); err.hidden = false; }
  btn.disabled = false; btn.textContent = "Analyze";
}
function load(f, lo, hi, en) { $("#fn").value = f; $("#lo").value = lo; $("#hi").value = hi; $("#ends").checked = en; location.hash = "#analyzer"; preview(); run(); }

/* ---------- results ---------- */
function build() {
  const r = cur; cands = [];
  if (r.include_endpoints) cands.push({ ...r.endpoints[0], kind: "end", label: "Left endpoint" });
  r.critical_points.forEach(p => cands.push({ ...p, kind: p.type.startsWith("local max") ? "max" : p.type.startsWith("local min") ? "min" : "other", label: p.type[0].toUpperCase() + p.type.slice(1) }));
  if (r.include_endpoints) cands.push({ ...r.endpoints[1], kind: "end", label: "Right endpoint" });
  cands.forEach(c => { c.gmax = r.abs_max.value != null && near(c.value, r.abs_max.value); c.gmin = r.abs_min.value != null && near(c.value, r.abs_min.value); });
  sel = Math.max(0, cands.findIndex(c => c.gmax));
  const w = r.numeric;
  $("#res").innerHTML = `<div class="stack">
  <div class="card" style="padding:14px 18px"><span class="lab">Function analyzed</span><p class="fxl">f(x) = ${r.function} on [${fmt(r.lo)}, ${fmt(r.hi)}]${r.include_endpoints ? "" : ", endpoints excluded"}</p></div>
  <div class="vgrid">${side("Absolute maximum", r.abs_max, "maximum", "max")}${side("Absolute minimum", r.abs_min, "minimum", "min")}</div>
  <div class="card"><h3 style="margin-top:0">Solution, step by step</h3><ol class="tl">
  <li><b>Start with the function</b><span class="m">f(x) = ${r.function}</span></li>
  <li><b>Differentiate</b><div class="steps"><div><span>First derivative</span><span class="m">f′(x) = ${r.f1}</span></div><div><span>Second derivative</span><span class="m">f″(x) = ${r.f2}</span></div></div></li>
  <li><b>Solve f′(x) = 0 and add the endpoints</b>${cands.map(k => `<span class="cc ${k.kind}">x = ${fmt(k.x)}</span>`).join("") || '<span class="at">f′ has no zero in this interval.</span>'}</li>
  <li><b>Compare the values of f</b>${(() => { const v = cands.map(k => k.value), mn = Math.min(...v), mx = Math.max(...v); return cands.map(k => `<div class="cbar" style="--c:var(--${k.kind === "other" ? "muted" : k.kind})"><span class="l">x = ${fmt(k.x)}</span><div class="t"><i data-w="${mx === mn ? 100 : 15 + (k.value - mn) / (mx - mn) * 85}"></i></div><span class="v">${fmt(k.value)} ${k.gmax ? '<span class="tag">max</span>' : ""}${k.gmin ? '<span class="tag">min</span>' : ""}</span></div>`).join(""); })()}</li>
  <li><b>Check it with SciPy</b>${verifyBlock(r)}<p class="sub" style="margin:10px 0 0">Solved in ${r.seconds} s.</p></li></ol></div></div>`;
  grow("#res"); $("#res .vgrid").insertAdjacentHTML("afterend", explain(r));
  $$("#res [data-v]").forEach(countUp);
  if (!$("#graph").hidden) renderGraph(); if (!$("#critical").hidden) renderCritical();
}
function side(t, o, word, cls) {
  if (o.value == null) return `<div class="vt ${cls}"><div class="lab">${t}</div><div class="big">None guaranteed</div><div class="at">An open interval need not reach a ${word}.</div></div>`;
  return `<div class="vt ${cls}"><div class="lab">${t}</div><div class="big" data-v="${o.value}">${fmt(o.value)}</div><div class="at">at x = ${(o.at.length ? o.at : [o.x]).map(fmt).join(" and ")}</div></div>`;
}
function verifyBlock(r) {
  const n = r.numeric, ok = r.status === "verified", row = (a, s, k) => `<tr><td>${a}</td><td>${fmt(s.value)}</td><td>${fmt(k.value)}</td><td>${s.value == null ? "—" : Math.abs(s.value - k.value).toExponential(1)}</td></tr>`;
  return `<span class="badge ${ok ? "ok" : "warn"}">${ok ? "Verified: SymPy and SciPy agree" : "Review the notes below"}</span>
  <div class="tw"><table><thead><tr><th>Check</th><th>SymPy (exact)</th><th>SciPy (numerical)</th><th>Difference</th></tr></thead><tbody>${row("Maximum value", r.abs_max, n.max)}${row("Minimum value", r.abs_min, n.min)}</tbody></table></div>
  ${r.notes.length ? `<ul class="notes">${r.notes.map(t => `<li>${t}</li>`).join("")}</ul>` : ""}`;
}

/* ---------- graph page ---------- */
let gRaf = 0;
function renderGraph() {
  cancelAnimationFrame(gRaf); gRaf = 0;
  if (!cur) { $("#graphBody").innerHTML = empty; return; }
  const r = cur, X = r.curve.x, Y = r.curve.y, D = deriv(X, Y), md = Math.max(...D.filter(v => v != null).map(Math.abs));
  $("#graphBody").innerHTML = `<div class="g2"><div class="card"><p class="cap">f(x) = ${r.function}</p><svg id="g1" role="img" aria-label="Graph of f"></svg>
  <div class="legend"><span><i class="dot max"></i>Local maximum</span><span><i class="dot min"></i>Local minimum</span><span><i class="dot end"></i>Endpoint</span></div>
  <label class="sl" style="display:block;margin:12px 0 0">Move the tangent line<input id="ts" type="range" min="0" max="${X.length - 1}" value="${Math.floor(X.length / 3)}" style="padding:0;border:0;accent-color:var(--accent)"></label><div class="gdbar"><button id="tp" class="btn" type="button">Play</button><span id="tr" style="font-weight:700"></span></div></div>
  <div class="card"><p class="cap">Slope of f(x)</p><p class="sub">Estimated from the curve. Every point where this line crosses zero is a candidate for a turning point.</p><svg id="g2" role="img" aria-label="Slope of f"></svg></div></div>`;
  const marks = () => cands.map(c => ({ ...c, kind: c.kind })), pick = i => { sel = i; renderGraph(); };
  const p1 = plot($("#g1"), { lo: r.lo, hi: r.hi, series: [{ x: X, y: Y }], marks: marks(), sel, onmark: pick });
  const p2 = plot($("#g2"), { lo: r.lo, hi: r.hi, series: [{ x: X, y: D }], zero: true, h: 280, marks: r.critical_points.map(p => ({ x: p.x, value: 0, kind: p.type.startsWith("local max") ? "max" : p.type.startsWith("local min") ? "min" : "other" })) });
  const set = i => { if (Y[i] == null) return; p1.tan(X[i], Y[i], D[i]); p2.tan(X[i], D[i], null);
    $("#tr").textContent = `x = ${fmt(+X[i].toPrecision(5))}   f(x) = ${fmt(+Y[i].toPrecision(5))}   slope = ${fmt(+D[i].toPrecision(4))}${Math.abs(D[i]) < .03 * md ? "   (flat: a candidate)" : ""}`; };
  $("#ts").oninput = e => set(+e.target.value);
  $("#tp").onclick = () => { if (gRaf) { cancelAnimationFrame(gRaf); gRaf = 0; $("#tp").textContent = "Play"; return; } $("#tp").textContent = "Pause"; let k = +$("#ts").value;
    const step = () => { if ($("#graph").hidden || !$("#ts")) { gRaf = 0; return; } k = (k + X.length / 300) % X.length; $("#ts").value = Math.floor(k); set(Math.floor(k)); gRaf = requestAnimationFrame(step); }; step(); }; set(Math.floor(X.length / 3));
}

/* ---------- critical points page ---------- */
function renderCritical() {
  if (!cur) { $("#critBody").innerHTML = empty; return; }
  const c = cands[sel], kc = k => k.kind === "other" ? "muted" : k.kind;
  $("#critBody").innerHTML = `<div class="crit"><div class="card"><p class="sub">Select a candidate to highlight it on the graph and read why it counts.</p>
  <ol class="route">${cands.map((k, i) => `<li><button type="button" data-i="${i}" aria-pressed="${i === sel}" style="--c:var(--${kc(k)})"><b>x = ${fmt(k.x)}</b><small>${k.label}</small><small>f = ${fmt(k.value)}</small>${k.gmax ? '<span class="tag">Absolute max</span>' : ""}${k.gmin ? '<span class="tag">Absolute min</span>' : ""}</button></li>`).join("") || '<li class="sub">No candidates.</li>'}</ol>
  <div class="inspect">${c ? inspect(c) : "<p>f′(x) has no zeros here, so the function only rises or only falls on this interval.</p>"}</div></div>
  <div class="card"><p class="cap">f(x) = ${cur.function}</p><svg id="cg2" role="img" aria-label="Candidates on the graph"></svg></div></div>
  <div class="card ct"><table><thead><tr><th>x (exact)</th><th>f(x)</th><th>Type</th><th>Test</th><th>Found by</th><th>SciPy gap</th></tr></thead><tbody>
  ${cands.map(k => `<tr><td class="f">${k.kind === "end" ? fmt(k.x) : k.x_exact}</td><td>${fmt(k.value)}</td><td><span class="cc ${kc(k) === "muted" ? "other" : kc(k)}">${k.label}</span></td><td>${k.method || "endpoint comparison"}</td><td>${k.source || "interval ends"}</td><td>${k.difference != null ? k.difference.toExponential(1) : "—"}</td></tr>`).join("")}</tbody></table></div>`;
  plot($("#cg2"), { lo: cur.lo, hi: cur.hi, series: [{ x: cur.curve.x, y: cur.curve.y }], marks: cands, sel, h: 330, still: true, onmark: i => { sel = i; renderCritical(); } });
  $$(".route button").forEach(b => b.onclick = () => { sel = +b.dataset.i; renderCritical(); });
}
function inspect(c) {
  const why = c.kind === "end" ? "An endpoint is always a candidate: a continuous function on a closed interval can reach its largest or smallest value at either end." : `f′(${fmt(c.x)}) = 0, and the <b>${c.method}</b> classifies it as a <b>${c.type}</b>.`;
  const ver = c.kind === "end" ? "" : c.numeric_root != null ? `<p>SciPy found the same root on its own. The two answers differ by ${c.difference.toExponential(2)}.</p>` : `<p>Found by ${c.source}.</p>`;
  return `<p><b>x = ${fmt(c.x)}, f(x) = ${fmt(c.value)}</b></p><p>${why}</p>${ver}`;
}

/* ---------- compare page ---------- */
$("#cform").onsubmit = async e => {
  e.preventDefault(); const er = $("#cerr"); er.hidden = true; const b = { lo: $("#clo").value, hi: $("#chi").value, include_endpoints: true };
  try {
    const [A, B] = await Promise.all([api({ ...b, function: $("#fa").value }), api({ ...b, function: $("#fb").value })]);
    const mk = (r, k) => [{ x: r.abs_max.x, value: r.abs_max.value, kind: "max" }, { x: r.abs_min.x, value: r.abs_min.value, kind: "min" }].filter(m => m.value != null);
    $("#cres").innerHTML = `<div class="stack"><div class="card"><svg id="cg" role="img" aria-label="Both functions"></svg><div class="legend"><span><i class="dot max" style="background:var(--accent)"></i>A: ${A.function}</span><span><i class="dot end"></i>B: ${B.function}</span></div></div>
    <div class="card tw"><table><thead><tr><th></th><th>Function</th><th>Absolute maximum</th><th>Absolute minimum</th><th>Spread</th><th>Check</th></tr></thead><tbody>${[["A", A], ["B", B]].map(([n, r]) => `<tr><td><b>${n}</b></td><td class="f">${r.function}</td><td>${fmt(r.abs_max.value)} at x = ${fmt(r.abs_max.x)}</td><td>${fmt(r.abs_min.value)} at x = ${fmt(r.abs_min.x)}</td><td>${fmt(r.abs_max.value - r.abs_min.value)}</td><td>${r.status === "verified" ? "Verified" : "Review"}</td></tr>`).join("")}</tbody></table>
    <p class="sub" style="margin:10px 0 4px">${A.abs_max.value === B.abs_max.value ? "Both reach the same maximum." : `Function ${A.abs_max.value > B.abs_max.value ? "A" : "B"} reaches the higher maximum (${fmt(Math.max(A.abs_max.value, B.abs_max.value))} against ${fmt(Math.min(A.abs_max.value, B.abs_max.value))}).`}</p></div></div>`;
    const hb = (lab, a, b, hi) => { const m = Math.max(Math.abs(a), Math.abs(b)) || 1, w = (v, o) => v === o ? "" : (hi ? v > o : v < o) ? " win" : "", p = v => Math.max(14, Math.abs(v) / m * 100);
      return `<div class="hb"><b>${lab}</b><div class="bt"><span class="bA${w(a, b)}" data-w="${p(a)}"><i>A</i>${fmt(a)}</span></div><div class="bt"><span class="bB${w(b, a)}" data-w="${p(b)}"><i>B</i>${fmt(b)}</span></div></div>`; };
    $("#cres .stack").insertAdjacentHTML("beforeend", `<div class="card"><h3 style="margin-top:0">Head to head</h3>${hb("Absolute maximum (higher wins)", A.abs_max.value, B.abs_max.value, true)}${hb("Absolute minimum (lower wins)", A.abs_min.value, B.abs_min.value, false)}</div>`); grow("#cres");
    plot($("#cg"), { noarea: true, lo: A.lo, hi: A.hi, series: [{ x: A.curve.x, y: A.curve.y }, { x: B.curve.x, y: B.curve.y, cls: "b" }], marks: [...mk(A), ...mk(B).map(m => ({ ...m, kind: "end" }))] });
  } catch (x) { er.textContent = netMsg(x); er.hidden = false; }
};

/* ---------- dataset page ---------- */
const csv = fetch("/sample_dataset.csv") .then(r => {     if (!r.ok) {         throw new Error(`Dataset loading failed: HTTP ${r.status}`);     }     return r.text(); }) .then(t => {
  DATA = t.trim().split(/\r?\n/).slice(1).map(l => { const c = l.split(","); return { id: c[0], name: c[1], f: c[2], lo: c[3], hi: c[4], emax: c[6], emin: c[8], en: c[13] !== "0", ok: c[12] === "ok", tests: l.split('"')[1] || "" }; });
  $("#npr").textContent = DATA.length; const s0 = $("#st0"); if (s0) s0.dataset.v = DATA.length; $("#achips").innerHTML = DATA.filter(d => d.ok).slice(0, 9).map(d => `<button type="button" data-i="${d.id}">${d.name}</button>`).join(""); $$("#achips button").forEach(b => b.onclick = () => { const d = DATA.find(z => z.id === b.dataset.i); load(d.f, d.lo, d.hi, d.en); }); $("#chips").innerHTML = DATA.filter(d => d.ok).slice(0, 8).map(d => `<button type="button" data-i="${d.id}">${d.name}</button>`).join("");
  $$("#chips button").forEach(b => b.onclick = () => { const d = DATA.find(z => z.id === b.dataset.i); load(d.f, d.lo, d.hi, d.en); });
}).catch(error => {     console.error("Dataset loading error:", error);     DATA = []; });
function renderDataset() {
  csv.then(() => { $("#dt").innerHTML = `<thead><tr><th>#</th><th>Problem</th><th>f(x)</th><th>Interval</th><th>Expected max</th><th>Expected min</th><th>Result</th><th></th></tr></thead><tbody>${DATA.map(d => `<tr><td>${d.id}</td><td>${d.name}<div class="sub" style="margin:0">${d.tests}</div></td><td class="f">${d.f}</td><td>[${d.lo}, ${d.hi}]${d.en ? "" : " open"}</td><td>${d.emax || "—"}</td><td>${d.emin || "—"}</td><td id="r${d.id}">—</td><td><button class="ghost" data-i="${d.id}" type="button">Open</button></td></tr>`).join("")}</tbody>`;
    $$("#dt button").forEach(b => b.onclick = () => { const d = DATA.find(z => z.id === b.dataset.i); load(d.f, d.lo, d.hi, d.en); }); });
}
$("#vall").onclick = async () => {
  ringSet(0); let pass = 0; const btn = $("#vall"); btn.disabled = true;
  for (const [ix, d] of DATA.entries()) {
    const c = $("#r" + d.id); c.textContent = "Running…"; c.closest("tr").classList.add("scan"); c.closest("tr").scrollIntoView({ block: "nearest", behavior: "smooth" }); let good;
    try { const r = await api({ function: d.f, lo: d.lo, hi: d.hi, include_endpoints: d.en });
      const chk = (e, v) => e === "" || (v != null && Math.abs(v - +e) <= 1e-4 * (1 + Math.abs(+e)));
      good = d.ok && chk(d.emax, r.abs_max.value) && chk(d.emin, r.abs_min.value);
    } catch (x) { good = !d.ok; }
    c.innerHTML = good ? '<span class="pass">Match</span>' : '<span class="fail">Differs</span>'; pass += good; ringSet((ix + 1) / DATA.length * 100); c.closest("tr").classList.remove("scan");
  }
  $("#vsum").textContent = `${pass} of ${DATA.length} problems match the expected answers.`; if (pass === DATA.length) burst(btn); btn.disabled = false;
};

const topo = () => `<svg class="topo" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${Array.from({ length: 11 }, (_, i) => `<ellipse cx="${560 + i * 6}" cy="${190 - i * 3}" rx="${40 + i * 48}" ry="${24 + i * 27}" transform="rotate(-18 560 190)"/>`).join("")}</svg>`;
$(".hero").insertAdjacentHTML("afterbegin", topo());

/* ---------- multivariable page ---------- */
const RAMP = [[31, 78, 121], [79, 163, 155], [185, 217, 163], [244, 226, 168], [217, 121, 62]], MCOL = { max: "#B4410C", min: "#0B6B61", saddle: "#6B4FA0", other: "#55606A" };
const mkind = t => t.startsWith("local max") ? "max" : t.startsWith("local min") ? "min" : t.startsWith("saddle") ? "saddle" : "other";
const ramp = t => { const k = Math.min(3.999, t * 4), i = Math.floor(k), f = k - i; return `rgb(${[0, 1, 2].map(c => Math.round(RAMP[i][c] + (RAMP[i + 1][c] - RAMP[i][c]) * f)).join()})`; };
function drawHeat(r) {
  const cv = $("#hm"); if (!cv) return; const W = 820, H = 500, L0 = 56, T0 = 14, pw = W - L0 - 18, ph = H - T0 - 42; cv.width = W; cv.height = H;
  const c = cv.getContext("2d"), cs = getComputedStyle(document.documentElement), mu = cs.getPropertyValue("--muted").trim(), ink = cs.getPropertyValue("--ink").trim();
  const n = r.zgrid.n, [z0, z1] = r.zrange, cw = pw / n, ch = ph / n, px = v => L0 + (v - r.lo) / (r.hi - r.lo) * pw, py = v => T0 + ph - (v - r.lo) / (r.hi - r.lo) * ph;
  r.zgrid.z.forEach((row, i) => row.forEach((z, j) => { if (z == null) return; c.fillStyle = ramp(Math.floor(Math.min(1, Math.max(0, (z - z0) / (z1 - z0 || 1))) * 14) / 14); c.fillRect(L0 + j * cw - .3, T0 + ph - (i + 1) * ch - .3, cw + .6, ch + .6); }));
  r.curve.forEach(([x, y]) => { c.fillStyle = "#fff"; c.beginPath(); c.arc(px(x), py(y), 2.8, 0, 7); c.fill(); c.fillStyle = "#111"; c.beginPath(); c.arc(px(x), py(y), 1.7, 0, 7); c.fill(); });
  lastGeom = { L0, T0, pw, ph }; c.strokeStyle = mu; c.lineWidth = 1.5; c.strokeRect(L0, T0, pw, ph); c.fillStyle = mu; c.font = "13px Manrope,sans-serif";
  for (let k = 0; k <= 6; k++) { const v = r.lo + (r.hi - r.lo) * k / 6, t = fmt(+v.toPrecision(3)); c.textAlign = "center"; c.fillText(t, px(v), H - 20); c.textAlign = "right"; c.fillText(t, L0 - 8, py(v) + 4); }
  r.points.forEach(p => { const k = mkind(p.type); c.fillStyle = MCOL[k]; c.strokeStyle = "#fff"; c.lineWidth = 3; c.beginPath(); c.arc(px(p.x), py(p.y), 11, 0, 7); c.stroke(); c.fill();
    c.fillStyle = "#fff"; c.font = "bold 12px Manrope,sans-serif"; c.textAlign = "center"; c.fillText({ max: "M", min: "m", saddle: "S", other: "•" }[k], px(p.x), py(p.y) + 4); });
}
async function runMulti() {
  const er = $("#merr"); er.hidden = true;
  try { const r = await api({ function: $("#mf").value, constraint: $("#mg").value, lo: $("#mlo").value, hi: $("#mhi").value }, "/api/multivar"); lastMulti = r; renderMulti(r); }
  catch (x) { er.textContent = netMsg(x); er.hidden = false; }
}
function renderMulti(r) {
  const con = !!r.constraint, cnt = t => r.points.filter(p => p.type === t).length, pills = `<div class="pills">${con ? `<span class="pill" style="--c:var(--accent)"><b data-v="${r.points.length}">0</b>Lagrange points</span>` : [["local minimum", "min", "minima"], ["local maximum", "max", "maxima"], ["saddle point", "violet", "saddles"]].map(([t, k, w]) => `<span class="pill" style="--c:var(--${k})"><b data-v="${cnt(t)}">0</b>${w}</span>`).join("")}<span class="pill" style="--c:var(--end)">Window ${fmt(r.lo)} to ${fmt(r.hi)}</span></div>`, ok = r.status === "verified", ext = (o, w) => o ? `<div><div class="lab">${w}</div><div class="big" data-v="${o.value}">${fmt(o.value)}</div><div class="at">at ${o.at.map(a => `(${fmt(a[0])}, ${fmt(a[1])})`).join(" and ")}</div></div>` : `<div><div class="lab">${w}</div><div class="big">None guaranteed</div><div class="at">See the notes below.</div></div>`;
  $("#mres").innerHTML = `<div class="stack"><div class="card verdict"><div class="fx">f(x, y) = ${r.function}${con ? ",  subject to " + r.constraint : ""}</div>${con ? ext(r.abs_max, "Maximum on the constraint") + ext(r.abs_min, "Minimum on the constraint") : `<div><div class="lab">Stationary points found</div><div class="big">${r.points.length}</div><div class="at">${["local minimum", "local maximum", "saddle point"].map(t => r.points.filter(p => p.type === t).length + " " + t.replace("local ", "") + (t === "saddle point" ? "" : "")).join(", ")}</div></div><div><div class="lab">Gradient</div><div class="m" style="font-size:1.15rem">∇f = (${r.grad.join(",  ")})</div></div>`}</div>
  ${pills}<div class="mg2"><div class="card"><div class="cw"><canvas id="hm" role="img" aria-label="Contour map of f(x, y) with its stationary points"></canvas><canvas id="ho" aria-hidden="true"></canvas><div class="hint2" id="hint2">Click anywhere on the map</div></div><div class="gdbar"><button type="button" class="btn" id="gdm">Seek: minimum</button><button type="button" class="btn" id="gdc">Clear paths</button><span class="sub" style="margin:0">Click the map to release a ball and watch gradient descent.</span></div><p class="gdout" id="gdo"></p><div class="mono-l"><span><b>M</b> local maximum</span><span><b>m</b> local minimum</span><span><b>S</b> saddle point</span>${con ? "<span><b>White dotted line</b> constraint curve</span>" : ""}<span>Colour runs from low (blue) to high (orange).</span></div></div>
  <div class="card"><h3 style="margin-top:0">Working</h3><p class="sub">${con ? "Solve ∇f = λ∇g and g = 0, then compare f at every solution." : "Solve ∇f = 0, then classify each point with the Hessian."}</p><div class="steps" style="grid-template-columns:1fr"><div><span>Hessian</span><span class="m">[ ${r.hessian[0].join(",  ")} ;  ${r.hessian[1].join(",  ")} ]</span></div></div>
  <span class="badge ${ok ? "ok" : "warn"}">${ok ? "Verified: SymPy and SciPy agree" : "Review the notes below"}</span>${con && r.scipy ? `<p class="sub" style="margin-top:10px">SLSQP independently found max ${fmt(r.scipy.max)} and min ${fmt(r.scipy.min)}.</p>` : ""}${r.notes.length ? `<ul class="notes">${r.notes.map(t => `<li>${t}</li>`).join("")}</ul>` : ""}<p class="sub" style="margin-top:10px">Solved in ${r.seconds} s.</p></div></div>
  <div class="card tw"><table><thead><tr><th>Point (exact)</th><th>x</th><th>y</th><th>f(x, y)</th>${con ? "<th>λ</th>" : ""}<th>Type</th><th>Found by</th></tr></thead><tbody>${r.points.map(p => `<tr><td class="f">${p.exact}</td><td>${fmt(p.x)}</td><td>${fmt(p.y)}</td><td>${fmt(p.value)}</td>${con ? `<td>${fmt(p.lam)}</td>` : ""}<td><span class="cc ${mkind(p.type)}">${p.type}</span></td><td>${p.source}</td></tr>`).join("") || '<tr><td colspan="7">No stationary point inside this window.</td></tr>'}</tbody></table></div></div>`;
  $("#mres .pills").insertAdjacentHTML("afterend", explainMulti(r)); drawHeat(r); $$("#mres [data-v]").forEach(countUp); gdInit(r); s3init(r);
}
$("#mform").onsubmit = e => { e.preventDefault(); runMulti(); };
const MPRE = [["Bowl and saddle", "x^3 - 3*x + y^2 - 4*y", "", -3, 3], ["Egg carton", "sin(x)*cos(y)", "", -3, 3], ["Line on a circle", "x + 2*y", "x^2 + y^2 = 1", -2, 2], ["Rectangle in an ellipse", "x*y", "x^2/4 + y^2 = 1", -3, 3]];
$("#mchips").innerHTML = MPRE.map((p, i) => `<button type="button" data-i="${i}">${p[0]}</button>`).join("");
$$("#mchips button").forEach(b => b.onclick = () => { const p = MPRE[+b.dataset.i]; $("#mf").value = p[1]; $("#mg").value = p[2]; $("#mlo").value = p[3]; $("#mhi").value = p[4]; runMulti(); });

/* ---------- slides ---------- */
const slides = [
  () => `<div class="cover"><svg class="logo" viewBox="0 0 64 32" aria-hidden="true"><path d="M32 16C26 7 18 4 12 8C6 12 6 20 12 24C18 28 26 25 32 16C38 7 46 4 52 8C58 12 58 20 52 24C46 28 38 25 32 16Z" fill="none" stroke="url(#lg)" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/></svg><h4>Optimization Analyzer</h4><p style="font-size:1.25em;max-width:46ch">Finding the largest and smallest values of a function, and checking every answer two independent ways.</p><div class="team"><span class="t1">Presented by</span><b>Raj Tiwari</b><b>Rishabh Prajapati</b></div></div>${glyphs()}${topo()}`,
  () => `<h3>The problem</h3><p>Given a function f(x) on an interval [a, b], where is it largest and where is it smallest?</p><p>A farmer has 100 m of fence and builds a rectangle with one side x. The area is</p><span class="eq">A(x) = x(50 − x)</span><p>On 0 ≤ x ≤ 50 the best area is 625 m² at x = 25. The analyzer finds this for any function you type.</p>`,
  () => `<h3>The calculus behind it</h3><ul><li><b>Extreme Value Theorem.</b> A continuous function on a closed interval always reaches a maximum and a minimum.</li><li><b>Fermat’s theorem.</b> If that extreme is inside the interval, then f′(x) = 0 or f′ does not exist there.</li><li><b>So the candidates are</b> the critical points plus the two endpoints. Compare them all.</li><li><b>Second derivative test.</b> f″ &lt; 0 gives a local maximum, f″ &gt; 0 a local minimum. If f″ = 0, use the first derivative test.</li></ul>`,
  () => `<h3>The method</h3><ol class="flow" style="grid-template-columns:repeat(5,1fr)"><li><b>Parse</b>Whitelist of names, only x allowed.</li><li><b>Differentiate</b>f′ and f″ with SymPy.</li><li><b>Solve</b>f′(x) = 0 exactly, or numerically with Brent.</li><li><b>Classify</b>Second then first derivative test.</li><li><b>Compare</b>Critical points and endpoints.</li></ol><p style="margin-top:22px">Then SciPy searches the whole interval on its own and must reach the same extreme values.</p>`,
  () => `<h3>Two variables and constraints</h3><ul><li><b>No constraint.</b> Solve ∇f = 0, then read the Hessian. With D = f<sub>xx</sub>f<sub>yy</sub> − f<sub>xy</sub>²: D &gt; 0 and f<sub>xx</sub> &gt; 0 is a minimum, D &gt; 0 and f<sub>xx</sub> &lt; 0 a maximum, D &lt; 0 a saddle.</li><li><b>With a constraint g(x, y) = 0.</b> Solve ∇f = λ∇g together with g = 0. The extreme values on the curve are among these points.</li><li><b>Checking.</b> SymPy solves the system exactly. SciPy then restarts a root finder from 81 places and runs SLSQP on the constrained problem.</li></ul>`,
  () => !cur ? `<h3>Live result</h3>${empty}` : `<h3>Live result</h3><div class="cols"><div><p class="m" style="font-size:1.4em">f(x) = ${cur.function}</p><p>on [${fmt(cur.lo)}, ${fmt(cur.hi)}]</p><p><b>Maximum ${fmt(cur.abs_max.value)}</b> at x = ${(cur.abs_max.at || []).map(fmt).join(", ") || "—"}<br><b>Minimum ${fmt(cur.abs_min.value)}</b> at x = ${(cur.abs_min.at || []).map(fmt).join(", ") || "—"}</p><p class="sub">This slide shows whatever you last ran in the Analyzer.</p></div><svg id="sg"></svg></div>`,
  () => !cur ? `<h3>Verification</h3>${empty}` : `<h3>Verification</h3><p>Two methods that share no code path must agree.</p>${verifyBlock(cur)}`,
  () => !lastMulti ? `<h3>Two-variable result</h3>${empty}` : `<h3>Two-variable result</h3><p class="m" style="font-size:1.3em">f(x, y) = ${lastMulti.function}${lastMulti.constraint ? ",  " + lastMulti.constraint : ""}</p><ul>${lastMulti.points.slice(0, 6).map(p => `<li>(${fmt(p.x)}, ${fmt(p.y)}): f = ${fmt(p.value)}, ${p.type}</li>`).join("") || "<li>No stationary point inside the window.</li>"}</ul>`,
  () => `<h3>Safeguards and limits</h3><ul><li>Functions with a jump or a vertical asymptote on the interval are rejected, because no maximum is guaranteed.</li><li>On an open interval, an extreme value is reported only if it occurs at a critical point.</li><li>Corners, where f′ jumps, are caught by the numerical search even when SymPy skips them.</li><li>Limits: Lagrange results are global only for closed, bounded constraint curves, and the program checks this numerically. Inequality constraints and three or more variables are the natural next step.</li></ul>`
];
let lastSlide = 0, sTimer = null;
function showSlide() {
  slide = Math.max(0, Math.min(slides.length - 1, slide)); $("#deck").innerHTML = slides[slide](); $("#deck").classList.toggle("cover0", slide === 0); $("#deck").classList.toggle("back", slide < lastSlide); lastSlide = slide;
  $("#pb").style.width = (slide + 1) / slides.length * 100 + "%"; $("#sc").textContent = `${slide + 1} / ${slides.length}`; $("#dots").innerHTML = slides.map((_, i) => `<button type="button" class="${i === slide ? "on" : ""}" aria-label="Slide ${i + 1}" data-i="${i}"></button>`).join("");
  $("#sp").disabled = !slide; $("#sn").disabled = slide === slides.length - 1;
  if ($("#sg") && cur) plot($("#sg"), { lo: cur.lo, hi: cur.hi, series: [{ x: cur.curve.x, y: cur.curve.y }], marks: cands, h: 320, still: true });
}
$("#sp").onclick = () => { slide--; showSlide(); }; $("#sn").onclick = () => { slide++; showSlide(); };
$("#sf").onclick = () => $("#deck").requestFullscreen && $("#deck").requestFullscreen();
addEventListener("keydown", e => { if ($("#slides").hidden || /INPUT|SELECT/.test(document.activeElement.tagName)) return; if (e.key === "ArrowRight") { slide++; showSlide(); } if (e.key === "ArrowLeft") { slide--; showSlide(); } });


/* ---------- motion and interaction ---------- */
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
function countUp(el) {
  const v = +el.dataset.v; if (!isFinite(v) || still) return; const t0 = performance.now();
  (function f(t) { const k = Math.min(1, (t - t0) / 1000), e = 1 - Math.pow(1 - k, 3); el.textContent = k < 1 ? fmt(+(v * e).toPrecision(6)) : fmt(v); if (k < 1) requestAnimationFrame(f); })(t0);
}
const io = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; const t = e.target; t.classList.add("in"); io.unobserve(t); $$("[data-v]", t).forEach(countUp); if (t.dataset.v) countUp(t); setTimeout(() => { t.style.transitionDelay = ""; t.classList.add("done"); }, 1200); }), { threshold: .12 });
function reveal(id) {
  $$(`#${id} h3, #${id} .tile, #${id} .chips, #${id} .stat, #${id} .marq, #${id} .nextbar, #${id} .mstep, #${id} .vs`).forEach((el, i) => {
    if (el.dataset.rv) return; el.dataset.rv = 1; const ti = [...el.parentNode.children].indexOf(el);
    el.classList.add("rv", el.matches(".tile") ? ["rv-l", "rv-u", "rv-u", "rv-r"][ti % 4] : el.matches("h3") ? "rv-l" : el.matches(".stat,.chips,.marq") ? "rv-z" : "rv-u"); el.style.transitionDelay = (i % 6) * 90 + "ms"; io.observe(el);
  });
}
document.addEventListener("pointerdown", e => {
  const b = e.target.closest(".btn,.primary,.chips button,.ghost,#theme"); if (!b || still) return; const r = b.getBoundingClientRect(), s = document.createElement("span"), d = Math.max(r.width, r.height) * 2;
  s.className = "rip"; s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`; b.appendChild(s); setTimeout(() => s.remove(), 700);
});
document.addEventListener("pointermove", e => {
  const t = e.target.closest(".tile,.hero"); if (!t) return; const r = t.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  t.style.setProperty("--mx", mx + "px"); t.style.setProperty("--my", my + "px");
  if (t.matches(".tile")) { t.style.setProperty("--rx", ((my / r.height - .5) * -9).toFixed(1) + "deg"); t.style.setProperty("--ry", ((mx / r.width - .5) * 9).toFixed(1) + "deg"); }
});
document.addEventListener("pointerout", e => { const t = e.target.closest(".tile"); if (t) { t.style.setProperty("--rx", "0deg"); t.style.setProperty("--ry", "0deg"); } });
const hw = $(".hero h2"); hw.innerHTML = hw.textContent.split(" ").map((w, i) => `<span class="w" style="animation-delay:${i * 70}ms">${w}</span>`).join(" ");
$("#sa").onclick = () => { if (sTimer) { clearInterval(sTimer); sTimer = null; $("#sa").textContent = "Auto-play"; return; } $("#sa").textContent = "Stop"; sTimer = setInterval(() => { slide = slide >= slides.length - 1 ? 0 : slide + 1; showSlide(); }, 6000); };

/* gradient descent on the contour map */
let trails = [], gdSign = 1, gdR = null, gdRaf = 0;
function zAt(r, x, y) {
  const n = r.zgrid.n, u = (x - r.lo) / (r.hi - r.lo) * (n - 1), v = (y - r.lo) / (r.hi - r.lo) * (n - 1), j = Math.min(n - 2, Math.max(0, Math.floor(u))), i = Math.min(n - 2, Math.max(0, Math.floor(v))), a = u - j, b = v - i, z = r.zgrid.z;
  const q = [z[i][j], z[i][j + 1], z[i + 1][j], z[i + 1][j + 1]]; if (q.some(t => t == null)) return null;
  return q[0] * (1 - a) * (1 - b) + q[1] * a * (1 - b) + q[2] * (1 - a) * b + q[3] * a * b;
}
function gdPath(r, x, y, s) {
  const h = (r.hi - r.lo) / 55, pts = [[x, y]]; let step = (r.hi - r.lo) * .035, pg = null;
  for (let k = 0; k < 600 && step > (r.hi - r.lo) * 4e-4; k++) {
    const a = zAt(r, x + h, y), b = zAt(r, x - h, y), c = zAt(r, x, y + h), d = zAt(r, x, y - h); if ([a, b, c, d].some(t => t == null)) break;
    const gx = (a - b) / (2 * h), gy = (c - d) / (2 * h), m = Math.hypot(gx, gy); if (m < 1e-7) break;
    if (pg && pg[0] * gx + pg[1] * gy < 0) step *= .6; pg = [gx, gy];
    x -= s * gx / m * step; y -= s * gy / m * step; if (x < r.lo || x > r.hi || y < r.lo || y > r.hi) break; pts.push([x, y]);
  } return pts;
}
function gdInit(r) {
  gdR = r; trails = [];
  $("#gdm").onclick = () => { gdSign = -gdSign; $("#gdm").textContent = "Seek: " + (gdSign > 0 ? "minimum" : "maximum"); };
  $("#gdc").onclick = () => { trails = []; $("#gdo").textContent = ""; gdDraw(); };
  const ho = $("#ho"); ho.width = 820; ho.height = 500;
  ho.onpointermove = e => { const b = ho.getBoundingClientRect(), g = lastGeom, cx = (e.clientX - b.left) / b.width * 820, cy = (e.clientY - b.top) / b.height * 500, x = r.lo + (cx - g.L0) / g.pw * (r.hi - r.lo), y = r.lo + (g.T0 + g.ph - cy) / g.ph * (r.hi - r.lo); hov = x < r.lo || x > r.hi || y < r.lo || y > r.hi ? null : [x, y]; };
  ho.onpointerleave = () => { hov = null; }; if (!gdRaf) gdRaf = requestAnimationFrame(gdLoop);
  ho.onclick = e => { const hn = $("#hint2"); if (hn) hn.remove();
    const b = ho.getBoundingClientRect(), g = lastGeom, cx = (e.clientX - b.left) / b.width * 820, cy = (e.clientY - b.top) / b.height * 500;
    const x = r.lo + (cx - g.L0) / g.pw * (r.hi - r.lo), y = r.lo + (g.T0 + g.ph - cy) / g.ph * (r.hi - r.lo); if (x < r.lo || x > r.hi || y < r.lo || y > r.hi) return;
    const pts = gdPath(r, x, y, gdSign), end = pts[pts.length - 1], z = zAt(r, end[0], end[1]);
    trails.push({ pts, k: still ? pts.length : 1, s: gdSign, t0: performance.now() });
    $("#gdo").textContent = `Ball settled near (${fmt(+end[0].toPrecision(3))}, ${fmt(+end[1].toPrecision(3))})${z == null ? "" : ", f ≈ " + fmt(+z.toPrecision(4))}. Compare with the table below.`;
    if (!gdRaf) gdRaf = requestAnimationFrame(gdLoop);
  };
}
function gdLoop() {
  trails.forEach(t => { if (t.k < t.pts.length) t.k = Math.min(t.pts.length, t.k + 2); }); gdDraw();
  gdRaf = $("#multi").hidden || !$("#ho") ? 0 : requestAnimationFrame(gdLoop);
}
let hov = null;
function gdDraw() {
  const ho = $("#ho"); if (!ho || !gdR || !lastGeom) return; const c = ho.getContext("2d"), g = lastGeom, r = gdR; c.clearRect(0, 0, 820, 500);
  const px = v => g.L0 + (v - r.lo) / (r.hi - r.lo) * g.pw, py = v => g.T0 + g.ph - (v - r.lo) / (r.hi - r.lo) * g.ph, now = performance.now();
  if (!still) { const u = (now % 5200) / 5200, bx = g.L0 + u * g.pw, x0 = Math.max(g.L0, bx - 60), gr = c.createLinearGradient(bx - 60, 0, bx + 60, 0); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(.5, "rgba(255,255,255,.24)"); gr.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = gr; c.fillRect(x0, g.T0, Math.min(120, g.L0 + g.pw - x0), g.ph); }
  if (!still) r.points.forEach((p, i) => { const u = ((now + i * 260) % 1800) / 1800; c.strokeStyle = "#fff"; c.globalAlpha = (1 - u) * .9; c.lineWidth = 2.5; c.beginPath(); c.arc(px(p.x), py(p.y), 12 + u * 16, 0, 7); c.stroke(); c.globalAlpha = 1; });
  trails.forEach(t => {
    const p = t.pts.slice(0, t.k); c.lineJoin = c.lineCap = "round";
    [["#111", 6], ["#fff", 3]].forEach(([col, w]) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); p.forEach(([x, y], i) => i ? c.lineTo(px(x), py(y)) : c.moveTo(px(x), py(y))); c.stroke(); });
    const [hx, hy] = p[p.length - 1], done = t.k >= t.pts.length, pu = done ? (now - t.t0) % 1400 / 1400 : 0;
    if (done) { c.strokeStyle = "#fff"; c.globalAlpha = 1 - pu; c.lineWidth = 3; c.beginPath(); c.arc(px(hx), py(hy), 9 + pu * 18, 0, 7); c.stroke(); c.globalAlpha = 1; }
    c.fillStyle = t.s > 0 ? "#0B6B61" : "#B4410C"; c.strokeStyle = "#fff"; c.lineWidth = 3; c.beginPath(); c.arc(px(hx), py(hy), 8, 0, 7); c.stroke(); c.fill();
  });
  if (hov) { const z = zAt(r, hov[0], hov[1]); c.strokeStyle = "rgba(255,255,255,.9)"; c.lineWidth = 1; c.setLineDash([5, 5]); c.beginPath(); c.moveTo(px(hov[0]), g.T0); c.lineTo(px(hov[0]), g.T0 + g.ph); c.moveTo(g.L0, py(hov[1])); c.lineTo(g.L0 + g.pw, py(hov[1])); c.stroke(); c.setLineDash([]);
    const t = `x = ${fmt(+hov[0].toPrecision(3))}  y = ${fmt(+hov[1].toPrecision(3))}  f = ${z == null ? "—" : fmt(+z.toPrecision(4))}`, w = t.length * 7.4 + 16, tx = Math.min(px(hov[0]) + 12, g.L0 + g.pw - w), ty = Math.max(g.T0 + 4, py(hov[1]) - 34);
    c.fillStyle = "#111"; c.fillRect(tx, ty, w, 24); c.fillStyle = "#fff"; c.font = "bold 13px Manrope,sans-serif"; c.textAlign = "left"; c.fillText(t, tx + 8, ty + 16); }
}
if (still) gdDraw();


/* ---------- analyzer: keypad and live preview ---------- */
function parseExpr(src) {
  const tk = src.toLowerCase().match(/\d*\.?\d+(?:e[+-]?\d+)?|[a-z]+|[-+*/^(),]|\S/g) || [], F = { sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, ln: Math.log, log: Math.log, sqrt: Math.sqrt, abs: Math.abs, asin: Math.asin, acos: Math.acos, atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh };
  let i = 0; const peek = () => tk[i], eat = t => tk[i] === t ? (i++, true) : false;
  function expr() { let a = term(); while (peek() === "+" || peek() === "-") { const o = tk[i++], b = term(), p = a; a = o === "+" ? x => p(x) + b(x) : x => p(x) - b(x); } return a; }
  function term() { let a = unary(); for (;;) { const t = peek(); if (t === "*" || t === "/") { i++; const b = unary(), p = a; a = t === "*" ? x => p(x) * b(x) : x => p(x) / b(x); } else if (t !== undefined && (/^[\d.a-z]/.test(t) || t === "(")) { const b = unary(), p = a; a = x => p(x) * b(x); } else return a; } }
  function unary() { if (eat("-")) { const a = unary(); return x => -a(x); } if (eat("+")) return unary(); return power(); }
  function power() { const a = atom(); if (eat("^")) { const b = unary(); return x => Math.pow(a(x), b(x)); } return a; }
  function atom() { const t = tk[i++]; if (t === undefined) throw 0; if (/^[\d.]/.test(t)) { const v = parseFloat(t); return () => v; } if (t === "x") return x => x; if (t === "pi") return () => Math.PI; if (t === "e") return () => Math.E;
    if (F[t]) { if (!eat("(")) throw 0; const a = expr(); if (!eat(")")) throw 0; const f = F[t]; return x => f(a(x)); } if (t === "(") { const a = expr(); if (!eat(")")) throw 0; return a; } throw 0; }
  const f = expr(); if (i < tk.length) throw 0; return f;
}
let pvT;
function preview() {
  const st = $("#pvs"); let f = null; const lo = parseFloat($("#lo").value), hi = parseFloat($("#hi").value);
  try { f = parseExpr($("#fn").value); } catch (e) {}
  if (!f || !isFinite(lo) || !isFinite(hi) || lo >= hi) { st.textContent = "Waiting for a valid function and interval"; return; }
  const X = Array.from({ length: 241 }, (_, i) => lo + (hi - lo) * i / 240), Y = X.map(x => { const v = f(x); return isFinite(v) && Math.abs(v) < 1e6 ? v : null; });
  if (Y.filter(v => v != null).length < 3) { st.textContent = "Nothing to draw on this interval"; return; }
  const m = []; for (let i = 1; i < 240; i++) { const a = Y[i - 1], b = Y[i], c = Y[i + 1]; if (a == null || b == null || c == null) continue; if (b > a && b >= c) m.push({ x: X[i], value: b, kind: "max" }); else if (b < a && b <= c) m.push({ x: X[i], value: b, kind: "min" }); }
  const n = m.length; if ($("#ends").checked) [0, 240].forEach(i => Y[i] != null && m.push({ x: X[i], value: Y[i], kind: "end" }));
  st.textContent = `Instant preview: ${n} turning point${n === 1 ? "" : "s"} spotted`;
  plot($("#pv"), { lo, hi, series: [{ x: X, y: Y }], marks: m.slice(0, 14), still: true, h: 380 });
}
const KEYS = [["x²", "^2"], ["x³", "^3"], ["xⁿ", "^"], ["√", "sqrt("], ["sin", "sin("], ["cos", "cos("], ["tan", "tan("], ["eˣ", "exp("], ["ln", "ln("], ["|x|", "abs("], ["π", "pi"], ["x", "x"], ["(", "("], [")", ")"], ["×", "*"], ["÷", "/"]];
$("#keys").innerHTML = KEYS.map(([l, t]) => `<button type="button" data-t="${t}">${l}</button>`).join("");
$("#keys").onclick = e => { const b = e.target.closest("button"); if (!b) return; const f = $("#fn"), s = f.selectionStart ?? f.value.length; f.setRangeText(b.dataset.t, s, f.selectionEnd ?? s, "end"); f.focus(); preview(); };
["fn", "lo", "hi", "ends"].forEach(id => $("#" + id).addEventListener("input", () => { clearTimeout(pvT); pvT = setTimeout(preview, 120); }));
function grow(root) { requestAnimationFrame(() => requestAnimationFrame(() => $$(root + " [data-w]").forEach(el => el.style.width = el.dataset.w + "%"))); }
const ringSet = p => { const r = $("#rf"); if (r) r.style.strokeDashoffset = 100 - p; };
function burst(el) {
  if (still) return; const b = el.getBoundingClientRect();
  for (let i = 0; i < 30; i++) { const s = document.createElement("i"), a = Math.random() * 6.283, d = 70 + Math.random() * 150; s.className = "cf"; s.style.cssText = `left:${b.left + b.width / 2}px;top:${b.top + b.height / 2}px;background:${["#5CCFB6", "#8DB4F4", "#F4BE7A", "#B4410C"][i % 4]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px`; document.body.appendChild(s); setTimeout(() => s.remove(), 1000); }
}
$("#dots").onclick = e => { const b = e.target.closest("button"); if (b) { slide = +b.dataset.i; showSlide(); } };

/* ---------- overview extras: floating symbols, train, stats ---------- */
const GL = ["∫", "∇", "∞", "f′", "Σ", "λ", "π", "∂", "x²", "≈", "f″", "∮"];
function glyphs() { return `<div class="glyphs" aria-hidden="true">${GL.map((g, i) => `<span style="left:${(i * 37 + 8) % 92}%;font-size:${1.3 + (i % 4) * .7}rem;animation-duration:${10 + (i % 5) * 3}s;animation-delay:-${i * 1.7}s">${g}</span>`).join("")}</div>`; }
$(".hero").insertAdjacentHTML("afterbegin", glyphs());
const M1 = ["f′(x) = 0", "f″(x) < 0 ⇒ maximum", "∇f = λ∇g", "D = f<sub>xx</sub>f<sub>yy</sub> − f<sub>xy</sub>²", "Extreme Value Theorem", "Fermat’s theorem", "Hessian matrix", "Lagrange multipliers", "critical points", "tangent slope = 0"];
const M2 = ["SymPy", "SciPy", "NumPy", "Flask", "Brent’s method", "SLSQP", "multi-start solving", "gradient descent", "exact vs numerical", "verified twice"];
const pill = a => a.map(t => `<span>${t}</span>`).join(""), mrow = (a, c) => `<div class="marq ${c}" aria-hidden="true"><div class="mt">${pill(a)}${pill(a)}</div></div>`;
$("#overview h3").insertAdjacentHTML("beforebegin", mrow(M1, "") + mrow(M2, "rev") + `<div class="stats">${[["st0", 17, "worked problems checked live"], [null, 2, "independent solvers"], [null, 3, "classification tests"], [null, 2, "variables, with constraints"]].map(([id, v, l]) => `<div class="stat"><b ${id ? `id="${id}"` : ""} data-v="${v}">0</b><span>${l}</span></div>`).join("")}</div>`);
const fh = $$("#overview h3").find(h => /How one answer/.test(h.textContent)), fl = $("#overview .flow"), fw = document.createElement("div");
fw.className = "flowwrap"; fh.before(fw); fw.innerHTML = '<div class="flowsticky"></div>'; $(".flowsticky", fw).append(fh, fl);
const MINI = ['<span class="typ m">f(x) = x²</span>', '<span class="m">f</span><i class="arr">→</i><span class="m">f′</span>', '<div class="nl"><i></i></div>', '<span class="cc max">M</span><span class="cc min">m</span><span class="cc saddle">S</span>', '<svg class="chk" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" pathLength="1"/><path d="M12 21l6 6 11-13" pathLength="1"/></svg>'];
$$("li", fl).forEach((li, i) => li.insertAdjacentHTML("beforeend", `<div class="mini">${MINI[i]}</div>`));
fl.insertAdjacentHTML("afterbegin", '<span class="track"><i class="fill"></i><b class="train"></b></span>');
let scTick = false;
function onScroll() {
  if (scTick) return; scTick = true;
  requestAnimationFrame(() => { scTick = false; const d = document.documentElement; $("#sp0").style.transform = `scaleX(${scrollY / Math.max(1, d.scrollHeight - innerHeight)})`;
    if (!$("#overview").hidden) { const r = fw.getBoundingClientRect(), n = 5, p = Math.min(1, Math.max(0, (innerHeight * .1 - r.top) / Math.max(1, r.height - innerHeight * .65))), q = p * (n - .15);
      fl.style.setProperty("--p", Math.min(1, q / (n - 1))); $$("li", fl).forEach((li, i) => li.classList.toggle("lit", q >= i + .05)); } });
}
addEventListener("scroll", onScroll, { passive: true }); onScroll();

/* ---------- next-step bars ---------- */
const NEXT = { overview: ["analyzer", "Start with the Analyzer: type a function and press Analyze"], analyzer: ["graph", "Next: see your function on the Graph page"], graph: ["critical", "Next: read why each point is a maximum or a minimum"], critical: ["multi", "Next: try two variables and Lagrange multipliers"], multi: ["compare", "Next: compare two functions on one graph"], compare: ["dataset", "Next: check the engine against known answers"], dataset: ["testing", "Next: see how the engine was stress tested"], testing: ["slides", "Next: present your result as slides"], slides: ["overview", "Back to the Overview"] };
PAGES.forEach(([id], i) => $("#" + id).insertAdjacentHTML("beforeend", `<a class="nextbar" href="#${NEXT[id][0]}"><span><small>Step ${i + 1} of ${PAGES.length}</small>${NEXT[id][1]}</span><b>→</b></a>`));

/* ---------- guided tour ---------- */
const TOUR = [
  { p: "overview", s: ".hero-t .btns", t: "Welcome", d: "This is the Overview. These buttons open the main tools. Press Next and I will show you around." },
  { p: "overview", s: "#nav", t: "The menu is a curve", d: "Each dot is a page. Click a dot to jump there. The glowing dot shows where you are." },
  { p: "analyzer", s: ".fbar", t: "Step 1: write your function", d: "Type f(x) here, for example x*(12 - 2*x)^2. Use * to multiply and ^ for powers. The keys underneath type symbols for you." },
  { p: "analyzer", s: ".bench .pair", t: "Step 2: choose the interval", d: "The analyzer finds the highest and lowest values between these two x numbers." },
  { p: "analyzer", s: "#run", t: "Step 3: press Analyze", d: "You get the highest and lowest values, with every step of the working underneath." },
  { p: "analyzer", s: ".pv", t: "Live preview", d: "This graph redraws as you type, so you can see the function before you solve it." },
  { p: "analyzer", s: "#nav a[data-id=graph]", t: "Then open the Graph page", d: "Click this dot after analyzing. Slide a tangent line along the curve and watch the slope reach zero at each turning point." },
  { p: "multi", s: "#mform", t: "Two variables", d: "Enter f(x, y). Add a constraint such as x^2 + y^2 = 1 to use Lagrange multipliers." },
  { p: "multi", s: "#mchips", t: "Try an example", d: "Press one to load it. Then click the contour map to release a ball that rolls downhill." },
  { p: "dataset", s: "#vall", t: "Prove that it works", d: "This runs every known problem through the engine and marks each one Match or Differs." },
  { p: "slides", s: "#deck", t: "Present it", d: "Use the arrow keys or the dots below. Auto-play moves on by itself." }
];
let ti = -1; const tour = $("#tour"), spot = $(".spot"), tip = $(".tip2");
function tourPlace(el) {
  const r = el.getBoundingClientRect(), p = 8; spot.style.cssText = `left:${r.left - p}px;top:${r.top - p}px;width:${r.width + 2 * p}px;height:${r.height + 2 * p}px`;
  const below = r.bottom + p + 16 + 190 < innerHeight; tip.style.left = Math.max(12, Math.min(innerWidth - Math.min(360, innerWidth - 24) - 12, r.left)) + "px";
  tip.style.top = (below ? r.bottom + p + 14 : Math.max(12, r.top - p - 14 - tip.offsetHeight)) + "px";
}
function tourGo(i) {
  if (i >= TOUR.length) return tourEnd(); i = Math.max(0, i); ti = i; tour.hidden = false; const s = TOUR[i], cp = (location.hash || "#overview").slice(1);
  if (cp !== s.p) location.hash = "#" + s.p;
  $("#tn").textContent = `${i + 1} / ${TOUR.length}`; $("#tt").textContent = s.t; $("#td").textContent = s.d; $("#tnext").textContent = i === TOUR.length - 1 ? "Finish" : "Next"; $("#tback").disabled = !i;
  setTimeout(() => { const el = $(s.s); if (!el) return; el.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" }); setTimeout(() => tourPlace(el), still ? 0 : 450); }, cp !== s.p ? 150 : 0);
}
function tourEnd() { tour.hidden = true; location.hash = "#overview"; scrollTo(0, 0); $("#tourbtn").classList.add("seen"); try { localStorage.setItem("oa-tour", "1"); } catch (e) {} }
$("#tourbtn").onclick = () => tourGo(0); $("#tnext").onclick = () => tourGo(ti + 1); $("#tback").onclick = () => tourGo(ti - 1); $("#tskip").onclick = tourEnd;
addEventListener("keydown", e => { if (tour.hidden) return; if (e.key === "Escape") tourEnd(); if (e.key === "ArrowRight") tourGo(ti + 1); if (e.key === "ArrowLeft") tourGo(ti - 1); });
addEventListener("scroll", () => { if (!tour.hidden) { const el = $(TOUR[ti].s); if (el) tourPlace(el); } }, { passive: true });
addEventListener("resize", () => { if (!tour.hidden) { const el = $(TOUR[ti].s); if (el) tourPlace(el); } });
let seen = null; try { seen = localStorage.getItem("oa-tour"); } catch (e) {} if (seen) $("#tourbtn").classList.add("seen"); else setTimeout(() => tourGo(0), 1800);


/* ---------- plain-language interpretation ---------- */
function explain(r) {
  const at = (o, w) => { if (o.value == null) return `No guaranteed ${w}: an open interval need not reach one.`; const xs = o.at.length ? o.at : [o.x], edge = xs.map(x => near(x, r.lo) || near(x, r.hi));
    return `The ${w} of f is <b>${fmt(o.value)}</b>, reached at x = ${xs.map(fmt).join(" and ")}. ` + (edge.every(Boolean) ? "That is an endpoint: the function is still rising or falling when the interval ends." : edge.some(Boolean) ? "It is reached at an endpoint and at an interior turning point." : "That is an interior turning point: the slope is zero there and changes sign."); };
  const n = r.critical_points.length, gap = Math.max(r.abs_max.value == null ? 0 : Math.abs(r.abs_max.value - r.numeric.max.value), r.abs_min.value == null ? 0 : Math.abs(r.abs_min.value - r.numeric.min.value));
  return `<div class="card why"><h3 style="margin-top:0">What this means</h3><ul class="plain"><li>${at(r.abs_max, "largest value")}</li><li>${at(r.abs_min, "smallest value")}</li>
  <li>There ${n === 1 ? "is 1 turning point" : "are " + n + " turning points"} inside the interval. A turning point is only a candidate. It becomes an extreme value when it beats the endpoints and every other candidate.</li>
  <li>${r.status === "verified" ? `Two independent methods agree (largest difference ${gap.toExponential(1)}), so the answer can be trusted.` : "The two methods did not fully agree. Read the notes below before relying on this answer."}</li></ul></div>`;
}
function explainMulti(r) {
  const L = [], pt = a => `(${fmt(a[0])}, ${fmt(a[1])})`;
  if (r.constraint) {
    L.push(r.abs_max ? `Moving along the curve, f is largest (<b>${fmt(r.abs_max.value)}</b>) at ${r.abs_max.at.map(pt).join(" and ")}.` : "No global maximum is guaranteed on this curve inside the window.");
    L.push(r.abs_min ? `It is smallest (<b>${fmt(r.abs_min.value)}</b>) at ${r.abs_min.at.map(pt).join(" and ")}.` : "No global minimum is guaranteed on this curve inside the window.");
    const p = r.abs_max && r.points.find(q => q.lam != null && q.value === r.abs_max.value); if (p) L.push(`The multiplier λ = ${fmt(p.lam)} is a sensitivity: if the constraint level grows by 1, the best value of f changes by about ${fmt(p.lam)}.`);
    L.push("At every solution ∇f and ∇g point along the same line (the Lagrange condition), so moving along the curve no longer changes f to first order.");
  } else {
    const c = t => r.points.filter(p => p.type === t).length;
    L.push(`Found ${r.points.length} stationary point${r.points.length === 1 ? "" : "s"}: ${c("local minimum")} minimum, ${c("local maximum")} maximum and ${c("saddle point")} saddle. The slope is zero at each.`);
    L.push("A saddle rises in one direction and falls in another, so it is flat but is not an extreme value.");
    L.push("On the map, orange is high ground and blue is low ground. Click the map to release a ball that rolls downhill.");
  }
  L.push(r.status === "verified" ? "The exact and numerical solvers agree, so the result can be trusted." : "Read the notes: something could not be confirmed by both solvers.");
  return `<div class="card why"><h3 style="margin-top:0">What this means</h3><ul class="plain">${L.map(t => `<li>${t}</li>`).join("")}</ul></div>`;
}

/* ---------- testing page ---------- */
async function renderTesting() {
  const el = $("#testBody"); if (el.dataset.ok) return; let d;
  try { const response = await fetch("/test_summary.json");  if (!response.ok) {     throw new Error(`HTTP ${response.status}: Could not load test results`); }  d = await response.json(); } catch (e) { el.innerHTML = '<div class="card"><p>No test results found yet. Run <b>python make_report.py</b> in the project folder.</p></div>'; return; }
  el.dataset.ok = 1; const B = d.baseline, O = d.optimized, S = [["random", "Random problems"], ["hard", "Hard cases"], ["multi", "Constrained, two variables"]];
  const sum = (X, k) => S.reduce((a, [s]) => a + X[s][k], 0), nTests = O.dataset.n + sum(O, "n") + O.concurrency.requests, faster = Math.round((1 - sum(O, "total_s") / sum(B, "total_s")) * 100);
  const pb = (lab, a, b) => { const m = Math.max(a, b) || 1; return `<div class="hb"><b>${lab}</b><div class="bt"><span class="bA" data-w="${Math.max(16, a / m * 100)}">${a.toFixed(2)} s before</span></div><div class="bt"><span class="bB win" data-w="${Math.max(16, b / m * 100)}">${b.toFixed(2)} s after</span></div></div>`; };
  const find = [["Wrong “no maximum” answers on constrained problems (3 of 10)", "The unbounded-curve check compared f on coarse curve samples. Every sample is now snapped onto the constraint with Newton steps first."], ["Up to 10 s of waiting on SymPy", "The fast numerical solver now runs first from screened starting points, and SymPy is capped at 2.5 s."], ["Missed turning points on very wide intervals", "Sampling density now grows with the interval width. At most 1,500 turning points are refined, with a note shown to the user."], ["The program hung when closing", "Timed-out SymPy work now runs in daemon threads."], ["Repeated requests were recomputed", "An LRU cache answers a repeat in about 1 ms instead of 124 ms."]];
  el.innerHTML = `<div class="stack"><div class="stats" style="margin:0">
    <div class="stat"><b data-v="${nTests}">0</b><span>tests run, each checked against an independent reference</span></div>
    <div class="stat"><b data-v="${O.multi.correct}">0</b><span>of ${O.multi.n} constrained problems correct (was ${B.multi.correct})</span></div>
    <div class="stat"><b data-v="${faster}">0</b><span>% less time over the timed suites</span></div>
    <div class="stat"><b data-v="${O.dataset.correct}">0</b><span>of ${O.dataset.n} dataset problems correct</span></div></div>
  <div class="card"><h3 style="margin-top:0">Before and after</h3><p class="sub">Same problems on the same machine (${O.cpus} CPU). Mean time per problem.</p>${S.map(([k, n]) => pb(n, B[k].mean_s, O[k].mean_s)).join("")}
  <div class="tw"><table><thead><tr><th>Suite</th><th>Cases</th><th>Correct before</th><th>Correct after</th><th>Slowest before</th><th>Slowest after</th></tr></thead><tbody>${S.map(([k, n]) => `<tr><td>${n}</td><td>${O[k].n}</td><td>${B[k].correct}</td><td><b>${O[k].correct}</b></td><td>${B[k].max_s} s</td><td><b>${O[k].max_s} s</b></td></tr>`).join("")}</tbody></table></div></div>
  <div class="card"><h3 style="margin-top:0">What testing found, and how it was fixed</h3><ol class="tl">${find.map(([t, x]) => `<li><b>${t}</b><span class="at">${x}</span></li>`).join("")}</ol></div></div>`;
  $$("#testBody [data-v]").forEach(countUp); grow("#testBody");
}
preview();
/*S3-START*/
/* ---------- real 3D surface of f(x, y) ---------- */
let s3R = null, s3Raf = 0; const S3 = { az: .7, el: .95, drag: null };
function s3init(r) {
  s3R = r;
  if (!$("#s3")) $("#mres .mg2").insertAdjacentHTML("afterend", `<div class="card"><h3 style="margin-top:0">3D view</h3><p class="sub">The same function drawn as a surface. Drag to rotate it. Spheres mark the stationary points${r.constraint ? ", and the dotted line is the constraint curve lifted onto the surface" : ""}.</p><canvas id="s3" width="820" height="460" role="img" aria-label="3D surface of f(x, y)"></canvas></div>`);
  const cv = $("#s3");
  cv.onpointerdown = e => { S3.drag = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = e => { if (!S3.drag) return; S3.az += (e.clientX - S3.drag[0]) * .008; S3.el = Math.max(.15, Math.min(1.5, S3.el + (e.clientY - S3.drag[1]) * .006)); S3.drag = [e.clientX, e.clientY]; };
  cv.onpointerup = cv.onpointercancel = () => { S3.drag = null; };
  if (!s3Raf) s3Raf = requestAnimationFrame(s3Loop); else s3Draw();
}
function s3Loop() { const cv = $("#s3"); if ($("#multi").hidden || !cv) { s3Raf = 0; return; } if (!S3.drag && !matchMedia("(prefers-reduced-motion: reduce)").matches) S3.az += .006; s3Draw(); s3Raf = requestAnimationFrame(s3Loop); }
function s3Draw() {
  const cv = $("#s3"), r = s3R; if (!cv || !r) return; const c = cv.getContext("2d"), W = 820, H = 460, n = r.zgrid.n, Z = r.zgrid.z, [z0, z1] = r.zrange, zm = (z0 + z1) / 2, zs = (z1 - z0) / 2 || 1;
  const ca = Math.cos(S3.az), sa = Math.sin(S3.az), ce = Math.cos(S3.el), se = Math.sin(S3.el), S = 190;
  const P = (u, v, w) => { const x1 = u * ca - v * sa, y1 = u * sa + v * ca, y2 = y1 * ce + w * se, z2 = -y1 * se + w * ce, p = 3.2 / (3.2 + y2); return [W / 2 + x1 * p * S, H * .56 - z2 * p * S, y2, p]; };
  const wz = z => Math.max(-1.25, Math.min(1.25, (z - zm) / zs * .85)), U = i => i / (n - 1) * 2 - 1, items = [], span = (r.hi - r.lo) || 1, uu = v => (v - r.lo) / span * 2 - 1;
  c.clearRect(0, 0, W, H);
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) {
    const a = Z[i][j], b = Z[i][j + 1], d = Z[i + 1][j + 1], e = Z[i + 1][j]; if (a == null || b == null || d == null || e == null) continue;
    const q = [P(U(j), U(i), wz(a)), P(U(j + 1), U(i), wz(b)), P(U(j + 1), U(i + 1), wz(d)), P(U(j), U(i + 1), wz(e))], zz = (a + b + d + e) / 4, t = Math.min(1, Math.max(0, (zz - z0) / (z1 - z0 || 1)));
    items.push({ dp: (q[0][2] + q[2][2]) / 2, q, col: ramp(Math.floor(t * 14) / 14) });
  }
  r.points.forEach(p => { if (p.value == null) return; const w = wz(p.value) + .04, q = P(uu(p.x), uu(p.y), w), f = P(uu(p.x), uu(p.y), -1.25); items.push({ dp: q[2] - .06, pt: q, f, k: mkind(p.type) }); });
  const step = Math.max(1, Math.floor(r.curve.length / 360)); for (let k = 0; k < r.curve.length; k += step) { const [x, y] = r.curve[k], z = zAt(r, x, y); if (z == null) continue; const q = P(uu(x), uu(y), wz(z) + .03); items.push({ dp: q[2] - .06, dot: q }); }
  const fl = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => P(u, v, -1.25)); c.beginPath(); fl.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.closePath(); c.fillStyle = "rgba(128,150,145,.16)"; c.fill(); c.strokeStyle = "rgba(128,150,145,.65)"; c.lineWidth = 1.5; c.stroke();
  items.sort((a, b) => b.dp - a.dp);
  items.forEach(it => {
    if (it.q) { c.beginPath(); it.q.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fillStyle = it.col; c.fill(); c.strokeStyle = "rgba(0,0,0,.16)"; c.lineWidth = .6; c.stroke(); }
    else if (it.dot) { c.fillStyle = "#fff"; c.beginPath(); c.arc(it.dot[0], it.dot[1], 2.6 * it.dot[3], 0, 7); c.fill(); c.fillStyle = "#111"; c.beginPath(); c.arc(it.dot[0], it.dot[1], 1.5 * it.dot[3], 0, 7); c.fill(); }
    else { const [x, y, , p] = it.pt, rad = 10 * p + 2, col = MCOL[it.k]; c.strokeStyle = "rgba(0,0,0,.35)"; c.lineWidth = 1.5; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(x, y); c.lineTo(it.f[0], it.f[1]); c.stroke(); c.setLineDash([]);
      const g = c.createRadialGradient(x - rad * .35, y - rad * .35, rad * .1, x, y, rad); g.addColorStop(0, "#fff"); g.addColorStop(.35, col); g.addColorStop(1, "#000"); c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill(); c.strokeStyle = "#fff"; c.lineWidth = 2; c.stroke(); }
  });
}
/*S3-END*/

/* ---------- tactile 3D feedback for every tap and calculation ---------- */
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.addEventListener("pointerdown", e => {
    const el = e.target.closest("button,.btn,.tile,.pill,.vt,.stat");
    if (!el || reduced || el.disabled) return;
    el.classList.remove("tap3d"); void el.offsetWidth; el.classList.add("tap3d");
    setTimeout(() => el.classList.remove("tap3d"), 500);
  }, {passive:true});
  document.addEventListener("submit", e => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement) || reduced) return;
    form.classList.remove("is-computing"); void form.offsetWidth; form.classList.add("is-computing");
    setTimeout(() => form.classList.remove("is-computing"), 900);
  }, true);
})();

/* ---------- whole-interface 3D: tilt with glare, floating cubes, gyroscope ---------- */
let cur3 = null; const still3 = matchMedia("(prefers-reduced-motion: reduce)").matches, rel3 = t => { t.style.setProperty("--an", "0deg"); t.style.setProperty("--tz", "0px"); };
if (!still3) {
  document.addEventListener("pointermove", e => {
    if (e.pointerType === "touch") return; const t = e.target.closest(".card,.tile,.stat,.vt,.nextbar,.pill"); if (cur3 && cur3 !== t) rel3(cur3); cur3 = t; if (!t) return;
    t.classList.add("t3d"); const r = t.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5, big = Math.max(r.width, r.height) > 700, k = big ? 3 : 12, a = -py * k, b = px * k, an = Math.hypot(a, b) || 1;
    t.style.setProperty("--ax", (a / an).toFixed(3)); t.style.setProperty("--ay", (b / an).toFixed(3)); t.style.setProperty("--an", an.toFixed(2) + "deg"); t.style.setProperty("--tz", big ? "8px" : "24px");
    let g = t.querySelector(":scope > .glare"); if (!g) { g = document.createElement("i"); g.className = "glare"; t.appendChild(g); } g.style.setProperty("--gx", (px + .5) * 100 + "%"); g.style.setProperty("--gy", (py + .5) * 100 + "%");
  });
  document.documentElement.addEventListener("mouseleave", () => { if (cur3) rel3(cur3); });
  document.body.insertAdjacentHTML("afterbegin", `<div class="cubes" aria-hidden="true">${Array.from({ length: 7 }, (_, i) => `<div class="cube" style="--s:${50 + (i * 23) % 60}px;left:${(i * 29 + 6) % 92}%;top:${(i * 41 + 10) % 78}%;animation-duration:${18 + i * 4}s,${9 + i * 2}s;animation-delay:-${i * 3}s,-${i * 2}s">${[1, 2, 3, 4, 5, 6].map(f => `<i class="f${f}"></i>`).join("")}</div>`).join("")}</div>`);
  $(".hero").insertAdjacentHTML("afterbegin", '<div class="gyrobox" aria-hidden="true"><div class="gyro"><i class="r1"></i><i class="r2"></i><i class="r3"></i><b></b></div></div>');
}

go(); run(); runMulti();
