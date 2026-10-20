/**
 * 협의회 등록부(서명부) 웹앱
 * - 참석자가 소속·직위·성명·계좌번호를 입력하고 캔버스에 서명
 * - 시트에 한 줄씩 기록되며, 서명은 셀 안 이미지로 바로 보임
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
  const t = HtmlService.createTemplateFromFile('Index');
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
