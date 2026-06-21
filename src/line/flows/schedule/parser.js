const { todayBangkok } = require('../../../../backend/utils/date');

const RANGE_WORD = '(?:ถึง|to|-)';

function pad(value) {
  return String(value).padStart(2, '0');
}

function parseYear(value, fallbackYear) {
  if (!value) return fallbackYear;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallbackYear;
  if (numeric > 2400) return numeric - 543;
  if (numeric < 100) return 2000 + numeric;
  return numeric;
}

function normalizeDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }

  return `${y}-${pad(m)}-${pad(d)}`;
}

function getCurrentParts() {
  const [year, month, day] = todayBangkok().split('-').map(Number);
  return { year, month, day };
}

function monthRange(year, month) {
  const start = normalizeDate(year, month, 1);
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { startDate: start, endDate: normalizeDate(year, month, endDay), matchedText: '' };
}

function parseSlashDate(day, month, year, fallback) {
  return normalizeDate(parseYear(year, fallback.year), month || fallback.month, day);
}

function pickRange(startDate, endDate, matchedText) {
  if (!startDate || !endDate) return null;
  if (startDate > endDate) {
    return { startDate: endDate, endDate: startDate, matchedText };
  }
  return { startDate, endDate, matchedText };
}

function parseDateRange(text) {
  const source = String(text || '');
  const fallback = getCurrentParts();
  const trimmed = source.trim();

  if (/วันนี้/.test(trimmed)) {
    const today = todayBangkok();
    return { startDate: today, endDate: today, matchedText: 'วันนี้' };
  }

  if (/พรุ่งนี้/.test(trimmed)) {
    const tomorrowDate = new Date(`${todayBangkok()}T00:00:00.000Z`);
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
    const tomorrow = tomorrowDate.toISOString().slice(0, 10);
    return { startDate: tomorrow, endDate: tomorrow, matchedText: 'พรุ่งนี้' };
  }

  if (/เดือนนี้/.test(trimmed)) {
    return { ...monthRange(fallback.year, fallback.month), matchedText: 'เดือนนี้' };
  }

  const isoRange = trimmed.match(new RegExp(`(\\d{4}-\\d{1,2}-\\d{1,2})\\s*${RANGE_WORD}\\s*(\\d{4}-\\d{1,2}-\\d{1,2})`, 'i'));
  if (isoRange) {
    const startParts = isoRange[1].split('-').map(Number);
    const endParts = isoRange[2].split('-').map(Number);
    return pickRange(
      normalizeDate(startParts[0], startParts[1], startParts[2]),
      normalizeDate(endParts[0], endParts[1], endParts[2]),
      isoRange[0]
    );
  }

  const slashRange = trimmed.match(new RegExp(`(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{2,4}))?\\s*${RANGE_WORD}\\s*(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{2,4}))?`, 'i'));
  if (slashRange) {
    return pickRange(
      parseSlashDate(slashRange[1], slashRange[2], slashRange[3], fallback),
      parseSlashDate(slashRange[4], slashRange[5], slashRange[6] || slashRange[3], fallback),
      slashRange[0]
    );
  }

  const dayRange = trimmed.match(new RegExp(`(?:วันที่\\s*)?(\\d{1,2})\\s*${RANGE_WORD}\\s*(\\d{1,2})(?![/.\\d])`, 'i'));
  if (dayRange) {
    return pickRange(
      normalizeDate(fallback.year, fallback.month, dayRange[1]),
      normalizeDate(fallback.year, fallback.month, dayRange[2]),
      dayRange[0]
    );
  }

  const isoSingle = trimmed.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoSingle) {
    const date = normalizeDate(isoSingle[1], isoSingle[2], isoSingle[3]);
    return date ? { startDate: date, endDate: date, matchedText: isoSingle[0] } : null;
  }

  const slashSingle = trimmed.match(/(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?/);
  if (slashSingle) {
    const date = parseSlashDate(slashSingle[1], slashSingle[2], slashSingle[3], fallback);
    return date ? { startDate: date, endDate: date, matchedText: slashSingle[0] } : null;
  }

  const daySingle = trimmed.match(/วันที่\s*(\d{1,2})(?![/. จะถึง-]*\d)/);
  if (daySingle) {
    const date = normalizeDate(fallback.year, fallback.month, daySingle[1]);
    return date ? { startDate: date, endDate: date, matchedText: daySingle[0] } : null;
  }

  return { ...monthRange(fallback.year, fallback.month), matchedText: '' };
}

function cleanQueryText(text, matchedText) {
  return String(text || '')
    .replace(/^#\s*/, '')
    .replace(/ตาราง\s*คน\s*ขาด/gi, '')
    .replace(/ตาราง(?:\s*งาน)?/gi, '')
    .replace(/schedule/gi, '')
    .replace(matchedText || '', '')
    .replace(/\b(?:วันที่|ช่วงวันที่|เดือนนี้|วันนี้|พรุ่งนี้)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseScheduleCommand(text) {
  const raw = String(text || '').trim().replace(/^#\s*/, '');
  const isMissing = /ตาราง\s*คน\s*ขาด/i.test(raw);
  const range = parseDateRange(raw);
  const query = cleanQueryText(raw, range && range.matchedText);

  return {
    isMissing,
    query,
    startDate: range.startDate,
    endDate: range.endDate,
  };
}

module.exports = {
  parseScheduleCommand,
};
