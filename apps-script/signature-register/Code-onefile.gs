/**
 * 협의회 등록부(서명부) 웹앱
 * - 참석자가 소속·직위·성명·계좌번호를 입력하고 캔버스에 서명
 * - 시트에 한 줄씩 기록되며, 서명은 셀 안 이미지로 바로 보임
 * - 한 파일 버전: 이 코드만 Code.gs에 붙여넣으면 됨 (Index.html 불필요)
 */

// ===== 설정 (회의마다 이 부분만 바꾸면 됩니다) =====
const CONFIG = {
  TITLE: '2026년 중등 수업-평가 현장 지원단 수학(고)팀 협의회 등록부',
  DATE: '2026.10.20.(화) 17:30~18:50',
  PLACE: '경북대학교사범대학부설고등학교 및 인근 회의실',
  CONTENT: '수업-평가 컨설팅 결과 공유 및 교수학습 및 평가 운영계획 성장나침반 개선 방향 수립',
  SHEET_ID: '1MPf44yIXbcQOkMUt3ifO78P519c5ZAKeb9DWsScegfQ', // 비워두면 이 스크립트가 붙은 시트 사용
  SHEET_NAME: '등록부',
  FOLDER_NAME: '협의회 서명 이미지', // 서명 원본 PNG 보관용 드라이브 폴더
};

const HEADERS = ['연번', '소속', '직위', '성명', '계좌번호', '서명', '등록시각'];
const COL = { NO: 1, ORG: 2, POS: 3, NAME: 4, ACCOUNT: 5, SIGN: 6, TIME: 7 };
const SIGN_ROW_HEIGHT = 60;

// ===== 웹앱 진입점 =====
function doGet() {
  const t = HtmlService.createTemplate(PAGE_HTML);
  t.config = CONFIG;
  return t.evaluate()
    .setTitle('협의회 등록부')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ===== 스프레드시트 메뉴 =====
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('등록부')
    .addItem('시트 초기 설정', 'setupSheet')
    .addToUi();
}

/** 제목·헤더·열 너비를 갖춘 등록부 시트를 만든다. 이미 있으면 서식만 정리한다. */
function setupSheet() {
  const sheet = getSheet_();
  sheet.getRange(1, 1, 1, HEADERS.length)
    .setValues([HEADERS])
    .setFontWeight('bold')
    .setBackground('#d9e1f2')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 32);

  const widths = [50, 170, 70, 90, 260, 170, 140];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  sheet.getRange('E:E').setNumberFormat('@'); // 계좌번호 앞자리 0 보존
  return '시트 설정 완료';
}

// ===== 웹앱에서 호출 =====
function submitSignature(form) {
  const data = validate_(form);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getSheet_();
    if (sheet.getLastRow() === 0) setupSheet();

    if (isDuplicate_(sheet, data.org, data.name)) {
      throw new Error(`${data.org} ${data.name} 선생님은 이미 등록되어 있습니다.`);
    }

    const row = sheet.getLastRow() + 1;
    const no = row - 1;
    const account = `(${data.bank}) ${data.account}`;
    const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

    sheet.getRange(row, COL.NO, 1, 5).setValues([[no, data.org, data.pos, data.name, account]]);
    sheet.getRange(row, COL.TIME).setValue(now);

    const file = saveSignatureFile_(data.signature, `${no}_${data.org}_${data.name}.png`);
    insertSignatureImage_(sheet.getRange(row, COL.SIGN), data.signature, file);

    sheet.setRowHeight(row, SIGN_ROW_HEIGHT);
    sheet.getRange(row, 1, 1, HEADERS.length)
      .setVerticalAlignment('middle')
      .setHorizontalAlignment('center');
    SpreadsheetApp.flush();

    return { ok: true, no: no, name: data.name };
  } finally {
    lock.releaseLock();
  }
}

