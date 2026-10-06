/**
 * 모니터링 검토 웹앱 (모바일용)
 *
 * 시트 구조 (NEW모니터링 양식)
 *   1행 : 헤더  ─ D1·E1·F1 에 A)/B)/C) 수준의 일반 설명
 *   A열 : 단계          (병합/빈칸이면 위 값을 이어받음)
 *   B열 : 설계요소      (병합/빈칸이면 위 값을 이어받음)
 *   C열 : 검토 문항     ─ 한 문항 = 웹앱 한 페이지
 *   D·E·F열 : 문항별 A/B/C 추가설명 (중 하나를 선택)
 *   G열 : 검토 결과     ─ 선택한 A/B/C 가 기록됨
 *   H열 : 검토 노트(의견 메모용)
 *   'OO 종합의견' 행 : C열(병합) 종합의견, H열 메모 → 마지막 페이지에서 편집
 */

const CONFIG = {
  // 스프레드시트에 바인딩된 스크립트면 비워 두세요. 독립 스크립트면 시트 ID 입력.
  SPREADSHEET_ID: '',
  SHEET_NAME: 'NEW모니터링 양식',
  HEADER_ROW: 1,
  COL: { STAGE: 1, ELEMENT: 2, QUESTION: 3, OPT_A: 4, OPT_B: 5, OPT_C: 6, RESULT: 7, NOTE: 8 },
  PENDING: '검토중', // 선택 해제 시 기록되는 값 (G열 데이터 확인 목록과 동일)
  CHOICES: ['A', 'B', 'C']
};

const QUESTION_PATTERN = /^\s*\d+\s*\)/; // "1) ...", "12) ..." 형태만 문항으로 인식

function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('모니터링 검토')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** 시트를 열 때 메뉴에서 웹앱 주소를 확인할 수 있게 함 (바인딩 스크립트 전용) */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('모니터링 웹앱')
    .addItem('웹앱 주소 보기', 'showWebAppUrl_')
    .addToUi();
}

function showWebAppUrl_() {
  const url = ScriptApp.getService().getUrl();
  SpreadsheetApp.getUi().alert(url ? '웹앱 주소:\n' + url : '아직 배포되지 않았습니다. [배포 > 새 배포]에서 웹 앱으로 배포하세요.');
}

function getSheet_() {
  const ss = CONFIG.SPREADSHEET_ID
    ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(CONFIG.SHEET_NAME) || ss.getSheets()[0];
}

function str_(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

/** "A) 설명\n이어짐" → { key: 'A', text: '설명 이어짐' } */
function parseHeader_(raw, fallbackKey) {
  const s = str_(raw).replace(/\s*\n\s*/g, ' ');
  const m = s.match(/^([ABC])\s*\)\s*(.*)$/);
  return m ? { key: m[1], text: m[2] } : { key: fallbackKey, text: s };
}

function normalizeResult_(v) {
  const s = str_(v).toUpperCase();
  return CONFIG.CHOICES.indexOf(s) >= 0 ? s : '';
}

/** 웹앱 최초 로딩 시 호출: 헤더 + 전체 문항 + 종합의견 */
function getData() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  const C = CONFIG.COL;
  const values = sheet.getRange(1, 1, lastRow, C.NOTE).getValues();
  const header = values[CONFIG.HEADER_ROW - 1];

  const levels = [
    parseHeader_(header[C.OPT_A - 1], 'A'),
    parseHeader_(header[C.OPT_B - 1], 'B'),
    parseHeader_(header[C.OPT_C - 1], 'C')
  ];

  const items = [];
  let summary = null;
  let stage = '';
  let element = '';

  for (let i = CONFIG.HEADER_ROW; i < values.length; i++) {
    const r = values[i];
    const rowNum = i + 1;
    if (str_(r[C.STAGE - 1])) { stage = str_(r[C.STAGE - 1]).replace(/\s*\n\s*/g, ' '); element = ''; }
    if (str_(r[C.ELEMENT - 1])) element = str_(r[C.ELEMENT - 1]);

    const question = str_(r[C.QUESTION - 1]);
    if (!question) continue;

    if (QUESTION_PATTERN.test(question)) {
      items.push({
        row: rowNum,
        stage: stage,
        element: element,
        question: question,
        options: [str_(r[C.OPT_A - 1]), str_(r[C.OPT_B - 1]), str_(r[C.OPT_C - 1])],
        result: normalizeResult_(r[C.RESULT - 1]),
        note: str_(r[C.NOTE - 1])
      });
    } else if (!summary && /종합/.test(str_(r[C.STAGE - 1]))) {
      summary = {
        row: rowNum,
        label: str_(r[C.STAGE - 1]).replace(/\s*\n\s*/g, ' '),
        text: String(r[C.QUESTION - 1]),
        note: str_(r[C.NOTE - 1])
      };
    }
  }

  return {
    title: sheet.getParent().getName(),
    levels: levels,
    items: items,
    summary: summary
  };
}

/** 저장 대상 행이 실제 문항 행인지 확인 (행 삽입 등으로 어긋난 경우 방지) */
function assertQuestionRow_(sheet, row, expectedQuestion) {
  row = Number(row);
  if (!(row > CONFIG.HEADER_ROW) || row > sheet.getLastRow()) throw new Error('잘못된 행 번호입니다.');
  const q = str_(sheet.getRange(row, CONFIG.COL.QUESTION).getValue());
  if (!QUESTION_PATTERN.test(q) || (expectedQuestion && q !== expectedQuestion)) {
    throw new Error('시트 구조가 바뀌었습니다. 새로고침 후 다시 시도하세요.');
  }
  return row;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** 검토 결과(A/B/C) 저장. value 가 빈 값이면 '검토중'으로 되돌림 */
function saveResult(row, value, question) {
  const v = normalizeResult_(value);
  if (value && !v) throw new Error('A, B, C 중 하나만 선택할 수 있습니다.');
  return withLock_(function () {
    const sheet = getSheet_();
    const r = assertQuestionRow_(sheet, row, question);
    sheet.getRange(r, CONFIG.COL.RESULT).setValue(v || CONFIG.PENDING);
    return { row: r, result: v };
  });
}

/** 검토 노트(H열) 저장 */
function saveNote(row, note, question) {
  return withLock_(function () {
    const sheet = getSheet_();
    const r = assertQuestionRow_(sheet, row, question);
    sheet.getRange(r, CONFIG.COL.NOTE).setValue(String(note || ''));
    return { row: r };
  });
}

/** 종합의견(C열) 저장 */
function saveSummary(row, text) {
  return withLock_(function () {
    const sheet = getSheet_();
    const r = Number(row);
    if (!/종합/.test(str_(sheet.getRange(r, CONFIG.COL.STAGE).getValue()))) {
      throw new Error('종합의견 행을 찾을 수 없습니다. 새로고침 후 다시 시도하세요.');
    }
    sheet.getRange(r, CONFIG.COL.QUESTION).setValue(String(text || ''));
    return { row: r };
  });
}
