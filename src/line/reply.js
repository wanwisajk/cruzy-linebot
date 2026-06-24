const { lineClient } = require('../../backend/config/line');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getLineErrorDetail(error) {
  const detail = {
    message: error && error.message,
    statusCode: error && (error.statusCode || error.status),
  };

  const responseData =
    error && error.response && error.response.data ||
    error && error.originalError && error.originalError.response && error.originalError.response.data ||
    error && error.body;

  if (responseData) detail.response = responseData;
  if (error && error.details) detail.details = error.details;
  if (error && error.cause) {
    detail.cause = {
      message: error.cause.message,
      code: error.cause.code,
      errno: error.cause.errno,
      syscall: error.cause.syscall,
      hostname: error.cause.hostname,
      address: error.cause.address,
      port: error.cause.port,
    };
  }

  return detail;
}

function isTransientLineSendError(error) {
  if (!error) return false;
  if (error.message === 'fetch failed') return true;

  const code = error.cause && error.cause.code || error.code;
  return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(code);
}

function lineErrorText(error) {
  const detail = getLineErrorDetail(error);
  return [
    detail.message,
    typeof detail.response === 'string' ? detail.response : JSON.stringify(detail.response || ''),
    typeof detail.details === 'string' ? detail.details : JSON.stringify(detail.details || ''),
  ].filter(Boolean).join(' ');
}

function isInvalidReplyTokenError(error) {
  const statusCode = error && (error.statusCode || error.status);
  return Number(statusCode) === 400 && /invalid reply token/i.test(lineErrorText(error));
}

async function sendLineMessage({ replyToken, to, messages }) {
  if (replyToken) {
    return lineClient.replyMessage({ replyToken, messages });
  }

  if (to) {
    return lineClient.pushMessage({ to, messages });
  }

  throw new Error('No replyToken or target provided for replyOrPush');
}

async function replyOrPush({ replyToken, to, messages }) {
  const maxAttempts = 2;
  try {
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await sendLineMessage({ replyToken, to, messages });
      } catch (error) {
        lastError = error;
        if (replyToken && to && isInvalidReplyTokenError(error)) {
          console.warn('LINE reply token invalid, falling back to push:', getLineErrorDetail(error));
          return lineClient.pushMessage({ to, messages });
        }

        if (attempt >= maxAttempts || !isTransientLineSendError(error)) {
          throw error;
        }

        console.warn('LINE send transient failure, retrying:', {
          attempt,
          detail: getLineErrorDetail(error),
        });
        await sleep(350);
      }
    }
    throw lastError;
  } catch (error) {
    console.error('LINE send failed:', getLineErrorDetail(error));
    throw error;
  }
}

module.exports = {
  getLineErrorDetail,
  isInvalidReplyTokenError,
  replyOrPush,
};
