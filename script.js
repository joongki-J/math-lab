// =========================
// 중기쌤의 수학 실험실
// 도구 목록만 이 파일에서 관리하면 됩니다.
// =========================

const TOOLS = [
  {
    title: "경사하강법 시각화 — y = ax",
    subject: "인공지능 수학",
    symbol: "∇",
    description: "산점도와 손실함수를 통해 경사하강법이 최적의 기울기 \(a\)를 찾는 과정을 시각적으로 탐구합니다.",
    tags: ["경사하강법", "MSE", "최적화"],
    url: "./gradient-descent-1/"
  },
  {
    title: "경사하강법 시각화 — y = ax + b",
    subject: "인공지능 수학",
    symbol: "∇",
    description: "산점도·추세선·3차원 손실곡면과 학습 경로를 한 화면에서 관찰하며 경사하강법의 원리를 탐구합니다.",
    tags: ["경사하강법", "MSE", "최적화"],
    url: "./gradient-descent-2/"
  },
  {
    title: "시어핀스키 삼각형 탐구",
    subject: "미적분Ⅱ",
    symbol: "△",
    description: "반복 규칙이 만들어내는 프랙탈 구조와 자기유사성을 탐구합니다.",
    tags: ["프랙탈", "반복", "도형"],
    url: "./sierpinski/"
  },
  {
    title: "몬테카를로 원주율 실험",
    subject: "확률과 통계",
    symbol: "π",
    description: "무작위 점의 비율로 원주율을 추정하며 시행 횟수의 힘을 확인합니다.",
    tags: ["확률", "원주율", "모의실험"],
    url: "./monte-carlo/"
  },
  {
    title: "퍼셉트론 시뮬레이터",
    subject: "인공지능 수학",
    symbol: "Σ",
    description: "AND·OR·NAND 논리 연산으로 인공신경망의 기본 원리를 다룹니다.",
    tags: ["퍼셉트론", "신경망", "논리연산"],
    url: "./perceptron/"
  }
];

const SUBJECT_GROUPS = [
  { label: "중학교", items: ["수학1", "수학2", "수학3"] },
  { label: "고등 공통", items: ["공통수학1", "공통수학2"] },
  { label: "고등 선택", items: ["대수", "미적분Ⅰ", "미적분Ⅱ", "확률과 통계", "기하", "인공지능 수학", "경제 수학", "수학과제 탐구"] },
  { label: "기타", items: ["업무"] }
];

const TINTS = ["#d9f24f", "#bfe0ff", "#ffd0c4", "#cfe9d8", "#e0d6ff", "#ffe9a8"];

const els = {
  grid: document.querySelector("#toolsGrid"),
  search: document.querySelector("#searchInput"),
  reset: document.querySelector("#resetBtn"),
  groups: document.querySelector("#subjectGroups"),
  count: document.querySelector("#toolCount"),
  filteredCount: document.querySelector("#filteredCount"),
  subjectCount: document.querySelector("#subjectCount"),
  empty: document.querySelector("#emptyMessage"),
  modal: document.querySelector("#qrModal"),
  qrTitle: document.querySelector("#qrTitle"),
  qrCode: document.querySelector("#qrCode"),
  qrUrl: document.querySelector("#qrUrl"),
  copyBtn: document.querySelector("#copyUrlBtn")
};

let selectedSubject = "전체";
let currentQrUrl = "";

/* ---------- 과목 필터 ---------- */

function initializeSubjects() {
  const rows = [
    { label: "전체", items: ["전체"] },
    ...SUBJECT_GROUPS
  ];

  for (const row of rows) {
    const rowEl = document.createElement("div");
    rowEl.className = "subject-row";

    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = row.label;

    const chips = document.createElement("div");
    chips.className = "row-chips";
    for (const subject of row.items) chips.appendChild(createSubjectChip(subject));

    rowEl.append(label, chips);
    els.groups.appendChild(rowEl);
  }

  els.subjectCount.textContent = SUBJECT_GROUPS.flatMap(g => g.items).length;
}

function createSubjectChip(subject) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "subject-chip";
  button.dataset.subject = subject;
  button.innerHTML = `${escapeHtml(subject)}<span class="chip-count">0</span>`;
  button.addEventListener("click", () => setSubject(subject));
  return button;
}

function setSubject(subject) {
  selectedSubject = subject;
  renderTools();
}

