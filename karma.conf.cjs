// CI-compatible Karma configuration.
// Uses ChromeHeadless with deterministic, sandbox-free flags that work on GitHub Actions Linux runners.
module.exports = function (config) {
  config.set({
    browsers: ['ChromeHeadlessCI'],
    customLaunchers: {
      ChromeHeadlessCI: {
        base: 'ChromeHeadless',
        flags: [
          '--no-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-extensions',
          '--remote-debugging-port=9222'
        ]
      }
    },
    singleRun: true,
    restartOnFileChange: false,
    autoWatch: false,
    reporters: ['progress'],
    client: {
      clearContext: false,
      jasmine: { random: false }
    }
  });
};