// ===== 내부 함수 =====
function getSheet_() {
  const ss = CONFIG.SHEET_ID
    ? SpreadsheetApp.openById(CONFIG.SHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(CONFIG.SHEET_NAME) || ss.insertSheet(CONFIG.SHEET_NAME);
}

function validate_(form) {
  const s = v => String(v || '').trim();
  const data = {
    org: s(form.org),
    pos: s(form.pos),
    name: s(form.name),
    bank: s(form.bank),
    account: s(form.account),
    signature: s(form.signature),
  };
  if (!data.org) throw new Error('소속을 입력해 주세요.');
  if (!data.pos) throw new Error('직위를 입력해 주세요.');
  if (!data.name) throw new Error('성명을 입력해 주세요.');
  if (!data.bank) throw new Error('은행을 선택해 주세요.');
  if (!/^[0-9-]{6,30}$/.test(data.account)) throw new Error('계좌번호는 숫자와 - 만 입력해 주세요.');
  if (data.signature.indexOf('data:image/png;base64,') !== 0) throw new Error('서명을 해 주세요.');
  return data;
}

function isDuplicate_(sheet, org, name) {
  const last = sheet.getLastRow();
  if (last < 2) return false;
  return sheet.getRange(2, COL.ORG, last - 1, 3).getValues()
    .some(r => String(r[0]).trim() === org && String(r[2]).trim() === name);
}

function saveSignatureFile_(dataUrl, fileName) {
  const bytes = Utilities.base64Decode(dataUrl.split(',')[1]);
  const blob = Utilities.newBlob(bytes, 'image/png', fileName);
  return getFolder_().createFile(blob);
}

function getFolder_() {
  const it = DriveApp.getFoldersByName(CONFIG.FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.FOLDER_NAME);
}

/**
 * 셀 안 이미지(CellImage)로 서명을 넣는다.
 * 실패하면 드라이브 파일을 링크 공개 후 IMAGE() 수식으로 대신 표시한다.
 */
function insertSignatureImage_(cell, dataUrl, file) {
  try {
    const image = SpreadsheetApp.newCellImage()
      .setSourceUrl(dataUrl)
      .setAltTextTitle('서명')
      .build();
    cell.setValue(image);
  } catch (e) {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    cell.setFormula(`=IMAGE("https://drive.google.com/thumbnail?id=${file.getId()}&sz=w400")`);
  }
}

// ===== 웹앱 화면 (HTML) =====
const PAGE_HTML = String.raw`<!DOCTYPE html>
<html lang="ko">
<head>
  <base target="_top">
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Pretendard', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
      background: #f3f5f9;
      color: #1f2937;
    }
    .wrap { max-width: 560px; margin: 0 auto; padding: 20px 16px 40px; }
    .title-bar {
      border-top: 4px solid #2f4fa8;
      border-bottom: 4px solid #e8a35c;
      background: #fff;
      padding: 16px 14px;
      text-align: center;
      border-radius: 6px;
    }
    .title-bar h1 { margin: 0; font-size: 1.15rem; line-height: 1.5; word-break: keep-all; }
    .info { background: #fff; margin-top: 12px; padding: 12px 14px; border-radius: 6px; font-size: 0.92rem; line-height: 1.7; }
    .info div { display: flex; }
    .info b { flex: 0 0 44px; }
    form { background: #fff; margin-top: 12px; padding: 16px 14px; border-radius: 6px; }
    label { display: block; font-weight: 600; font-size: 0.92rem; margin: 14px 0 6px; }
    label:first-child { margin-top: 0; }
    input, select {
      width: 100%; padding: 11px 12px; font-size: 1rem;
      border: 1px solid #c9d1df; border-radius: 6px; background: #fff;
    }
    input:focus, select:focus { outline: 2px solid #2f4fa8; border-color: transparent; }
    .row { display: flex; gap: 8px; }
    .row > :first-child { flex: 0 0 38%; }
    .row > :last-child { flex: 1; }
    .sig-box { position: relative; border: 2px dashed #9aa8c2; border-radius: 6px; background: #fff; }
    canvas { display: block; width: 100%; height: 180px; touch-action: none; cursor: crosshair; }
    .sig-hint {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      color: #a0aabb; pointer-events: none; font-size: 0.95rem;
    }
    .sig-tools { display: flex; justify-content: flex-end; margin-top: 6px; }
    .btn-clear { border: 1px solid #c9d1df; background: #fff; padding: 6px 12px; border-radius: 6px; font-size: 0.85rem; cursor: pointer; }
    .btn-submit {
      width: 100%; margin-top: 18px; padding: 14px; font-size: 1.05rem; font-weight: 700;
      color: #fff; background: #2f4fa8; border: 0; border-radius: 8px; cursor: pointer;
    }
    .btn-submit:disabled { background: #94a3c4; cursor: wait; }
    .msg { margin-top: 12px; padding: 12px; border-radius: 6px; font-size: 0.95rem; display: none; }
    .msg.err { display: block; background: #fdecec; color: #b42318; }
    .done { display: none; background: #fff; margin-top: 12px; padding: 32px 16px; border-radius: 6px; text-align: center; }
    .done h2 { margin: 0 0 8px; color: #2f4fa8; }
    .done button { margin-top: 16px; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="title-bar"><h1><?= config.TITLE ?></h1></div>
  <div class="info">
    <div><b>일시</b><?= config.DATE ?></div>
    <div><b>장소</b><?= config.PLACE ?></div>
    <div><b>내용</b><?= config.CONTENT ?></div>
  </div>

  <form id="form" autocomplete="off">
    <label for="org">소속</label>
    <input id="org" name="org" placeholder="예) 경북대사대부고" required>

    <label for="pos">직위</label>
    <input id="pos" name="pos" value="교사" required>

    <label for="name">성명</label>
    <input id="name" name="name" required>

    <label for="bank">계좌번호</label>
    <div class="row">
      <select id="bank" name="bank" required>
        <option value="">은행 선택</option>
        <option>농협</option>
        <option>iM뱅크</option>
        <option>국민은행</option>
        <option>신한은행</option>
        <option>우리은행</option>
        <option>하나은행</option>
        <option>기업은행</option>
        <option>SC제일은행</option>
        <option>카카오뱅크</option>
        <option>토스뱅크</option>
        <option>케이뱅크</option>
        <option>우체국</option>
        <option>새마을금고</option>
        <option>신협</option>
        <option>수협</option>
        <option value="__etc">기타(직접 입력)</option>
      </select>
      <input id="account" name="account" inputmode="numeric" placeholder="숫자와 - 만 입력" required>
    </div>
    <input id="bankEtc" placeholder="은행명 입력" style="display:none; margin-top:8px;">

    <label>서명</label>
    <div class="sig-box">
      <canvas id="pad"></canvas>
      <div class="sig-hint" id="hint">이곳에 서명해 주세요</div>
    </div>
    <div class="sig-tools"><button type="button" class="btn-clear" id="clear">지우기</button></div>

    <button type="submit" class="btn-submit" id="submit">등록하기</button>
    <div class="msg" id="msg"></div>
  </form>

  <div class="done" id="done">
    <h2>등록 완료</h2>
    <p id="doneText"></p>
    <button type="button" class="btn-clear" id="again">다른 분 등록하기</button>
  </div>
</div>

<script>
  // ---------- 서명 패드 ----------
  const pad = document.getElementById('pad');
  const ctx = pad.getContext('2d');
  const hint = document.getElementById('hint');
  let drawing = false, hasInk = false, last = null;

  function resizePad() {
    const ratio = window.devicePixelRatio || 1;
    const rect = pad.getBoundingClientRect();
    pad.width = rect.width * ratio;
    pad.height = rect.height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
    clearPad();
  }

  function clearPad() {
    ctx.clearRect(0, 0, pad.width, pad.height);
    hasInk = false;
    hint.style.display = 'flex';
  }

  function point(e) {
    const r = pad.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  pad.addEventListener('pointerdown', e => {
    e.preventDefault();
    pad.setPointerCapture(e.pointerId);
    drawing = true;
    last = point(e);
    ctx.beginPath();
    ctx.arc(last.x, last.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    hasInk = true;
    hint.style.display = 'none';
  });
  pad.addEventListener('pointermove', e => {
    if (!drawing) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
    pad.addEventListener(ev, () => { drawing = false; }));

  document.getElementById('clear').addEventListener('click', clearPad);
  window.addEventListener('resize', () => { if (!hasInk) resizePad(); });
  resizePad();

  /** 시트 셀에 맞게 흰 배경 + 400x160 크기로 줄인 PNG */
  function exportSignature() {
    const out = document.createElement('canvas');
    out.width = 400; out.height = 160;
    const o = out.getContext('2d');
    o.fillStyle = '#fff';
    o.fillRect(0, 0, out.width, out.height);
    o.drawImage(pad, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }

  // ---------- 은행 기타 ----------
  const bank = document.getElementById('bank');
  const bankEtc = document.getElementById('bankEtc');
  bank.addEventListener('change', () => {
    bankEtc.style.display = bank.value === '__etc' ? 'block' : 'none';
  });

  // ---------- 제출 ----------
  const form = document.getElementById('form');
  const msg = document.getElementById('msg');
  const submitBtn = document.getElementById('submit');

  function showError(text) {
    msg.textContent = text;
    msg.className = 'msg err';
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    msg.className = 'msg';

    const bankName = bank.value === '__etc' ? bankEtc.value.trim() : bank.value;
    if (!bankName) return showError('은행을 선택(또는 입력)해 주세요.');
    if (!hasInk) return showError('서명을 해 주세요.');

    const payload = {
      org: document.getElementById('org').value,
      pos: document.getElementById('pos').value,
      name: document.getElementById('name').value,
      bank: bankName,
      account: document.getElementById('account').value.replace(/\s/g, ''),
      signature: exportSignature(),
    };

    submitBtn.disabled = true;
    submitBtn.textContent = '등록 중...';
    google.script.run
      .withSuccessHandler(res => {
        form.style.display = 'none';
        document.getElementById('doneText').textContent =
          res.no + '번 ' + res.name + ' 선생님, 등록되었습니다. 감사합니다.';
        document.getElementById('done').style.display = 'block';
        resetButton();
      })
      .withFailureHandler(err => {
        showError(err.message || String(err));
        resetButton();
      })
      .submitSignature(payload);
  });

  function resetButton() {
    submitBtn.disabled = false;
    submitBtn.textContent = '등록하기';
  }

  document.getElementById('again').addEventListener('click', () => {
    form.reset();
    bankEtc.style.display = 'none';
    document.getElementById('done').style.display = 'none';
    form.style.display = 'block';
    resizePad();
    window.scrollTo(0, 0);
  });
</script>
</body>
</html>
`;