function matchesQuery(tool, query) {
  return [tool.title, tool.subject, tool.description, ...tool.tags]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function updateChips(query) {
  const byQuery = TOOLS.filter(tool => matchesQuery(tool, query));

  document.querySelectorAll(".subject-chip").forEach(chip => {
    const subject = chip.dataset.subject;
    const count = subject === "전체"
      ? byQuery.length
      : byQuery.filter(tool => tool.subject === subject).length;

    chip.querySelector(".chip-count").textContent = count;
    chip.classList.toggle("has-items", count > 0);
    chip.classList.toggle("active", subject === selectedSubject);
  });
}
/* ---------- 썸네일 자동 매칭 ---------- */

function toolFolderName(tool) {
  return tool.url
    .replace(/^\.?\//, "")
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean)
    .pop();
}

function setupAutoThumbnail(card, tool) {
  const img = card.querySelector(".card-thumb");
  const placeholder = card.querySelector(".media-placeholder");

  const folder = toolFolderName(tool);
  const extensions = ["jpg", "png", "jpeg", "webp"];
  let index = 0;

  function tryNext() {
    if (index >= extensions.length) {
      img.style.display = "none";
      placeholder.style.display = "";
      return;
    }

    img.src = `./thumbnails/${folder}.${extensions[index++]}`;
  }

  img.addEventListener("load", () => {
    img.style.display = "block";
    placeholder.style.display = "none";
  });

  img.addEventListener("error", tryNext);

  tryNext();
}

/* ---------- 카드 ---------- */

function renderTools() {
  const query = els.search.value.trim().toLowerCase();
  const tools = TOOLS.filter(tool =>
    (selectedSubject === "전체" || tool.subject === selectedSubject) &&
    matchesQuery(tool, query)
  );

  updateChips(query);

  els.grid.innerHTML = "";
  els.filteredCount.textContent = tools.length;
  els.empty.hidden = tools.length > 0;

  tools.forEach((tool, index) => {
    const card = document.createElement("article");
    card.className = "tool-card";
    card.style.setProperty("--card-tint", TINTS[index % TINTS.length]);

    card.innerHTML = `
      <div class="card-media">
  <img
    class="card-thumb"
    alt="${escapeHtml(tool.title)} 썸네일"
    style="position:absolute; inset:0; width:100%; height:100%;
           object-fit:cover; display:none; z-index:0;"
  >

  <span class="card-num" style="z-index:2">
    ${String(index + 1).padStart(2, "0")}
  </span>

  <div class="media-placeholder"
       style="position:relative; z-index:1;
              display:grid; place-items:center; gap:10px;">

    <svg viewBox="0 0 24 24" width="30" height="30" fill="none"
         stroke="rgba(21,23,26,.62)" stroke-width="1.6"
         stroke-linecap="round" stroke-linejoin="round"
         aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5"></rect>
      <circle cx="8.6" cy="9.6" r="1.5"></circle>
      <path d="M4 17l4.8-4.6 3.4 3.2 3-2.6L20 17"></path>
    </svg>

    <span class="media-label">
      ${escapeHtml(tool.title)} 화면 캡처
    </span>
  </div>
</div>
      <div class="card-body">
        <span class="subject-label">${escapeHtml(tool.subject)}</span>
        <h3>${escapeHtml(tool.title)}</h3>
        <p>${escapeHtml(tool.description)}</p>
        <div class="card-actions">
          <a class="open-tool" href="${tool.url}">도구 열기 ↗</a>
          <button class="qr-tool" type="button" aria-label="${escapeHtml(tool.title)} QR 열기">
            <span class="qr-glyph" aria-hidden="true">
              <i class="on"></i><i class="on"></i><i></i>
              <i class="on"></i><i></i><i class="on"></i>
              <i></i><i class="on"></i><i class="on"></i>
            </span>
          </button>
        </div>
      </div>
    `;
setupAutoThumbnail(card, tool);
    card.querySelector(".qr-tool").addEventListener("click", () => {
      openQr(tool.title, new URL(tool.url, window.location.href).href);
    });

    els.grid.appendChild(card);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------- QR ---------- */

function openQr(title, url) {
  currentQrUrl = url;
  els.qrTitle.textContent = title;
  els.qrUrl.textContent = url;
  els.qrCode.innerHTML = "";

  if (window.QRCode) {
    new QRCode(els.qrCode, { text: url, width: 190, height: 190, correctLevel: QRCode.CorrectLevel.M });
  } else {
    els.qrCode.textContent = "QR 라이브러리를 불러오지 못했습니다.";
  }

  els.modal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeQr() {
  els.modal.hidden = true;
  document.body.style.overflow = "";
}

async function copyQrUrl() {
  if (!currentQrUrl) return;

  try {
    await navigator.clipboard.writeText(currentQrUrl);
    const oldText = els.copyBtn.textContent;
    els.copyBtn.textContent = "복사됨";
    setTimeout(() => (els.copyBtn.textContent = oldText), 1200);
  } catch {
    window.prompt("주소를 복사하세요.", currentQrUrl);
  }
}

/* ---------- 히어로 곡선 애니메이션 ---------- */

function initCurveAnimation() {
  const chords = document.querySelector("#curveChords");
  const lead = document.querySelector("#curveLead");
  const dot = document.querySelector("#curveDot");
  const kLabel = document.querySelector("#curveK");

  const N = 240;
  const R = 184;
  const CX = 210;
  const CY = 210;

  function point(index) {
    const theta = (index / N) * Math.PI * 2 - Math.PI / 2;
    return [CX + R * Math.cos(theta), CY + R * Math.sin(theta)];
  }

  const start = performance.now();

  function tick(now) {
    const t = (now - start) / 1000;
    const k = 2 + ((t * 0.16) % 8);

    let path = "";
    for (let i = 0; i < N; i++) {
      const a = point(i);
      const b = point(i * k);
      path += `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
    }
    chords.setAttribute("d", path);

    const leadIndex = (t * 26) % N;
    const a = point(leadIndex);
    const b = point(leadIndex * k);
    lead.setAttribute("d", `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`);

    dot.setAttribute("cx", a[0].toFixed(1));
    dot.setAttribute("cy", a[1].toFixed(1));
    kLabel.textContent = k.toFixed(2);

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

/* ---------- 이벤트 ---------- */

els.search.addEventListener("input", renderTools);

els.reset.addEventListener("click", () => {
  els.search.value = "";
  setSubject("전체");
});

document.querySelector("#siteQrBtn").addEventListener("click", () => {
  openQr("중기쌤의 수학 실험실", window.location.href.split("#")[0]);
});

document.querySelectorAll("[data-close-modal]").forEach(element => {
  element.addEventListener("click", closeQr);
});

els.copyBtn.addEventListener("click", copyQrUrl);

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !els.modal.hidden) closeQr();
});

initializeSubjects();
els.count.textContent = TOOLS.length;
renderTools();
initCurveAnimation();
