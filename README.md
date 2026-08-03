# Invoice

## Deploying Firebase Functions

Firebase Functions deploy through the **Deploy Firebase Functions** GitHub Actions workflow.

- On demand: open **Actions → Deploy Firebase Functions → Run workflow** and choose the branch to deploy.
- Automatic: a push to `main` deploys only when `functions/**`, `firebase.json`, or `.firebaserc` changed.
- Every deployment installs the locked Functions dependencies and runs the renderer tests first.
- The workflow uses the existing `FIREBASE_SERVICE_ACCOUNT_INVOICE_SIMPLE_336` repository secret and deploys to `invoice-simple-336`.

Hosting workflows remain separate and do not deploy Functions.

This project was generated with [Angular CLI](https://github.com/angular/angular-cli) version 18.2.20.

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
