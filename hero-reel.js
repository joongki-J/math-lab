/* ---------- 히어로 모션: 연필 선 하나가 수학 도형이 되었다가 돌아오는 12초 루프 ----------
   선 → 베지어 곡선 → 사인파 → 원·삼각형·사각형·육각형 → 벌집 → 곱셈 원 → 다시 선.
   배경 없이 히어로 격자 위에 바로 그려서 사진 칸처럼 떨어져 보이지 않는다.
   흑연 + 오렌지 포인트만 쓰고, 컷·페이드 없이 모양만 바뀐다.
   마지막 프레임 = 첫 프레임. */
(() => {
  const canvas = document.querySelector("#reelCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const W = 500, H = 588, CX = 250, CY = 262, LOOP = 12, HALF = 230;
  const MONO = '"IBM Plex Mono", ui-monospace, monospace';
  const INK = { main: "#15171a", accent: "#ff5a30", muted: "#6b6f74" };

  /* ---------- 이징 ---------- */
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, u) => a + (b - a) * u;
  // 임계 감쇠 스프링: 목표를 넘지 않는다. 박자보다 0.05초 먼저 출발해 박자에 닿는다.
  const S = (t, beat, w = 22) => {
    const x = t - beat + 0.05;
    return x <= 0 ? 0 : 1 - (1 + w * x) * Math.exp(-w * x);
  };
  const span = (t, a, b) => clamp((t - a) / (b - a));
  const hash = n => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };

  /* ---------- 도형 ---------- */
  const path = (pts, o = {}) => ({ k: "path", pts, closed: false, c: "main", w: 3, alpha: 1, ...o });
  const shape = (pts, o = {}) => path(pts, { closed: true, ...o });
  const hatch = (pts, o = {}) => ({ k: "hatch", pts, c: "accent", gap: 10, ang: -Math.PI / 4, prog: 1, w: 1.4, ...o });
  const text = (str, x, y, o = {}) => ({ k: "text", str, x, y, size: 19, weight: 500, track: 0.16, c: "muted", align: "left", ...o });

  const hexPts = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => {
    const a = -Math.PI / 2 + i * Math.PI / 3;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  const circlePts = (cx, cy, r, n = 24) => Array.from({ length: n }, (_, i) => {
    const a = i / n * Math.PI * 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  // 극좌표로 샘플링: 바닥(π/2)에서 시작해 시계 방향. 모양끼리 점 대 점으로 섞을 수 있다.
  const N = 240;
  const polar = fn => Array.from({ length: N }, (_, i) => {
    const a = Math.PI / 2 + i / N * Math.PI * 2, r = fn(a);
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  });
  const regR = (n, r, a0) => a => {
    const seg = Math.PI * 2 / n, d = (((a - a0) % seg) + seg) % seg;
    return r * Math.cos(Math.PI / n) / Math.cos(d - Math.PI / n);
  };
  const mix = (A, B, u) => A.map((p, i) => [lerp(p[0], B[i][0], u), lerp(p[1], B[i][1], u)]);

  // 길이가 그대로인 채 휘는 선: e=0이면 수평선, e=1이면 닫힌 원
  const R0 = 2 * HALF / (Math.PI * 2);
  function arcPts(e) {
    const k = e / R0, L = 2 * HALF, yTop = CY - R0 * e, out = [];
    for (let i = 0; i < N; i++) {
      const u = i / N;
      if (k < 1e-4) { out.push([CX - HALF + L * u, yTop]); continue; }
      const rho = 1 / k, th = -Math.PI / 2 + (u - 0.5) * L / rho;
      out.push([CX + rho * Math.cos(th), yTop + rho + rho * Math.sin(th)]);
    }
    return out;
  }

  /* ---------- 1마디 CURVE (0~2초) ---------- */
  function curve(t, ops) {
    const P0 = [CX - HALF, CY], P3 = [CX + HALF, CY];
    const hl = 160 * S(t, 0.1, 18) * (1 - S(t, 1.0));
    const swing = S(t, 0.5, 18), wave = S(t, 1.0, 16), gather = S(t, 1.5, 18);
    const copies = t >= 0.45 && t < 1.95 ? 7 : 0;
    const bez = (a, u) => {
      const P1 = [P0[0] + hl * Math.cos(a), P0[1] - hl * Math.sin(a)];
      const P2 = [P3[0] - hl * Math.cos(a), P3[1] + hl * Math.sin(a)];
      const v = 1 - u;
      return [0, 1].map(k => v * v * v * P0[k] + 3 * v * v * u * P1[k] + 3 * v * u * u * P2[k] + u * u * u * P3[k]);
    };
    for (let j = copies; j >= 0; j--) {
      const deg = j === 0 ? 58 - 116 * swing : 58 - 116 * swing * (j / 8);
      const a = deg * Math.PI / 180, pts = [];
      for (let i = 0; i <= 64; i++) {
        const u = i / 64, b = bez(a, u);
        const amp = 46 * (1 - gather) * Math.pow(Math.sin(Math.PI * u), 0.6);
        const sy = CY + amp * Math.sin(Math.PI * 2 * 2.75 * u + j * 0.45 * (1 - gather) - (t - 1) * 7);
        pts.push([lerp(b[0], lerp(P0[0], P3[0], u), wave), lerp(b[1], sy, wave)]);
      }
      ops.push(path(pts, j === 0 ? { w: 3 } : { c: "accent", w: 1.6, alpha: 0.85 }));
    }
    if (hl > 2) {   // 펜 툴 핸들
      const a = (58 - 116 * swing) * Math.PI / 180;
      const P1 = [P0[0] + hl * Math.cos(a), P0[1] - hl * Math.sin(a)];
      const P2 = [P3[0] - hl * Math.cos(a), P3[1] + hl * Math.sin(a)];
      ops.push(path([P0, P1], { c: "accent", w: 1.5 }), path([P3, P2], { c: "accent", w: 1.5 }));
      for (const p of [P0, P3]) ops.push(shape(rectPts(p[0] - 6, p[1] - 6, p[0] + 6, p[1] + 6), { c: "accent", w: 2 }));
      for (const p of [P1, P2]) ops.push(shape(circlePts(p[0], p[1], 6, 16), { c: "accent", w: 2 }));
    }
  }

  /* ---------- 2마디 MORPH (2~4초): 원 → 삼각형 → 사각형 → 육각형 ---------- */
  function morph(t, ops) {
    const curl = S(t, 2.1, 12);
    let pts = arcPts(curl);
    pts = mix(pts, polar(() => 150), S(t, 2.3, 16));
    const m1 = S(t, 2.5);
    pts = mix(pts, polar(regR(3, 178, -Math.PI / 2 + Math.PI * 2 / 3 * m1)), m1);
    pts = mix(pts, polar(regR(4, 170, -Math.PI / 4)), S(t, 3.0));
    pts = mix(pts, polar(regR(6, 165, -Math.PI / 2)), S(t, 3.5));
    const hp = span(t, 2.6, 3.5), cp = span(t, 3.55, 3.95);
    if (hp > 0) ops.push(hatch(pts, { prog: hp }));
    if (cp > 0) ops.push(hatch(pts, { prog: cp, ang: Math.PI / 4 }));
    ops.push(path(pts, { closed: curl > 0.97 || t > 2.5 }));
  }

  /* ---------- 3마디 TILE (4~6초): 벌집이 퍼졌다가 다시 모인다 ---------- */
  const HR = 52, SP = Math.sqrt(3) * HR * 1.08;
  const CELLS = (() => {
    const out = [[0, 0, 0]];
    for (const [q, r] of [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]]) out.push([q, r, 1]);
    for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) === 2) out.push([q, r, 2]);
    }
    return out.map(([q, r, ring], i) => ({ i, ring, x: SP * (q + r / 2), y: SP * Math.sqrt(3) / 2 * r }));
  })();
  function tile(t, ops) {
    const back = S(t, 5.5, 16);                      // 다시 가운데로 모인다
    const rc = lerp(lerp(165, HR, S(t, 4.0)), 165, back);
    const sweep = lerp(-100, W + 100, span(t, 4.95, 5.45));
    const erase = 1 - span(t, 5.6, 5.95);            // 빗금이 한 줄씩 지워진다
    for (const c of CELLS) {
      let x = 0, y = 0, r = rc;
      if (c.ring) {
        const f = c.ring === 1 ? S(t, 4.05 + 0.03 * (c.i - 1)) : S(t, 4.5 + 0.015 * (c.i - 7));
        if (f < 0.01 || back > 0.9) continue;
        const k = (c.ring === 1 ? f : lerp(0.5, 1, f)) * (1 - back);
        x = c.x * k; y = c.y * k; r = lerp(HR, rc, back);
      }
      const pts = hexPts(CX + x, CY + y, r);
      if (c.ring === 0) {
        ops.push(hatch(pts, { prog: erase }), hatch(pts, { prog: erase, ang: Math.PI / 4 }));
      } else {
        const prog = clamp((sweep - (CX + x - r)) / (2 * r)) * erase;
        if (prog > 0) ops.push(hatch(pts, { gap: 6, prog }));
      }
      ops.push(shape(pts, { w: c.ring ? 2.6 : 3 }));
    }
  }

  /* ---------- 4~5마디 CHORD·MODULO (6~10초): 홈페이지의 곱셈 원 ---------- */
  const RC = 205, M = 120;
  const pt = i => { const a = i / M * Math.PI * 2 - Math.PI / 2; return [CX + RC * Math.cos(a), CY + RC * Math.sin(a)]; };
  const kAt = t => lerp(2 + S(t, 7.5) + S(t, 8.0) + S(t, 8.5) + S(t, 9.0), 1, S(t, 10.0, 10));
  function chords(t, ops) {
    const toCircle = S(t, 6.0, 16);
    if (t < 10.3) ops.push(shape(mix(polar(regR(6, 165, -Math.PI / 2)), polar(() => RC), toCircle), { w: 3 }));
    const k = kAt(t), cnt = Math.floor(M * span(t, 6.45, 7.0)), segs = [];
    for (let i = 0; i < cnt; i++) segs.push([...pt(i), ...pt(i * k)]);
    ops.push({ k: "segs", segs, c: "main", w: 0.9, alpha: 0.42 });
    if (t >= 6.95 && t < 10.05) {
      const li = ((t - 6.95) * 26) % M, a = pt(li), b = pt(li * k);
      ops.push({ k: "segs", segs: [[...a, ...b]], c: "accent", w: 2.8, alpha: 1 }, { k: "dot", x: a[0], y: a[1], r: 7, c: "accent" });
    }
    const s = `i ↦ (${k.toFixed(2)} × i) mod ${M}`;
    const n = Math.round(s.length * span(t, 6.95, 7.3) * (1 - span(t, 10.0, 10.3)));
    ops.push(text(s.slice(0, n), CX, CY + RC + 58, { align: "center", size: 15, track: 0.02 }));
  }

  /* ---------- 6마디 RETURN (10~12초): 원이 줄어들고 펴져 처음의 선으로 ---------- */
  function unwind(t, ops) {
    const shrink = S(t, 10.5, 14), uncurl = 1 - S(t, 11.0, 12);
    const pts = mix(polar(() => RC), arcPts(uncurl), shrink);
    ops.push(path(pts, { closed: uncurl > 0.97 }));
  }

  function build(t) {
    const ops = [];
    if (t < 2) curve(t, ops);
    else if (t < 4) morph(t, ops);
    else if (t < 6) tile(t, ops);
    if (t >= 6 && t < 10.6) chords(t, ops);
    if (t >= 10.3) unwind(t, ops);
    return ops;
  }

  /* ---------- 렌더러: 연필로 그어 종이에 곱한다 ---------- */
  let K = 1, PH = 0, TOOTH = null;
  const layer = document.createElement("canvas"), lg = layer.getContext("2d");
  const col = c => INK[c];

  function resample(pts, closed, step) {
    const src = closed ? pts.concat([pts[0]]) : pts, out = [];
    let s = 0;
    for (let i = 0; i < src.length - 1; i++) {
      const [x0, y0] = src[i], [x1, y1] = src[i + 1], len = Math.hypot(x1 - x0, y1 - y0);
      if (len < 1e-6) continue;
      const nx = -(y1 - y0) / len, ny = (x1 - x0) / len, n = Math.max(1, Math.ceil(len / step));
      for (let j = 0; j < n; j++) { const u = j / n; out.push([x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, nx, ny, s + len * u]); }
      s += len;
    }
    if (out.length) { const l = src[src.length - 1], p = out[out.length - 1]; out.push([l[0], l[1], p[2], p[3], s]); }
    return out;
  }
  const trace = (g, pts, closed) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    if (closed) g.closePath();
  };

  // 연필: 다시 샘플링해 느린 사인파로 흔들고, 초당 8번 위상을 바꾼다. 두 번 긋는다.
  function pencil(g, pts, closed, w, color, alpha, seed) {
    const rs = resample(pts, closed, 6);
    if (rs.length < 2) return;
    g.strokeStyle = color; g.lineCap = "round"; g.lineJoin = "round";
    for (const [lw, al, amp, sd] of [[w, 0.9, 1.2, 0], [w * 0.5, 0.4, 2.6, 7.7]]) {
      g.globalAlpha = al * alpha; g.lineWidth = lw; g.beginPath();
      rs.forEach(([x, y, nx, ny, s], i) => {
        const o = amp * (Math.sin(s * 0.021 + PH * 1.7 + seed + sd) + 0.5 * Math.sin(s * 0.063 + PH * 2.9 + seed * 2.3 + sd));
        i ? g.lineTo(x + nx * o, y + ny * o) : g.moveTo(x + nx * o, y + ny * o);
      });
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  // 빗금: 한 줄씩 그어진다(prog). 줄마다 조금씩 비틀린다.
  function hatchLines(g, op) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of op.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const d = [Math.cos(op.ang), Math.sin(op.ang)], n = [-d[1], d[0]];
    const proj = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => x * n[0] + y * n[1]);
    const lo = Math.min(...proj), hi = Math.max(...proj), L = Math.hypot(x1 - x0, y1 - y0) + 4;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, mo = mx * n[0] + my * n[1];
    const start = Math.ceil(lo / op.gap) * op.gap, count = Math.floor((hi - start) / op.gap) + 1;
    const lim = Math.floor(count * op.prog);
    g.save(); trace(g, op.pts, true); g.clip();
    g.strokeStyle = col(op.c); g.lineWidth = op.w; g.globalAlpha = 0.75; g.beginPath();
    for (let i = 0; i < lim; i++) {
      const o = start + i * op.gap + (hash(i * 3.1 + PH) - 0.5) * 1.6;
      const cx = mx + n[0] * (o - mo), cy = my + n[1] * (o - mo), tw = (hash(i + PH * 5.3) - 0.5) * 0.03;
      g.moveTo(cx - d[0] * L - n[0] * L * tw, cy - d[1] * L - n[1] * L * tw);
      g.lineTo(cx + d[0] * L + n[0] * L * tw, cy + d[1] * L + n[1] * L * tw);
    }
    g.stroke(); g.restore();
  }

  function drawText(g, op) {
    if (!op.str) return;
    g.save();
    g.font = `${op.weight} ${op.size}px ${MONO}`;
    if ("letterSpacing" in g) g.letterSpacing = `${op.track * op.size}px`;
    g.textAlign = op.align; g.textBaseline = "alphabetic";
    g.fillStyle = col(op.c); g.fillText(op.str, op.x, op.y);
    g.restore();
  }

  function render(t) {
    PH = Math.floor(t * 8);
    const ops = build(t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    lg.setTransform(1, 0, 0, 1, 0, 0); lg.clearRect(0, 0, layer.width, layer.height); lg.setTransform(K, 0, 0, K, 0, 0);
    ops.forEach((o, idx) => {
      if (o.k === "path") pencil(lg, o.pts, o.closed, o.w, col(o.c), o.alpha, idx * 0.37);
      else if (o.k === "segs") o.segs.forEach((s, i) => pencil(lg, [[s[0], s[1]], [s[2], s[3]]], false, o.w, col(o.c), o.alpha, i));
      else if (o.k === "hatch") hatchLines(lg, o);
      else if (o.k === "dot") { lg.fillStyle = col(o.c); lg.beginPath(); lg.arc(o.x, o.y, o.r, 0, Math.PI * 2); lg.fill(); }
      else if (o.k === "text") drawText(lg, o);
    });
    // 종이 결: 선에서 군데군데 흑연이 빠진다
    lg.setTransform(1, 0, 0, 1, 0, 0);
    lg.globalCompositeOperation = "destination-out"; lg.fillStyle = TOOTH; lg.fillRect(0, 0, layer.width, layer.height);
    lg.globalCompositeOperation = "source-over";
    ctx.drawImage(layer, 0, 0);   // 캔버스는 투명: 히어로 격자 위에 바로 그어진다(CSS에서 multiply)
  }

  /* ---------- 종이 결 준비 ---------- */
  function prepare() {
    const tooth = document.createElement("canvas");
    tooth.width = tooth.height = 128;
    const tg = tooth.getContext("2d"), ti = tg.createImageData(128, 128);
    for (let i = 0; i < ti.data.length; i += 4) ti.data[i + 3] = Math.random() < 0.2 ? 60 + Math.random() * 140 : 0;
    tg.putImageData(ti, 0, 0);
    TOOTH = lg.createPattern(tooth, "repeat");
  }

  function resize() {
    const css = canvas.clientWidth || 400, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(css * dpr);
    if (cw === canvas.width) return;
    canvas.width = cw; canvas.height = Math.round(cw * H / W);
    layer.width = canvas.width; layer.height = canvas.height;
    K = cw / W;
    prepare();
  }

  /* ---------- 재생 ---------- */
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let start = performance.now(), visible = true, seekT = null;
  resize();
  new ResizeObserver(resize).observe(canvas);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
  }
  function frame(now) {
    if (visible && seekT === null) render(((now - start) / 1000) % LOOP);
    requestAnimationFrame(frame);
  }
  // 움직임 줄이기 설정이면 곱셈 원이 완성된 장면 하나만 보여 준다
  if (still) render(8.2); else requestAnimationFrame(frame);
  if (document.fonts && still) document.fonts.ready.then(() => render(8.2));

  // 확인용: heroReel.seek(8.2)로 특정 시각을 멈춰 볼 수 있다. seek(null)이면 다시 재생.
  window.heroReel = {
    seek(t) { seekT = t; if (t !== null) { resize(); render(((t % LOOP) + LOOP) % LOOP); } else start = performance.now(); }
  };
})();
