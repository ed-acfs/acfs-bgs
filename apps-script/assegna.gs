/**
 * ACFS BGS Tool — password-protected writes to the Architect Registry (roadmap, phase 8a).
 *
 * Bound to the "ACFS BGS Tool — Registro Architetti e Watchlist" spreadsheet and deployed as a
 * web app, this is how the tool's Assign dialog records an assignment instead of posting the
 * Google Form. The password is checked here, on Google's side, so skipping the tool doesn't
 * get round it; it lives in the script properties (key ASSIGN_PASSWORD), never in the repo.
 *
 * Every assignment appends a row, exactly like a Form response: the tool reads the latest row
 * per system, and the older rows stay as history. Columns are matched by header name, so the
 * order of the sheet's columns doesn't matter.
 *
 * Installation and password changes: see apps-script/README.md.
 */

/** The Form's response sheet, which holds the Architect Registry. */
const SHEET_NAME = 'Risposte del modulo 1';
/** Script property holding the officers' shared password. */
const PASSWORD_PROPERTY = 'ASSIGN_PASSWORD';
const MAX_FIELD_LENGTH = 120;
/**
 * Wrong passwords allowed before writes are refused for LOCKOUT_SECONDS, against guessing.
 * The count is global (a web app can't tell callers apart), so a stranger guessing can also
 * lock the officers out for a few minutes: an acceptable price for a squadron tool.
 */
const MAX_FAILURES = 10;
const LOCKOUT_SECONDS = 600;
const FAILURES_KEY = 'failed-passwords';

/** The "ACFS Architect" answers the Form accepts, spelled exactly as it records them. */
const AFFILIATIONS = [
  'The Architect is an ACFS Member',
  'Not an ACFS Member',
  'Nobody The System Is Not a Colony',
  "Don't know",
];

/** A plain GET answers whether the deployment is alive, for checking the URL by hand. */
function doGet() {
  return reply({ ok: true, service: 'acfs-bgs-tool-assign' });
}

/**
 * Records one assignment. The tool sends JSON as text/plain (no CORS preflight):
 * { password, yourName, systemName, architect, affiliation, preferredFaction }.
 * Answers { ok: true } or { ok: false, error } with error one of: bad-request, locked,
 * not-configured, password, invalid (plus detail).
 */
function doPost(e) {
  let request;
  try {
    request = JSON.parse(e.postData.contents);
  } catch (error) {
    return reply({ ok: false, error: 'bad-request' });
  }

  const cache = CacheService.getScriptCache();
  const failures = Number(cache.get(FAILURES_KEY) || 0);
  if (failures >= MAX_FAILURES) {
    return reply({ ok: false, error: 'locked' });
  }
  const expected = PropertiesService.getScriptProperties().getProperty(PASSWORD_PROPERTY);
  if (!expected) {
    return reply({ ok: false, error: 'not-configured' });
  }
  if (typeof request.password !== 'string' || request.password !== expected) {
    cache.put(FAILURES_KEY, String(failures + 1), LOCKOUT_SECONDS);
    return reply({ ok: false, error: 'password' });
  }

  const problem = validate(request);
  if (problem) {
    return reply({ ok: false, error: 'invalid', detail: problem });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const values = {
      'Informazioni cronologiche': new Date(),
      'Your Name': cell(request.yourName),
      'System Name': cell(request.systemName),
      'Architect Name': cell(request.architect),
      'ACFS Architect': request.affiliation,
      'Preferred Faction': cell(request.preferredFaction),
    };
    sheet.appendRow(header.map(name => (name in values ? values[name] : '')));
  } finally {
    lock.releaseLock();
  }
  return reply({ ok: true });
}

/** The first problem with a request's fields, in Italian for the dialog, or null if it's fine. */
function validate(request) {
  for (const field of ['yourName', 'systemName', 'architect', 'preferredFaction']) {
    const value = request[field];
    if (value != null && typeof value !== 'string') {
      return `Campo ${field} non valido.`;
    }
    if (value && value.length > MAX_FIELD_LENGTH) {
      return `Campo ${field} troppo lungo (massimo ${MAX_FIELD_LENGTH} caratteri).`;
    }
  }
  if (!request.yourName || !request.yourName.trim()) {
    return 'Manca il nome di chi fa la segnalazione.';
  }
  if (!request.systemName || !request.systemName.trim()) {
    return 'Manca il nome del sistema.';
  }
  if (AFFILIATIONS.indexOf(request.affiliation) === -1) {
    return 'Appartenenza non valida.';
  }
  return null;
}

/**
 * A text value safe to append: trimmed, and never read by Sheets as a formula (a leading
 * = + - @ would be), the same way the Form stores answers as plain text.
 */
function cell(value) {
  const text = (value || '').trim();
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function reply(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
