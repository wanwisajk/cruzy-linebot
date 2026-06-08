const { line, lineConfig, missingLineConfig } = require('../config/line');

function lineMiddleware(req, res, next) {
  if (missingLineConfig.length > 0) {
    return res.status(500).json({
      error: 'LINE configuration is missing',
      missing: missingLineConfig,
    });
  }

  return line.middleware(lineConfig)(req, res, next);
}

module.exports = {
  lineMiddleware,
};
