const DEFAULT_INSPECTION_LIFF_URL = 'https://liff.line.me/2010334830-E2aZbMzY';

function normalizeLiffBaseUrl(value, fallback = DEFAULT_INSPECTION_LIFF_URL) {
  const raw = String(value || fallback || '').trim().replace(/\/+$/, '');
  if (!raw) return null;
  if (/^\d+-[A-Za-z0-9_-]+$/.test(raw)) return `https://liff.line.me/${raw}`;
  if (/^liff\.line\.me\//i.test(raw)) return `https://${raw}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  return fallback;
}

function appendQueryToLiffUrl(baseUrl, query) {
  const queryString = query instanceof URLSearchParams ? query.toString() : String(query || '').replace(/^\?/, '');
  if (!baseUrl || !queryString) return baseUrl || null;

  const separator = baseUrl.includes('?') ? '&' : '?';
  if (/^https:\/\/liff\.line\.me\/[^/?#]+$/i.test(baseUrl)) {
    return `${baseUrl}/${separator}${queryString}`;
  }

  return `${baseUrl}${separator}${queryString}`;
}

module.exports = {
  DEFAULT_INSPECTION_LIFF_URL,
  normalizeLiffBaseUrl,
  appendQueryToLiffUrl,
};
