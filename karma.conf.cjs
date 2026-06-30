// CI-compatible Karma configuration.
// Angular's test builder uses this full config so Jasmine's adapter can call __karma__.start().
module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma')
    ],
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
    reporters: ['progress', 'kjhtml'],
    client: {
      clearContext: false,
      jasmine: { random: false }
    },
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage/invoice'),
      subdir: '.',
      reporters: [{ type: 'html' }, { type: 'text-summary' }]
    }
  });
};
