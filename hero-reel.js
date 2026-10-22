/* ---------- 히어로 모션: 연필 선 하나가 세 번 승급하는 30초 루프 ----------
   종이(연필) → 청사진(철사) → 홀로그램(빛) → 다시 종이.
   장면마다 같은 도형 목록(ops)을 만들고, 지금 화면에 있는 잉크로 그린다.
   카메라는 고정, 컷·페이드 없음, 마지막 프레임 = 첫 프레임. */
(() => {
  const canvas = document.querySelector("#reelCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const W = 800, H = 940, CX = 400, CY = 470, LOOP = 30, DIST = 700, HALF = 260;
  const FONT = '"Geist", "Helvetica Neue", Arial, sans-serif';
  const INKS = {
    paper: { bg: "#EDE6D5", grid: "27,62,210", main: "#16161A", accent: "#1B3ED2" },
    blue: { bg: "#1B3ED2", grid: "255,255,255", main: "#FFFFFF", accent: "#45F0DD" },
    holo: { bg: "#07080A", grid: "69,240,221", main: "#45F0DD", accent: "#FFFFFF" }
  };
  const NAMES = ["DRAFT", "TYPE", "CURVE", "MORPH", "TILE", "SOLID", "GEAR", "NET",
    "DATA", "LIGHT", "CHORD", "GLOBE", "DRUM", "FORM", "END"];
  const BARS = [42, 30, 36, 44, 50, 46, 52, 62, 50, 56, 62, 72, 60, 66, 58,
    76, 56, 62, 68, 74, 70, 78, 86, 94, 100, 93, 97, 90, 80, 50];

  /* ---------- 이징 ---------- */
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, u) => a + (b - a) * u;
  // 임계 감쇠 스프링: 목표를 넘지 않는다. 박자보다 0.05초 먼저 출발해 박자에 닿는다.
  const S = (t, beat, w = 22) => {
    const x = t - beat + 0.05;
    return x <= 0 ? 0 : 1 - (1 + w * x) * Math.exp(-w * x);
  };
  const expIn = u => (u <= 0 ? 0 : u >= 1 ? 1 : Math.pow(2, 10 * u - 10));
  const expOut = u => (u <= 0 ? 0 : u >= 1 ? 1 : 1 - Math.pow(2, -10 * u));
  const expInOut = u => (u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5
    ? Math.pow(2, 20 * u - 10) / 2 : (2 - Math.pow(2, -20 * u + 10)) / 2);
  const span = (t, a, b) => clamp((t - a) / (b - a));
  const EI = (t, a, b) => expIn(span(t, a, b));
  const EO = (t, a, b) => expOut(span(t, a, b));
  const hash = n => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };

  /* ---------- 도형 ---------- */
  const path = (pts, o = {}) => ({ k: "path", pts, closed: false, c: "main", w: 3, ...o });
  const shape = (pts, o = {}) => path(pts, { closed: true, ...o });
  const hatch = (pts, o = {}) => ({ k: "hatch", pts, c: "accent", gap: 9, ang: -Math.PI / 4, prog: 1, w: 1.3, ...o });
  const text = (str, x, y, o = {}) => ({ k: "text", str, x, y, size: 20, weight: 700, track: 0.2, c: "main", align: "left", ...o });

  const hexPts = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => {
    const a = -Math.PI / 2 + i * Math.PI / 3;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  const circlePts = (cx, cy, r, n = 120) => Array.from({ length: n }, (_, i) => {
    const a = i / n * Math.PI * 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const rrectPts = (x, y, w, h, r) => {
    const out = [];
    const corners = [[x + w - r, y + r, -Math.PI / 2], [x + w - r, y + h - r, 0], [x + r, y + h - r, Math.PI / 2], [x + r, y + r, Math.PI]];
    for (const [cx, cy, a0] of corners) {
      for (let i = 0; i <= 4; i++) {
        const a = a0 + i / 4 * Math.PI / 2;
        out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
    }
    return out;
  };
  // 극좌표로 샘플링: 바닥(π/2)에서 시작해 시계 방향. 모양끼리 점 대 점으로 섞을 수 있다.
  const polar = (fn, cx, cy, n) => Array.from({ length: n }, (_, i) => {
    const a = Math.PI / 2 + i / n * Math.PI * 2;
    const r = fn(a);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  const regR = (n, r, a0) => a => {
    const seg = Math.PI * 2 / n;
    const d = (((a - a0) % seg) + seg) % seg;
    return r * Math.cos(Math.PI / n) / Math.cos(d - Math.PI / n);
  };
  const mix = (A, B, u) => A.map((p, i) => [lerp(p[0], B[i][0], u), lerp(p[1], B[i][1], u)]);

  function hull(points) {
    const p = points.map(q => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length > 1 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }

  /* ---------- 글자 ---------- */
  let metricCache = {};
  function metrics(str, weight) {
    const key = weight + "|" + str;
    if (metricCache[key]) return metricCache[key];
    ctx.save();
    ctx.font = `${weight} 100px ${FONT}`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    // 글자 i의 왼쪽 = (앞 i+1글자 폭) − (그 글자 폭): 커닝이 반영된다
    const xs = [];
    for (let i = 0; i < str.length; i++) xs.push(ctx.measureText(str.slice(0, i + 1)).width - ctx.measureText(str[i]).width);
    xs.push(ctx.measureText(str).width);
    const cap = ctx.measureText("H").actualBoundingBoxAscent || 71;
    ctx.restore();
    return (metricCache[key] = { xs, width: xs[str.length], cap: cap / 100 });
  }
  const fit = (str, maxW, maxCap) => {
    const m = metrics(str, 900);
    return Math.min(maxW / m.width * 100, maxCap / m.cap);
  };
  // 큰 글자: 한 글자씩 op로 만든다(글자별로 움직이기 위해). 기준선을 중심으로 sy만큼 눌린다.
  function bigWord(ops, str, size, base, o = {}) {
    const m = metrics(str, 900), sc = size / 100, x0 = CX - m.width * sc / 2;
    const sy = o.sy ?? 1;
    if (sy < 0.01) return;
    for (let i = 0; i < str.length; i++) {
      const e = o.each ? o.each(i) : {};
      ops.push({ k: "text", str: str[i], x: x0 + m.xs[i] * sc + (e.dx || 0), y: base + (e.dy || 0),
        size, weight: 900, track: 0, c: o.c || "main", big: true, sy, clip: o.clip });
    }
  }

  // 1·15마디 타이틀 배치
  function title() {
    const m = metrics("MATH", 900);
    const size = 600 / m.width * 100, capH = m.cap * size;
    const BY = CY + capH / 2, top = BY - capH;
    return { size, capH, BY, top, Y0: top - 44, FLAT: BY + 13 };
  }

  /* ---------- 마스코트 ---------- */
  function mascot(ops, x, footY, t, run, leanDeg) {
    const u = 0.95, a = leanDeg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const step = Math.sin(Math.PI * 2 * 3 * t);          // 초당 6걸음
    const bob = run ? -3 * Math.abs(step) : 0;
    const T = ([px, py]) => { const X = px * u, Y = py * u; return [x + X * ca - Y * sa, footY + X * sa + Y * ca]; };
    const tr = pts => pts.map(T);
    const body = rrectPts(-38, -87 + bob, 76, 54, 10);
    ops.push(hatch(tr(body), { gap: 13, c: "accent", w: 1.2 }));
    [-28, -12, 12, 28].forEach((lx, i) => {
      const lift = run ? 10 * Math.max(0, i % 2 ? -step : step) : 0;
      ops.push(shape(tr(rectPts(lx - 5.5, -33 + bob, lx + 5.5, -lift)), { w: 2.4 }));
    });
    ops.push(shape(tr(body), { w: 3 }));
    const my = -60 + bob;
    ops.push(shape(tr(rrectPts(-62, my - 8, 24, 16, 6)), { w: 2.4 }));
    // 오른팔 58° + 연필
    const ang = -58 * Math.PI / 180, d = [Math.cos(ang), Math.sin(ang)], n = [-d[1], d[0]];
    const p0 = [38, my];
    const at = (s, o) => [p0[0] + d[0] * s + n[0] * o, p0[1] + d[1] * s + n[1] * o];
    ops.push(shape(tr([at(0, -8), at(24, -8), at(24, 8), at(0, 8)]), { w: 2.4 }));
    const tip = at(24, 0), e = [Math.cos(-1.35), Math.sin(-1.35)], f = [-e[1], e[0]];
    const B = [tip[0] - e[0] * 8, tip[1] - e[1] * 8];
    const P = (s, o) => [B[0] + e[0] * s + f[0] * o, B[1] + e[1] * s + f[1] * o];
    ops.push(shape(tr([P(0, -3.5), P(36, -3.5), P(46, 0), P(36, 3.5), P(0, 3.5)]), { w: 2 }));
    ops.push({ k: "fill", pts: tr([P(41, -1.8), P(46, 0), P(41, 1.8)]), c: "main" });
    for (const ex of [-12, 12]) ops.push({ k: "fill", pts: tr(rrectPts(ex - 4, -71 + bob, 8, 14, 4)), c: "main" });
  }

  function smallLabels(ops, T, a, b, c, ry) {
    const type = (s, u) => s.slice(0, Math.round(s.length * u));
    ops.push(text(type("MATHEMATICS", a), CX, T.top - 14, { align: "center", size: 18, track: 0.3 }));
    ops.push(text(type("LABORATORY", b), CX, T.BY + 46, { align: "center", size: 18, track: 0.3 }));
    ops.push(text(type("LAB DIRECTOR", c), 586, ry - 12, { align: "right", size: 15, track: 0.18 }));
  }

  /* ---------- 1마디 DRAFT ---------- */
  function draft(t, ops) {
    const T = title();
    const ry = lerp(T.Y0, T.FLAT, EI(t, 0.31, 0.5));     // 레일이 떨어지며 글자를 누른다
    bigWord(ops, "MATH", T.size, T.BY, { sy: clamp((T.BY - ry) / T.capH) });
    ops.push(path([[CX - 320, ry], [CX + 320, ry]]));
    const k = 1 - span(t, 0, 0.3);
    smallLabels(ops, T, k, k, k, ry);
    const run = EI(t, -0.05, 0.6);
    if (run < 1) mascot(ops, 650 + 640 * run, ry, t, true, 7 * clamp(t / 0.12));
  }

  /* ---------- 1~2마디 레일과 KINETIC TYPE ---------- */
  function gap2(t) {
    let g = 150;
    g = lerp(g, 104, S(t, 2.5));
    g = lerp(g, 4, EI(t, 2.85, 3.0));          // 짝! 닫힘
    g += 126 * S(t, 3.05, 18);                  // 다시 열리며 DISCOVER를 늘려 뽑는다
    g = lerp(g, 150, S(t, 3.5));
    return lerp(g, 0, EI(t, 3.82, 4.0));        // 마지막에 눌러 한 줄로
  }

  function words(t, ops, top, bot, gap) {
    const clip = [-200, top, W + 200, bot];
    if (t < 2.6) {
      const size = fit("MOVE", 2 * HALF - 20, 116), capH = metrics("MOVE", 900).cap * size;
      bigWord(ops, "MOVE", size, CY + capH / 2, { clip, each: i => ({
        dy: (1 - S(t, 2.0 + 0.06 * i, 26)) * (capH + 40) - EI(t, 2.28 + 0.04 * i, 2.48 + 0.04 * i) * (capH + 100)
      }) });
    }
    if (t >= 2.45 && t < 3.0) {
      const size = fit("COMPARE", 2 * HALF - 20, 76), capH = metrics("COMPARE", 900).cap * size, sy = clamp(gap / 104);
      bigWord(ops, "COMPARE", size, CY + capH * sy / 2, { clip, sy, each: () => ({ dx: -900 * (1 - EO(t, 2.45, 2.65)) }) });
    }
    if (t >= 2.98 && t < 3.65) {
      const size = fit("DISCOVER", 2 * HALF - 20, 200), capH = metrics("DISCOVER", 900).cap * size;
      const sy = clamp((gap - 26) / capH, 0, 1.5);
      bigWord(ops, "DISCOVER", size, CY + capH * sy / 2, { clip, sy, each: i => {
        const d = Math.abs(i - 3.5) * 0.025;
        return { dx: Math.sign(i - 3.5) * 1000 * EI(t, 3.25 + d, 3.6 + d) };
      } });
    }
    if (t >= 3.45) {
      const size = fit("MATH", 2 * HALF - 40, 116), capH = metrics("MATH", 900).cap * size, sy = clamp(gap / 150);
      bigWord(ops, "MATH", size, CY + capH * sy / 2, { clip, sy, c: "accent", each: i => ({
        dy: -(1 - S(t, 3.5 + 0.05 * i, 28)) * (capH + 140)
      }) });
    }
  }

  function rails(t, ops) {
    const T = title();
    let mid = CY, half = HALF, gap;
    if (t < 2) {
      mid = lerp(T.FLAT, CY, S(t, 1.0));
      half = lerp(320, HALF, S(t, 1.0));
      gap = 70 * S(t, 1.05) + 80 * S(t, 1.5);
    } else gap = gap2(t);
    const top = mid - gap / 2, bot = mid + gap / 2;
    if (t >= 2) words(t, ops, top, bot, gap);
    ops.push(path([[CX - half, top], [CX + half, top]]));
    ops.push(path([[CX - half, bot], [CX + half, bot]]));

    // 파란 눈금 41개가 위 레일을 따라 쓸고 지나간다
    const sweep = span(t, 1.1, 1.45), crush = 1 - EI(t, 3.82, 4.0), segs = [];
    for (let i = 0; i <= 40 && i / 40 <= sweep; i++) {
      const len = (i % 5 === 0 ? 18 : 9) * S(t, 1.15 + 0.35 * i / 40, 30) * crush;
      const x = CX - half + i * (2 * half / 40);
      segs.push([x, top, x, top - len]);
    }
    ops.push({ k: "segs", segs, c: "accent", w: 2 });

    // 높이 치수선과 살아 있는 숫자
    const dd = S(t, 1.5);
    if (dd > 0.01 && t < 3.97) {
      const dx = CX + half + 24, h2 = gap / 2 * dd;
      ops.push(path([[dx, mid - h2], [dx, mid + h2]], { c: "accent", w: 2 }));
      for (const y of [top, bot]) ops.push(path([[CX + half + 6, y], [lerp(CX + half + 6, dx + 7, dd), y]], { c: "accent", w: 1.5 }));
      if (h2 > 10) {
        ops.push(path([[dx - 5, mid - h2 + 9], [dx, mid - h2], [dx + 5, mid - h2 + 9]], { c: "accent", w: 2 }));
        ops.push(path([[dx - 5, mid + h2 - 9], [dx, mid + h2], [dx + 5, mid + h2 - 9]], { c: "accent", w: 2 }));
      }
      ops.push(text(String(Math.round(gap * 2)), dx + 10, mid + 7, { c: "accent", size: 18, weight: 800, track: 0.04 }));
    }
  }

  /* ---------- 3마디 CURVE ---------- */
  function curve(t, ops) {
    const P0 = [CX - HALF, CY], P3 = [CX + HALF, CY];
    const hl = 180 * S(t, 4.1, 18) * (1 - S(t, 5.0));
    const swing = S(t, 4.5, 18);
    const wave = S(t, 5.0, 16), gather = S(t, 5.5, 18);
    const copies = t >= 4.45 && t < 5.95 ? 8 : 0;
    const bez = (a, u) => {
      const P1 = [P0[0] + hl * Math.cos(a), P0[1] - hl * Math.sin(a)];
      const P2 = [P3[0] - hl * Math.cos(a), P3[1] + hl * Math.sin(a)];
      const v = 1 - u;
      return [0, 1].map(k => v * v * v * P0[k] + 3 * v * v * u * P1[k] + 3 * v * u * u * P2[k] + u * u * u * P3[k]);
    };
    for (let j = copies; j >= 0; j--) {
      const deg = j === 0 ? 58 - 116 * swing : 58 - 116 * swing * (j / 9);
      const a = deg * Math.PI / 180, pts = [];
      for (let i = 0; i <= 64; i++) {
        const u = i / 64, b = bez(a, u);
        const amp = 38 * (1 - gather) * Math.pow(Math.sin(Math.PI * u), 0.6);
        const sy = CY + amp * Math.sin(Math.PI * 2 * 2.75 * u + j * 0.4 * (1 - gather) - (t - 5) * 7);
        pts.push([lerp(b[0], lerp(P0[0], P3[0], u), wave), lerp(b[1], sy, wave)]);
      }
      ops.push(path(pts, j === 0 ? { w: 3 } : { c: "accent", w: 1.8 }));
    }
    // 펜 툴 핸들
    if (hl > 2) {
      const a = (58 - 116 * swing) * Math.PI / 180;
      const P1 = [P0[0] + hl * Math.cos(a), P0[1] - hl * Math.sin(a)];
      const P2 = [P3[0] - hl * Math.cos(a), P3[1] + hl * Math.sin(a)];
      ops.push(path([P0, P1], { c: "accent", w: 1.5 }), path([P3, P2], { c: "accent", w: 1.5 }));
      for (const p of [P0, P3]) ops.push(shape(rectPts(p[0] - 6, p[1] - 6, p[0] + 6, p[1] + 6), { c: "accent", w: 2 }));
      for (const p of [P1, P2]) ops.push(shape(circlePts(p[0], p[1], 6, 16), { c: "accent", w: 2 }));
      ops.push(text("EASE", P1[0] + 12, P1[1] - (a > 0 ? 6 : -20), { c: "accent", size: 15, weight: 800 }));
    }
  }

  /* ---------- 4마디 MORPH ---------- */
  const R0 = 2 * HALF / (Math.PI * 2);
  function arcPts(e, n) {
    const k = e / R0, L = 2 * HALF, yTop = CY - R0 * e, out = [];
    for (let i = 0; i < n; i++) {
      const u = i / n;
      if (k < 1e-4) { out.push([CX - HALF + L * u, yTop]); continue; }
      const rho = 1 / k, th = -Math.PI / 2 + (u - 0.5) * L / rho;
      out.push([CX + rho * Math.cos(th), yTop + rho + rho * Math.sin(th)]);
    }
    return out;
  }
  function morphPts(t) {
    const N = 240, curl = S(t, 6.1, 12);
    let pts = arcPts(curl, N);
    const m0 = S(t, 6.3, 16), m1 = S(t, 6.5), m2 = S(t, 7.0), m3 = S(t, 7.5);
    pts = mix(pts, polar(() => 150, CX, CY, N), m0);          // 닫힌 원이 커진다
    pts = mix(pts, polar(regR(3, 178, -Math.PI / 2 + Math.PI * 2 / 3 * m1), CX, CY, N), m1);
    pts = mix(pts, polar(regR(4, 170, -Math.PI / 4), CX, CY, N), m2);
    pts = mix(pts, polar(regR(6, 165, -Math.PI / 2), CX, CY, N), m3);
    return { pts, closed: curl > 0.97 || t > 6.5 };
  }
  function morph(t, ops) {
    const { pts, closed } = morphPts(t);
    const hp = span(t, 6.6, 7.5), cp = span(t, 7.55, 7.95);
    if (hp > 0) ops.push(hatch(pts, { prog: hp, gap: 10 }));
    if (cp > 0) ops.push(hatch(pts, { prog: cp, gap: 10, ang: Math.PI / 4 }));
    ops.push(path(pts, { closed }));
  }

  /* ---------- 5마디 TILE ---------- */
  const HR = 52, SP = Math.sqrt(3) * HR * 1.08;
  const CELLS = (() => {
    const out = [[0, 0, 0]];
    for (const [q, r] of [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]]) out.push([q, r, 1]);
    for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) === 2) out.push([q, r, 2]);
    }
    return out.map(([q, r, ring], i) => ({ i, ring, x: SP * (q + r / 2), y: SP * Math.sqrt(3) / 2 * r }));
  })();
  const growR = t => HR + 1100 * EI(t, 9.55, 10.0);

  function tile(t, ops) {
    const rc = lerp(165, HR, S(t, 8.0));
    const sweep = lerp(-150, 950, span(t, 8.95, 9.5));
    for (const c of CELLS) {
      let x = 0, y = 0, r = rc;
      if (c.ring === 1) { const f = S(t, 8.05 + 0.03 * (c.i - 1)); x = c.x * f; y = c.y * f; r = HR; if (f < 0.01) continue; }
      if (c.ring === 2) { const f = S(t, 8.5 + 0.015 * (c.i - 7)); if (f < 0.01) continue; x = c.x * lerp(0.5, 1, f); y = c.y * lerp(0.5, 1, f); r = HR; }
      const pts = hexPts(CX + x, CY + y, r);
      const prog = clamp((sweep - (CX + x - r)) / (2 * r));
      if (c.ring === 0 && prog < 1) {
        ops.push(hatch(pts, { gap: 10, only: "paper" }), hatch(pts, { gap: 10, ang: Math.PI / 4, only: "paper" }));
      }
      if (prog >= 1) ops.push({ k: "fill", pts, c: "accent", only: "paper" });
      else if (prog > 0) ops.push(hatch(pts, { gap: 4, prog, only: "paper" }));
      ops.push(shape(pts, { only: "paper" }));
      ops.push(shape(hexPts(CX + c.x, CY + c.y, HR), { only: "blue", w: 3.5 }));
    }
    if (t >= 9.55) ops.push(shape(hexPts(CX, CY, growR(t)), { only: "paper", w: 3 }));
  }

  /* ---------- 6~8마디 정육면체 / 전개도 ---------- */
  const SZ = 112 / 1.633;
  function netParams(t) {
    if (t < 12.2) {
      const grow = S(t, 10.5);
      return {
        sz: lerp(HR, 112, grow) / 1.633, alpha: Math.PI / 2,
        ry: (45 - 90 * S(t, 11.0, 16) + 45 * S(t, 11.5)) * Math.PI / 180,
        rx: 35.264 * (1 - S(t, 11.5)) * Math.PI / 180,
        pers: S(t, 11.0), zs: 1 - S(t, 12.0, 40), ty: 0
      };
    }
    const back = S(t, 13.7, 18), open = S(t, 14.0, 12), front = 1 - S(t, 14.0);
    return { sz: SZ, alpha: Math.PI / 2 * (1 - open), rx: 0.32 * back * front, ry: -0.42 * back * front, pers: 1, zs: back, ty: -SZ * open };
  }
  function netFaces({ alpha, rx, ry, pers, zs, sz, ty }) {
    const ca = Math.cos(alpha), sa = Math.sin(alpha), c2 = Math.cos(2 * alpha), s2 = Math.sin(2 * alpha);
    const by = 1 + 2 * ca, bz = -1 + 2 * sa;
    const F = {
      front: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]],
      top: [[-1, -1 - 2 * ca, bz], [1, -1 - 2 * ca, bz], [1, -1, -1], [-1, -1, -1]],
      left: [[-1 - 2 * ca, -1, bz], [-1, -1, -1], [-1, 1, -1], [-1 - 2 * ca, 1, bz]],
      right: [[1, -1, -1], [1 + 2 * ca, -1, bz], [1 + 2 * ca, 1, bz], [1, 1, -1]],
      bottom: [[-1, 1, -1], [1, 1, -1], [1, by, bz], [-1, by, bz]],
      back: [[-1, by, bz], [1, by, bz], [1, by + 2 * c2, bz + 2 * s2], [-1, by + 2 * c2, bz + 2 * s2]]
    };
    const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
    const L = [-0.45, -0.7, -0.55], Ln = Math.hypot(...L);
    const out = {};
    for (const name in F) {
      const p3 = F[name].map(([x, y, z]) => {
        y += ty / sz; z *= zs;
        [x, z] = [x * cy + z * sy, -x * sy + z * cy];
        [y, z] = [y * cx - z * sx, y * sx + z * cx];
        return [x * sz, y * sz, z * sz];
      });
      const p = p3.map(([x, y, z]) => { const s = lerp(1, DIST / (DIST + z), pers); return [CX + x * s, CY + y * s]; });
      let area = 0;
      for (let i = 0; i < 4; i++) { const a = p[i], b = p[(i + 1) % 4]; area += a[0] * b[1] - b[0] * a[1]; }
      const u = p3[1].map((v, k) => v - p3[0][k]), v = p3[3].map((w, k) => w - p3[0][k]);
      const n = [-(u[1] * v[2] - u[2] * v[1]), -(u[2] * v[0] - u[0] * v[2]), -(u[0] * v[1] - u[1] * v[0])];
      const nl = Math.hypot(...n) || 1;
      out[name] = { p, vis: area > 1, lit: clamp((n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / nl / Ln) };
    }
    return out;
  }
  function drawNet(ops, faces, hatchOn) {
    const list = Object.values(faces);
    list.filter(f => !f.vis).forEach(f => ops.push(shape(f.p, { dash: true, w: 2 })));
    list.filter(f => f.vis).forEach(f => {
      if (hatchOn && f.lit < 0.5) ops.push(hatch(f.p, { c: "main", gap: 6 + f.lit * 8, w: 1 }));
      ops.push(shape(f.p, { w: 3.5 }));
    });
  }
  function isoCell(ops, cx, cy, r, p, hp) {
    const V = hexPts(cx, cy, r);
    if (hp > 0) ops.push(hatch([[cx, cy], V[1], V[2], V[3]], { c: "main", gap: 6, w: 1, prog: hp }));
    ops.push(shape(V, { w: 3.5 }));
    for (const i of [3, 5, 1]) ops.push(path([[cx, cy], [lerp(cx, V[i][0], p), lerp(cy, V[i][1], p)]], { w: 3.5 }));
    for (const i of [0, 2, 4]) ops.push(path([[cx, cy], [lerp(cx, V[i][0], p), lerp(cy, V[i][1], p)]], { w: 2, dash: true }));
  }
  function solid(t, ops) {
    const p = S(t, 10.0, 16), hp = span(t, 10.2, 10.5), rc = lerp(HR, 112, S(t, 10.5));
    for (const c of CELLS) {
      if (c.ring === 0) continue;
      const f = S(t, 10.5 + 0.012 * c.i, 16);
      if (f > 0.985) continue;
      isoCell(ops, CX + c.x * (1 - f), CY + c.y * (1 - f), lerp(HR, rc, f), p, hp);
    }
    if (t < 10.45) isoCell(ops, CX, CY, HR, p, hp);
    else drawNet(ops, netFaces(netParams(t)), true);
  }

  /* ---------- 7마디 GEAR ---------- */
  const gearR = (n, rp, ang, sc = 1) => a => {
    let u = ((a - ang) * n / (Math.PI * 2)) % 1;
    if (u < 0) u += 1;
    const dd = Math.min(Math.abs(u - 0.25), 1 - Math.abs(u - 0.25));
    const h = dd < 0.15 ? 8 : dd > 0.33 ? -9 : lerp(8, -9, (dd - 0.15) / 0.18);
    return (rp + h) * sc;
  };
  const squareR = h => a => h / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
  function gearBits(ops, cx, cy, rp, sc, name) {
    if (sc < 0.02) return;
    ops.push(shape(circlePts(cx, cy, rp * sc, 90), { dash: true, w: 1.6 }));
    ops.push(shape(circlePts(cx, cy, 16 * sc, 24), { w: 2.5 }), shape(circlePts(cx, cy, 6 * sc, 12), { w: 2 }));
    if (sc > 0.5) ops.push(text(name, cx, cy + 46 * sc, { c: "accent", size: 17, weight: 800, align: "center", track: 0.14 }));
  }
  function gear(t, ops) {
    const N = 480, g1 = S(t, 12.1, 18) * (1 - S(t, 13.5));
    let ang1 = 0;
    for (let k = 0; k < 5; k++) ang1 += Math.PI / 4 * S(t, 12.25 + 0.25 * k, 30);   // 8분음표마다 45°
    const G1 = gearR(16, 87, ang1), Sq = squareR(SZ);
    ops.push(shape(polar(a => lerp(Sq(a), G1(a), g1), CX, CY, N), { w: 3.5 }));
    gearBits(ops, CX, CY, 87, g1, "16T");
    const retract = 1 - EI(t, 13.45, 13.7);
    for (const [n, beatAt, deg, name] of [[10, 12.5, -40, "10T"], [12, 13.0, -140, "12T"]]) {
      const g = S(t, beatAt, 18) * retract;
      if (g < 0.01) continue;
      const rp = 87 * n / 16, b = deg * Math.PI / 180, dist = (87 + rp) * g;
      const cx = CX + Math.cos(b) * dist, cy = CY + Math.sin(b) * dist;
      const ang = b + Math.PI - (b - ang1) * 16 / n - Math.PI / n;
      ops.push(shape(polar(gearR(n, rp, ang, g), cx, cy, 300), { w: 3.5 }));
      gearBits(ops, cx, cy, rp, g, name);
    }
  }

  /* ---------- 8~10마디 전개도 → 패널 → 데이터 ---------- */
  function unfold(t, ops) {
    drawNet(ops, netFaces(netParams(t)), true);
  }

  const RECTS = {
    front: [222, 166, 740, 580], top: [60, 90, 740, 150], left: [60, 166, 206, 770],
    right: [490, 596, 740, 770], bottom: [222, 596, 474, 770], back: [60, 786, 740, 850]
  };
  const ORDER = ["front", "top", "left", "right", "bottom", "back"];
  const EXIT = { front: [1, 0], top: [0, -1], left: [-1, 0], right: [1, 0], bottom: [0, 1], back: [0, 1] };
  const CHART = { x0: 246, x1: 716, base: 556, maxH: 340, ring: [481, 373] };

  function dashboard(t, ops) {
    const faces = netFaces(netParams(t));
    const off = {};
    ORDER.forEach((name, i) => {
      const fi = S(t, 14.5 + 0.04 * i, 16), e = EI(t, 18.45 + 0.04 * i, 18.85 + 0.04 * i) * 900;
      off[name] = [EXIT[name][0] * e, EXIT[name][1] * e];
      const R = RECTS[name], [dx, dy] = off[name];
      ops.push(shape(mix(faces[name].p, rectPts(R[0] + dx, R[1] + dy, R[2] + dx, R[3] + dy), fi), { w: 3 }));
    });
    if (t < 14.95) return;
    const type = (s, a, b) => s.slice(0, Math.round(s.length * span(t, a, b)));

    // 머리띠
    {
      const [dx, dy] = off.top;
      ops.push(text(type("MATH LAB — MOTION REEL", 14.95, 15.35), 80 + dx, 128 + dy, { size: 18, weight: 800, track: 0.14 }));
      const sw = S(t, 15.1), sel = S(t, 16.5, 26);
      if (sw > 0.01) {
        const x0 = 560 + dx, y0 = 104 + dy;
        ops.push(hatch(rectPts(x0 + 58 * sel + 3, y0 + 3, x0 + 58 * sel + 55, y0 + 29), { gap: 4, w: 1 }));
        ops.push(shape(rectPts(x0, y0, x0 + 116 * sw, y0 + 32), { w: 2 }));
        if (sw > 0.9) {
          ops.push(text("BARS", x0 + 29, y0 + 21, { size: 12, weight: 800, track: 0.08, align: "center" }));
          ops.push(text("RING", x0 + 87, y0 + 21, { size: 12, weight: 800, track: 0.08, align: "center" }));
        }
        const lit = S(t, 17.9, 26), kx = lerp(700, 716, lit) + dx;
        ops.push(shape(rrectPts(688 + dx, 106 + dy, 40 * sw, 28, 12 * sw), { w: 2 }));
        ops.push(shape(circlePts(kx, 120 + dy, 8 * sw, 16), { w: 2 }));
        if (lit > 0.5) ops.push({ k: "fill", pts: circlePts(kx, 120 + dy, 8, 16), c: "accent" });
      }
    }
    // 옆 막대: 숫자가 굴러 올라간다
    {
      const [dx, dy] = off.left;
      [["120", "BPM"], ["60", "BEATS"], ["1800", "FRAMES"], ["0", "CUTS"]].forEach(([v, name], i) => {
        const y = 240 + i * 150 + dy, r = S(t, 15.5 + 0.06 * i, 12);
        const val = name === "CUTS" ? Math.round(9 * (1 - r)) : Math.round(+v * r);
        if (t >= 15.45) ops.push(text(String(val), 76 + dx, y, { size: 38, weight: 900, track: 0 }));
        ops.push(text(type(name, 15.0 + 0.05 * i, 15.3 + 0.05 * i), 78 + dx, y + 28, { size: 13, track: 0.2 }));
      });
    }
    // 차트: 막대 → 고리(RING)
    chart(t, ops);
    // 타일 두 개: 지금 마디, 지금 박자
    {
      const [dx, dy] = off.bottom, bar = Math.floor(t / 2) + 1;
      ops.push(text(type("BAR", 15.0, 15.2), 242 + dx, 628 + dy, { size: 13, track: 0.2 }));
      if (t >= 15.05) ops.push(text(String(bar).padStart(2, "0"), 240 + dx, 748 + dy, { size: 84, weight: 900, track: 0 }));
    }
    {
      const [dx, dy] = off.right, beat = Math.floor(t * 2) % 4;
      ops.push(text(type("BEAT", 15.0, 15.2), 510 + dx, 628 + dy, { size: 13, track: 0.2 }));
      for (let i = 0; i < 4; i++) {
        const g = S(t, 15.05 + 0.05 * i, 26);
        if (g < 0.01) continue;
        const x = 512 + i * 56 + dx, y = 680 + dy, s = 40 * g;
        const sq = rectPts(x, y, x + s, y + s);
        if (i === beat) ops.push({ k: "fill", pts: sq, c: "accent" });
        ops.push(shape(sq, { w: 2 }));
      }
    }
    // 타임라인: 마디 이름 15개, 키프레임 마름모, 재생 헤드
    {
      const [dx, dy] = off.back, x0 = 76 + dx, L = 648, y = 810 + dy, bar = Math.floor(t / 2);
      const shown = Math.round(15 * span(t, 15.0, 15.4));
      if (shown > 0) ops.push(path([[x0, y], [x0 + L * shown / 15, y]], { w: 1.5 }));
      for (let i = 0; i < shown; i++) {
        const x = x0 + (i + 0.5) * L / 15, d = [[x, y - 7], [x + 7, y], [x, y + 7], [x - 7, y]];
        if (i < bar) ops.push({ k: "fill", pts: d, c: "main" });
        ops.push(shape(d, { w: 1.6 }));
        ops.push(text(NAMES[i], x, y + 30, { size: 9, weight: 700, track: 0.06, align: "center" }));
      }
      const ph = S(t, 16.0, 20);
      if (ph > 0.01) {
        const x = x0 + L * t / LOOP, top = 790 + dy - (1 - ph) * 60;
        ops.push(path([[x, top], [x, top + 56]], { c: "accent", w: 3 }));
        ops.push({ k: "fill", pts: [[x - 7, top - 8], [x + 7, top - 8], [x, top + 2]], c: "accent" });
      }
    }
  }

  function chart(t, ops) {
    const { x0, x1, base, maxH } = CHART, slot = (x1 - x0) / 30, sec = Math.floor(t);
    const b = S(t, 16.5, 14), rr = Math.PI / 15 * (S(t, 17.0, 26) + S(t, 17.5, 26));
    const c = S(t, 18.55, 16);
    const C = [lerp(CHART.ring[0], CX, c), lerp(CHART.ring[1], CY, c)], r = lerp(70, 260, c), lenK = 1.1 * (1 - c);
    const tips = [];
    for (let i = 0; i < 30; i++) {
      const g = S(t, 15.0 + 0.012 * i, 18), h = BARS[i] / 100 * maxH * g;
      const x = x0 + i * slot + 2.5, w = slot - 5;
      const lin = [[x, base - h], [x + w, base - h], [x + w, base], [x, base]];
      const th = -Math.PI / 2 + Math.PI * 2 * (i + 0.5) / 30 + rr;
      const d = [Math.cos(th), Math.sin(th)], tg = [-d[1], d[0]], hw = Math.PI * 2 * r / 30 * 0.34;
      const len = BARS[i] * lenK * g, at = (rad, s) => [C[0] + d[0] * rad + tg[0] * s, C[1] + d[1] * rad + tg[1] * s];
      const rad = [at(r + len, -hw), at(r + len, hw), at(r, hw), at(r, -hw)];
      const q = mix(lin, rad, b);
      tips.push(mix([[x + w / 2, base - h]], [at(r + len, 0)], b)[0]);
      if (g < 0.01) continue;
      if (i === sec) ops.push({ k: "fill", pts: q, c: "accent" });
      else if (i < sec) ops.push(hatch(q, { c: "main", gap: 4, w: 1 }));
      ops.push(shape(q, { w: i === sec ? 2 : 1.6 }));
    }
    // 기준선이 원으로 휜다
    const basePts = [];
    for (let i = 0; i <= 60; i++) {
      const u = i / 60, th = -Math.PI / 2 + Math.PI * 2 * u + rr;
      basePts.push(mix([[lerp(x0, x1, u), base]], [[C[0] + r * Math.cos(th), C[1] + r * Math.sin(th)]], b)[0]);
    }
    ops.push(path(basePts, { w: 2.5, closed: b > 0.97 }));
    // 막대 꼭대기를 잇는 그래프 선
    const gp = span(t, 15.95, 16.45) * 29;
    if (gp > 0 && t < 18.9) {
      const pts = tips.slice(0, Math.floor(gp) + 1);
      const k = Math.floor(gp);
      if (k < 29) pts.push(mix([tips[k]], [tips[k + 1]], gp - k)[0]);
      ops.push(path(pts, { c: "accent", w: 2.5 }));
    }
  }

  function cursor(t, ops) {
    const p1 = S(t, 16.0, 10), p2 = S(t, 17.5, 14), p3 = EI(t, 18.45, 18.85);
    let x = lerp(880, 650, p1), y = lerp(920, 124, p1);
    x = lerp(x, 712, p2); y = lerp(y, 124, p2);
    x += 400 * p3; y -= 400 * p3;
    let sc = 1;
    for (const h of [16.5, 17.9]) sc -= 0.2 * EI(t, h - 0.1, h) * (1 - S(t, h + 0.02, 30));
    const pts = [[0, 0], [0, 30], [8, 23], [13, 34], [18, 32], [13, 21], [23, 21]].map(([a, b]) => [x + a * sc, y + b * sc]);
    ops.push({ k: "fill", pts, c: "accent" }, shape(pts, { w: 2 }));
  }

  /* ---------- 10~11마디 LIGHT / CHORD: 홈페이지의 곱셈 원 ---------- */
  function chords(t, ops) {
    const N = 120, R = 260;
    const k = lerp(2 + S(t, 20) + S(t, 20.5) + S(t, 21) + S(t, 21.5), 1, S(t, 22.0, 10));
    const pt = i => { const a = i / N * Math.PI * 2 - Math.PI / 2; return [CX + R * Math.cos(a), CY + R * Math.sin(a)]; };
    ops.push(shape(circlePts(CX, CY, R, 160), { w: 3 }));
    const cnt = Math.floor(N * EO(t, 18.95, 19.5)), segs = [];
    for (let i = 0; i < cnt; i++) segs.push([...pt(i), ...pt(i * k)]);
    ops.push({ k: "segs", segs, c: "main", w: 1.4 });
    if (t >= 19.45 && t < 22.3) {
      const li = ((t - 19.45) * 26) % N, a = pt(li), b = pt(li * k);
      ops.push({ k: "segs", segs: [[...a, ...b]], c: "accent", w: 3 }, { k: "dot", x: a[0], y: a[1], r: 7, c: "accent" });
    }
    const s = `i ↦ (${k.toFixed(2)} × i) mod 120`;
    const n = Math.round(s.length * span(t, 19.45, 19.8) * (1 - span(t, 22.2, 22.45)));
    ops.push(text(s.slice(0, n), CX, CY + R + 62, { align: "center", size: 20, weight: 600, track: 0.06 }));
  }

  /* ---------- 12~14마디 GLOBE / DRUM / FORM ---------- */
  function globe(t, ops) {
    const m = S(t, 24.0, 10), flat = S(t, 26.0, 16);
    const R = 260, Rc = 220, Hc = 170 * (1 - flat);
    const tilt = lerp(0.38 * S(t, 22.5, 10), 0.5, m) * (1 - flat);
    const open = S(t, 22.5, 14), spin = Math.max(0, t - 22.45) * 0.8;
    let press = 0;
    for (const h of [24.5, 25.0, 25.5]) press += EI(t, h - 0.12, h) * (1 - S(t, h + 0.02, 18));
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const P = (lam, v) => {
      const top = v <= -Math.PI / 2 + 1e-6 ? press * 14 * (1 - flat) : 0;
      const x = lerp(R * Math.cos(v) * Math.cos(lam), Rc * Math.cos(lam), m);
      const y = lerp(R * Math.sin(v), Hc * (2 * v / Math.PI), m) + top * m;
      const z = lerp(R * Math.cos(v) * Math.sin(lam), Rc * Math.sin(lam), m);
      return [CX + x, CY + y * ct - z * st, y * st + z * ct];
    };
    const visible = (lam, v, z) => (m < 0.5 ? z < 0 : v <= -Math.PI / 2 + 1e-6 || Math.sin(lam) < 0);
    const all = [];
    const runs = (pts) => {      // 보이는 부분은 실선, 가려진 부분은 점선
      let cur = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        if (pts[i].vis !== cur[0].vis) { cur.push(pts[i]); emit(cur); cur = [pts[i]]; } else cur.push(pts[i]);
      }
      emit(cur);
    };
    const emit = run => {
      if (run.length < 2) return;
      ops.push(path(run.map(p => [p[0], p[1]]), run[0].vis ? { w: 2 } : { w: 1.2, dash: true }));
    };
    for (let j = 0; j < 12; j++) {
      const lam = j * Math.PI / 6 * open + spin, pts = [];
      for (let i = 0; i <= 40; i++) {
        const v = -Math.PI / 2 + Math.PI * i / 40, p = P(lam, v);
        p.vis = visible(lam, v, p[2]); pts.push(p); all.push(p);
      }
      runs(pts);
    }
    [-Math.PI / 2, -Math.PI / 3, -Math.PI / 6, 0, Math.PI / 6, Math.PI / 3, Math.PI / 2].forEach((v, l) => {
      const g = S(t, 23.0 + 0.04 * l, 16);
      if (g < 0.01) return;
      const pts = [];
      for (let i = 0; i <= 72 * g; i++) {
        const lam = i / 72 * Math.PI * 2, p = P(lam, v);
        p.vis = visible(lam, v, p[2]); pts.push(p); all.push(p);
      }
      runs(pts);
    });
    // 북채가 칠 때마다 윗면에 퍼지는 고리
    for (const h of [24.5, 25.0, 25.5]) {
      const e = EO(t, h - 0.05, h + 0.4);
      if (e <= 0 || e >= 0.999) continue;
      const pts = [];
      for (let i = 0; i <= 60; i++) {
        const lam = i / 60 * Math.PI * 2, x = Rc * 0.95 * e * Math.cos(lam), z = Rc * 0.95 * e * Math.sin(lam);
        const y = -Hc + press * 14;
        pts.push([CX + x, CY + y * ct - z * st]);
      }
      ops.push(path(pts, { c: "accent", w: 2 }));
    }
    const outline = hull(all);
    const sp = span(t, 23.45, 23.85);
    if (sp > 0) {
      ops.push(hatch(outline, { prog: sp, c: "main", lit: (x, y) => {
        const nx = (x - CX) / R, ny = (y - CY) / R, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const ls = clamp(-0.45 * nx - 0.55 * ny + 0.7 * nz);
        const ld = clamp(0.6 - 0.5 * (x - CX) / Rc);
        return lerp(ls, ld, m) * (1 - flat);
      } }));
    }
    ops.push(shape(outline, { w: 3 }));
  }

  function flatLine(t, ops) {
    const T = title(), s = S(t, 26.5);
    const half = lerp(220, 320, s), y = lerp(CY, T.FLAT, s);
    ops.push(path([[CX - half, y], [CX + half, y]]));
    const sweep = span(t, 27.45, 27.75), back = 1 - EI(t, 27.8, 28.0), segs = [];
    for (let i = 0; i <= 40 && i / 40 <= sweep; i++) {
      const x = CX - half + i * (2 * half / 40), len = (i % 5 === 0 ? 18 : 9) * S(t, 27.5 + 0.3 * i / 40, 30) * back;
      segs.push([x, y, x, y - len]);
    }
    ops.push({ k: "segs", segs, c: "accent", w: 2 });
  }

  /* ---------- 15마디 END: 첫 프레임으로 돌아간다 ---------- */
  function finale(t, ops) {
    const T = title();
    const ry = lerp(T.FLAT, T.Y0, S(t, 28.0, 14));
    bigWord(ops, "MATH", T.size, T.BY, { sy: clamp((T.BY - ry) / T.capH) });
    ops.push(path([[CX - 320, ry], [CX + 320, ry]]));
    smallLabels(ops, T, span(t, 28.45, 28.8), span(t, 28.95, 29.3), span(t, 29.5, 29.85), ry);
    const s = S(t, 29.0, 9);
    if (t >= 28.95) mascot(ops, lerp(-140, 650, s), ry, t, 1 - s > 0.004, 7 * clamp((1 - s) * 6));
  }

  function corner(t, ops) {
    const b = Math.floor(t / 2), beat = Math.floor(t * 2) + 1;
    ops.push(text(`FIG. ${String(b + 1).padStart(2, "0")} — ${NAMES[b]}`, 60, 58));
    ops.push(text(`BEAT ${beat} / 60`, 740, H - 44, { align: "right" }));
  }

  function build(t) {
    const ops = [];
    if (t < 0.95) draft(t, ops);
    if (t >= 0.95 && t < 4) rails(t, ops);
    if (t >= 4 && t < 6) curve(t, ops);
    if (t >= 6 && t < 8) morph(t, ops);
    if (t >= 8 && t < 10) tile(t, ops);
    if (t >= 10 && t < 12.1) solid(t, ops);
    if (t >= 12.1 && t < 13.7) gear(t, ops);
    if (t >= 13.7 && t < 14.5) unfold(t, ops);
    if (t >= 14.5 && t < 19) dashboard(t, ops);
    if (t >= 15.95 && t < 18.9) cursor(t, ops);
    if (t >= 18.95 && t < 22.9) chords(t, ops);
    if (t >= 22.45 && t < 26.45) globe(t, ops);
    if (t >= 26.45 && t < 28) flatLine(t, ops);
    if (t >= 28) finale(t, ops);
    corner(t, ops);
    return ops;
  }

  /* ---------- 잉크 영역: 장면 전환은 모양이 덮거나 주사선이 지나간다 ---------- */
  const rectClip = (x0, y0, x1, y1) => g => g.rect(x0, y0, x1 - x0, y1 - y0);
  const hexClip = r => g => { hexPts(CX, CY, r).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  function regions(t) {
    if (t < 9.55) return { list: [{ ink: "paper" }] };
    if (t < 10) return { list: [{ ink: "paper" }, { ink: "blue", clip: hexClip(growR(t)) }] };
    if (t < 17.95) return { list: [{ ink: "blue" }] };
    if (t < 18.5) {
      const y = H * expInOut(span(t, 17.95, 18.5));
      return { list: [{ ink: "holo", clip: rectClip(0, 0, W, y) }, { ink: "blue", clip: rectClip(0, y, W, H) }], scan: y };
    }
    if (t < 26.95) return { list: [{ ink: "holo" }] };
    if (t < 27.5) {
      const y = H * (1 - expInOut(span(t, 26.95, 27.5)));
      return { list: [{ ink: "holo", clip: rectClip(0, 0, W, y) }, { ink: "paper", clip: rectClip(0, y, W, H) }], scan: y };
    }
    return { list: [{ ink: "paper" }] };
  }

  /* ---------- 렌더러 ---------- */
  let K = 1, PH = 0;
  const layer = document.createElement("canvas"), lg = layer.getContext("2d");
  const mask = document.createElement("canvas"), mg = mask.getContext("2d");
  const outline = document.createElement("canvas"), og = outline.getContext("2d");
  const BG = {}, HATCH = {};
  let TOOTH = null;

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
  function pencil(g, pts, closed, w, color, dash, seed) {
    const rs = resample(pts, closed, 5);
    if (rs.length < 2) return;
    g.strokeStyle = color; g.lineCap = "round"; g.lineJoin = "round";
    if (dash) g.setLineDash([10, 9]);
    for (const [lw, al, amp, sd] of [[w, 0.9, 1.3, 0], [w * 0.5, 0.4, 3, 7.7]]) {
      g.globalAlpha = al; g.lineWidth = lw; g.beginPath();
      rs.forEach(([x, y, nx, ny, s], i) => {
        const o = amp * (Math.sin(s * 0.021 + PH * 1.7 + seed + sd) + 0.5 * Math.sin(s * 0.063 + PH * 2.9 + seed * 2.3 + sd));
        i ? g.lineTo(x + nx * o, y + ny * o) : g.moveTo(x + nx * o, y + ny * o);
      });
      g.stroke();
    }
    g.globalAlpha = 1; g.setLineDash([]);
  }

  function bbox(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return [x0, y0, x1, y1];
  }
  // 빗금: 한 줄씩 그어진다(prog). 종이에서는 줄마다 조금씩 비틀린다.
  function hatchLines(g, op, color, wobble) {
    const [x0, y0, x1, y1] = bbox(op.pts);
    const d = [Math.cos(op.ang), Math.sin(op.ang)], n = [-d[1], d[0]];
    const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => x * n[0] + y * n[1]);
    const lo = Math.min(...corners), hi = Math.max(...corners), L = Math.hypot(x1 - x0, y1 - y0) + 4;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, mo = mx * n[0] + my * n[1];
    const start = Math.ceil(lo / op.gap) * op.gap, count = Math.floor((hi - start) / op.gap) + 1;
    const lim = Math.floor(count * op.prog);
    g.save(); trace(g, op.pts, true); g.clip();
    g.strokeStyle = color; g.lineWidth = op.w; g.globalAlpha = wobble ? 0.8 : 0.9; g.beginPath();
    for (let i = 0; i < lim; i++) {
      const o = start + i * op.gap, j = wobble ? (hash(i * 3.1 + PH) - 0.5) * 1.6 : 0;
      const cx = mx + n[0] * (o - mo + j), cy = my + n[1] * (o - mo + j);
      const tw = wobble ? (hash(i + PH * 5.3) - 0.5) * 0.03 : 0;
      g.moveTo(cx - d[0] * L - n[0] * L * tw, cy - d[1] * L - n[1] * L * tw);
      g.lineTo(cx + d[0] * L + n[0] * L * tw, cy + d[1] * L + n[1] * L * tw);
    }
    g.stroke(); g.restore();
  }
  // 홀로그램 채움: 8px 간격 주사선, 굵기가 밝기를 따른다.
  function scanLines(g, op, color) {
    const [x0, y0, x1, y1] = bbox(op.pts), rows = Math.ceil((y1 - y0) / 8) + 1, lim = Math.floor(rows * op.prog);
    const litFn = typeof op.lit === "function" ? op.lit : () => op.lit ?? 0.55;
    const buckets = Array.from({ length: 6 }, () => []);
    const ys = Math.floor(y0 / 8) * 8 + 4;
    for (let r = 0; r < lim; r++) {
      const y = ys + r * 8;
      for (let x = x0; x < x1; x += 14) buckets[Math.min(5, Math.floor(litFn(x + 7, y) * 6))].push([x, y]);
    }
    g.save(); trace(g, op.pts, true); g.clip(); g.strokeStyle = color;
    buckets.forEach((list, b) => {
      if (!list.length) return;
      g.lineWidth = 0.5 + b * 0.55; g.beginPath();
      for (const [x, y] of list) { g.moveTo(x, y); g.lineTo(x + 14.5, y); }
      g.stroke();
    });
    g.restore();
  }

  function drawText(g, op, color) {
    if (!op.str) return;
    g.save();
    if (op.clip) { g.beginPath(); g.rect(op.clip[0], op.clip[1], op.clip[2] - op.clip[0], op.clip[3] - op.clip[1]); g.clip(); }
    g.translate(op.x, op.y);
    if (op.sy !== undefined) g.scale(1, op.sy);
    g.font = `${op.weight} ${op.size}px ${FONT}`;
    if ("letterSpacing" in g) g.letterSpacing = `${(op.track || 0) * op.size}px`;
    g.textAlign = op.align || "left"; g.textBaseline = "alphabetic";
    g.fillStyle = color; g.fillText(op.str, 0, 0);
    g.restore();
  }

  function paperInk(ops) {
    const I = INKS.paper, col = c => I[c];
    lg.setTransform(1, 0, 0, 1, 0, 0); lg.clearRect(0, 0, layer.width, layer.height); lg.setTransform(K, 0, 0, K, 0, 0);
    // 큰 글자: 빗금을 글자 모양으로 오려 내고, 윤곽을 두 번 긋는다.
    for (const c of ["main", "accent"]) {
      const big = ops.filter(o => o.k === "text" && o.big && o.c === c);
      if (!big.length) continue;
      mg.setTransform(1, 0, 0, 1, 0, 0); mg.globalCompositeOperation = "source-over"; mg.clearRect(0, 0, mask.width, mask.height);
      mg.setTransform(K, 0, 0, K, 0, 0);
      big.forEach(o => drawText(mg, o, "#000"));
      mg.setTransform(1, 0, 0, 1, 0, 0); mg.globalCompositeOperation = "source-in";
      mg.drawImage(HATCH[c], (PH % 4) * 0.7 * K, 0);
      mg.globalCompositeOperation = "source-over";
      lg.save(); lg.setTransform(1, 0, 0, 1, 0, 0); lg.drawImage(mask, 0, 0); lg.restore();
      // 윤곽: 굵게 그은 뒤 글자 안쪽을 지운다(겹친 윤곽선이 글자 속에 비치지 않도록)
      og.setTransform(1, 0, 0, 1, 0, 0); og.clearRect(0, 0, outline.width, outline.height); og.setTransform(K, 0, 0, K, 0, 0);
      const glyph = (o, fn) => {
        og.save();
        if (o.clip) { og.beginPath(); og.rect(o.clip[0], o.clip[1], o.clip[2] - o.clip[0], o.clip[3] - o.clip[1]); og.clip(); }
        og.translate(o.x, o.y); og.scale(1, o.sy);
        og.font = `900 ${o.size}px ${FONT}`; og.strokeStyle = col(c); og.lineJoin = "round";
        fn(o); og.restore();
      };
      big.forEach(o => glyph(o, () => {
        og.globalAlpha = 0.9; og.lineWidth = 4.4; og.strokeText(o.str, 0, 0);
        og.globalAlpha = 0.4; og.lineWidth = 2.2; og.strokeText(o.str, 1.6 + (PH % 2) * 0.4, -1.2);
      }));
      og.globalCompositeOperation = "destination-out";
      big.forEach(o => glyph(o, () => og.fillText(o.str, 0, 0)));
      og.globalCompositeOperation = "source-over";
      lg.save(); lg.setTransform(1, 0, 0, 1, 0, 0); lg.drawImage(outline, 0, 0); lg.restore();
    }
    ops.forEach((o, idx) => {
      if (o.k === "path") pencil(lg, o.pts, o.closed, o.w, col(o.c), o.dash, idx * 0.37);
      else if (o.k === "hatch") hatchLines(lg, o, col(o.c), true);
      else if (o.k === "fill") { lg.globalAlpha = 0.9; lg.fillStyle = col(o.c); trace(lg, o.pts, true); lg.fill(); lg.globalAlpha = 1; }
      else if (o.k === "segs") o.segs.forEach((s, i) => pencil(lg, [[s[0], s[1]], [s[2], s[3]]], false, o.w, col(o.c), false, i));
      else if (o.k === "dot") { lg.fillStyle = col(o.c); lg.beginPath(); lg.arc(o.x, o.y, o.r, 0, Math.PI * 2); lg.fill(); }
      else if (o.k === "text" && !o.big) drawText(lg, o, col(o.c));
    });
    // 종이 결: 선에서 군데군데 흑연이 빠진다
    lg.setTransform(1, 0, 0, 1, 0, 0);
    lg.globalCompositeOperation = "destination-out"; lg.fillStyle = TOOTH; lg.fillRect(0, 0, layer.width, layer.height);
    lg.globalCompositeOperation = "source-over";
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = "multiply"; ctx.drawImage(layer, 0, 0); ctx.restore();
  }

  function cleanInk(name, ops) {
    const I = INKS[name], holo = name === "holo", g = ctx;
    g.lineCap = "round"; g.lineJoin = "round";
    const stroke = (c, w, dash) => {
      g.setLineDash(dash ? [12, 9] : []);
      g.strokeStyle = I[c]; g.lineWidth = w; g.stroke();
      if (holo && c === "main") { g.strokeStyle = "#FFFFFF"; g.lineWidth = w * 0.3; g.stroke(); }
      g.setLineDash([]);
    };
    for (const o of ops) {
      if (o.k === "path") { trace(g, o.pts, o.closed); stroke(o.c, o.dash ? o.w * 0.75 : o.w * (holo ? 1 : 1.12), o.dash); }
      else if (o.k === "segs") {
        g.beginPath();
        for (const s of o.segs) { g.moveTo(s[0], s[1]); g.lineTo(s[2], s[3]); }
        stroke(o.c, o.w);
      } else if (o.k === "hatch") {
        if (holo) scanLines(g, o, I[o.c]);
        else hatchLines(g, { ...o, w: Math.min(o.w, 1.2) }, I[o.c], false);
      } else if (o.k === "fill") {
        if (holo) scanLines(g, { ...o, prog: 1, lit: 1 }, I[o.c]);
        else { g.fillStyle = I[o.c]; trace(g, o.pts, true); g.fill(); }
      } else if (o.k === "dot") { g.fillStyle = I[o.c]; g.beginPath(); g.arc(o.x, o.y, o.r, 0, Math.PI * 2); g.fill(); }
      else if (o.k === "text") drawText(g, o, I[o.c]);
    }
  }

  function render(t) {
    PH = Math.floor(t * 8);
    const ops = build(t), reg = regions(t);
    for (const r of reg.list) {
      ctx.save();
      ctx.setTransform(K, 0, 0, K, 0, 0);
      if (r.clip) { ctx.beginPath(); r.clip(ctx); ctx.clip(); }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(BG[r.ink], 0, 0);
      ctx.setTransform(K, 0, 0, K, 0, 0);
      const list = ops.filter(o => !o.only || o.only === r.ink);
      if (r.ink === "paper") paperInk(list); else cleanInk(r.ink, list);
      ctx.restore();
    }
    if (reg.scan !== undefined) {   // 주사선 한 줄
      ctx.save(); ctx.setTransform(K, 0, 0, K, 0, 0);
      ctx.beginPath(); ctx.moveTo(0, reg.scan); ctx.lineTo(W, reg.scan);
      ctx.strokeStyle = INKS.holo.main; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
  }

  /* ---------- 배경·질감 준비 ---------- */
  function makeCanvas() {
    const c = document.createElement("canvas");
    c.width = canvas.width; c.height = canvas.height;
    return c;
  }
  function prepare() {
    const cw = canvas.width, ch = canvas.height;
    for (const name in INKS) {
      const c = makeCanvas(), g = c.getContext("2d"), I = INKS[name];
      g.fillStyle = I.bg; g.fillRect(0, 0, cw, ch);
      if (name === "paper") {
        const img = g.getImageData(0, 0, cw, ch), d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const v = (Math.random() - 0.5) * 16;
          d[i] += v; d[i + 1] += v; d[i + 2] += v * 0.9;
        }
        g.putImageData(img, 0, 0);
        g.setTransform(K, 0, 0, K, 0, 0); g.strokeStyle = "#16161A"; g.lineWidth = 0.6;
        for (let i = 0; i < 260; i++) {
          const x = Math.random() * W, y = Math.random() * H, a = Math.random() * Math.PI, l = 4 + Math.random() * 10;
          g.globalAlpha = 0.03 + Math.random() * 0.05;
          g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 2, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
        }
        g.globalAlpha = 1;
      }
      g.setTransform(K, 0, 0, K, 0, 0);
      for (let i = -12; i <= 12; i++) {
        const fifth = i % 5 === 0;
        g.strokeStyle = `rgba(${I.grid},${fifth ? 0.26 : 0.13})`; g.lineWidth = 1;
        const x = CX + i * 40, y = CY + i * 40;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
      }
      BG[name] = c;
    }
    for (const c of ["main", "accent"]) {
      const cv = makeCanvas(), g = cv.getContext("2d");
      g.setTransform(K, 0, 0, K, 0, 0); g.strokeStyle = INKS.paper[c]; g.lineWidth = 1.6; g.globalAlpha = 0.85; g.beginPath();
      for (let s = -H; s < W + 20; s += 6.5) {
        const j = (hash(s) - 0.5) * 1.4;
        g.moveTo(s + j, H + 10); g.lineTo(s + H * 0.5 + j * 2, H * 0.5 - 0); g.lineTo(s + H + 10 + j, -10);
      }
      g.stroke();
      HATCH[c] = cv;
    }
    const tooth = document.createElement("canvas");
    tooth.width = tooth.height = 128;
    const tg = tooth.getContext("2d"), img = tg.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i + 3] = Math.random() < 0.22 ? 60 + Math.random() * 150 : 0;
    }
    tg.putImageData(img, 0, 0);
    TOOTH = lg.createPattern(tooth, "repeat");
  }

  function resize() {
    const css = canvas.clientWidth || 400, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(css * dpr);
    if (cw === canvas.width) return;
    canvas.width = cw; canvas.height = Math.round(cw * H / W);
    layer.width = mask.width = outline.width = canvas.width; layer.height = mask.height = outline.height = canvas.height;
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
  if (document.fonts) {
    document.fonts.load(`900 100px Geist`).then(() => { metricCache = {}; if (still) render(0); }).catch(() => {});
  }
  function frame(now) {
    if (visible && seekT === null) render(((now - start) / 1000) % LOOP);
    requestAnimationFrame(frame);
  }
  if (still) render(0); else requestAnimationFrame(frame);

  // 확인용: heroReel.seek(12.3)로 특정 시각을 멈춰 볼 수 있다. seek(null)이면 다시 재생.
  window.heroReel = {
    seek(t) { seekT = t; if (t !== null) { resize(); render(((t % LOOP) + LOOP) % LOOP); } else start = performance.now(); }
  };
})();
