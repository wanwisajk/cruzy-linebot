const DEFAULT_LIFF_URL = null;

function normalizeLiffBaseUrl(value, fallback = DEFAULT_LIFF_URL) {
  const raw = String(value || fallback || '').trim().replace(/\/+$/, '');
  if (!raw) return null;
  if (/^\d+-[A-Za-z0-9_-]+$/.test(raw)) return `https://liff.line.me/${raw}`;
  if (/^liff\.line\.me\//i.test(raw)) return `https://${raw}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  return fallback;
}

function getConfiguredLiffBaseUrl(envKey = 'LIFF_URL', fallbackEnvKey = null) {
  const configured = envKey ? process.env[envKey] : null;
  const fallback = fallbackEnvKey ? process.env[fallbackEnvKey] : null;
  return normalizeLiffBaseUrl(configured || fallback);
}

function buildConfiguredLiffUrl(path, envKey = 'LIFF_URL', fallbackEnvKey = null) {
  const baseUrl = getConfiguredLiffBaseUrl(envKey, fallbackEnvKey);
  const normalizedPath = String(path || '').trim().replace(/^\/+/, '');
  if (!baseUrl || !normalizedPath) return baseUrl;
  return `${baseUrl}/${normalizedPath}`;
}

function appendQueryToLiffUrl(baseUrl, query) {
  const queryString = query instanceof URLSearchParams
    ? query.toString()
    : String(query || '').replace(/^\?/, '');

  if (!baseUrl || !queryString) return baseUrl || null;

  const separator = baseUrl.includes('?') ? '&' : '?';
  if (/^https:\/\/liff\.line\.me\/[^/?#]+$/i.test(baseUrl)) {
    return `${baseUrl}/${separator}${queryString}`;
  }

  return `${baseUrl}${separator}${queryString}`;
}

module.exports = {
  DEFAULT_LIFF_URL,
  normalizeLiffBaseUrl,
  getConfiguredLiffBaseUrl,
  buildConfiguredLiffUrl,
  appendQueryToLiffUrl,
};
