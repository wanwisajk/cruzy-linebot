const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

function todayBangkok() {
  return toBangkokDateString(new Date());
}

function addDaysBangkok(days) {
  const now = new Date();
  const bangkok = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  bangkok.setUTCDate(bangkok.getUTCDate() + days);
  return bangkok.toISOString().slice(0, 10);
}

function toBangkokDateString(date) {
  return new Date(date.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  const [year, month, day] = String(value).slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function formatTime(value) {
  if (!value) {
    return '--:--';
  }

  return String(value).slice(0, 5);
}

module.exports = {
  todayBangkok,
  addDaysBangkok,
  formatDate,
  formatTime,
};
