# Invoice App Evaluation and Next-Step Plan

## Current state

The application is an Angular 18 invoice app backed by Firebase Authentication, Firestore, Firebase Storage, and Firebase Hosting. It currently supports sign-in, company registration, client management, invoice generation from DOCX templates, template uploads, expenses, and membership routing.

PDF export should stay out of scope for now. The current browser flow generates a DOCX file and asks the user to export it with Word or another document viewer; server-side conversion can be revisited later if PDF becomes a must-have.

## Key findings

### 1. Security rules are the highest-risk item

- `firestore.rules` currently uses a temporary open read/write rule that expired on **2025-11-03**. In production this means clients are denied after that date; before that date the database would have been broadly open.
- `storage.rules` allows public reads for every object and authenticated writes to every path. This is too permissive for invoice templates, company data, and any generated files.

### 2. Test coverage exists, but the test runner is not CI-ready

- The repo has many Angular spec files for components and services.
- The default Karma/ChromeHeadless test command cannot run in the current environment because Chrome is not installed or `CHROME_BIN` is not configured.
- The next test milestone should be to make unit tests run reliably in CI, then add targeted tests around invoice calculations, guards, services, and Firestore path isolation.

### 3. Build is mostly healthy, with optimization and budget warnings

- `ng build` completes and produces a production bundle.
- Current warnings include SCSS component budget overruns and CommonJS optimization bailouts from `pizzip`, `docxtemplater`, and `file-saver`.
- These warnings are not immediate blockers, but they should be tracked before the app grows.

### 4. Invoice generation has duplicated and partially unused logic

- `InvoiceDocxService` computes totals in more than one place, and the private `computeTotals` helper is not used by the main generation path.
- PDF-related code currently downloads the DOCX and opens it with a user-facing alert. Since PDF conversion is paused, this should be renamed or simplified to avoid implying real PDF generation.
- OneDrive and Google Drive save methods are placeholders that throw `Not implemented`; the UI should not offer those flows until they are implemented.

### 5. Routing and guard behavior need cleanup

- `companyGuard` redirects users without a company to `/register-company`, but the defined route is `/register`.
- The `membership` route is currently unguarded, unlike the rest of the app pages that require authentication/company context.
- The client-detail route includes `companyId` in the URL, but services generally derive company context from the authenticated user. This is good for security if rules enforce it, but the route parameter should not be trusted for reads/writes.

### 6. Firestore access patterns need consistent ownership checks

- Services mostly derive the company ID from `users/{uid}` before accessing company subcollections.
- Expenses methods accept `companyId` directly, which makes them easier to misuse from components unless Firestore rules enforce membership.
- The app should standardize on a single company-context helper/service for client, invoice, template, and expense operations.

### 7. Dependency and vulnerability checks need access to npm audit

- `npm audit` could not complete in this environment because the npm registry audit endpoint returned HTTP 403.
- Once registry access is fixed, vulnerability scanning should become part of CI and release gating.

## Recommended execution plan

### Phase 1: Stabilize and secure the app

1. Replace temporary Firestore rules with company-scoped rules:
   - Users can read/write only their own user profile where appropriate.
   - Company members can read company data only for companies they belong to.
   - Client, invoice, expense, and template subcollections require authenticated membership.
   - Use helper functions such as `signedIn()`, `userProfile()`, `userCompanyId()`, and `isCompanyMember(companyId)`.
2. Tighten Storage rules:
   - Remove public reads by default.
   - Scope templates and generated files under company paths.
   - Require authenticated company membership for reads and writes.
   - Validate file type and size for template uploads.
3. Fix route/guard mismatches:
   - Redirect missing-company users to `/register` or add a real `/register-company` route.
   - Guard the membership route if it requires a signed-in user.
4. Hide or disable unimplemented cloud-save providers:
   - Do not allow users to choose OneDrive or Google Drive until the save methods are implemented.
   - Surface a clear “local DOCX download only” state.

### Phase 2: Make tests and checks reliable

1. Make unit tests CI-compatible:
   - Add a documented headless browser setup or switch to a runner that works well in CI.
   - Add a `test:ci` script with deterministic flags.
2. Add focused unit tests:
   - Invoice total calculation with and without VAT.
   - Invalid/missing template handling.
   - Company context errors for unauthenticated users and users without company IDs.
   - Guards for authenticated, unauthenticated, company, and no-company states.
3. Add Firebase rules tests:
   - Verify cross-company access is denied.
   - Verify unauthenticated access is denied.
   - Verify valid company members can read/write only allowed paths.
4. Add CI checks:
   - `npm ci`
   - `npm run build`
   - `npm run test:ci`
   - `npm audit --audit-level=moderate` once registry access is available.

### Phase 3: Refactor for maintainability

1. Extract a `CompanyContextService`:
   - Centralize authenticated user and company ID lookup.
   - Reuse it across client, invoice, template, and expense services.
2. Extract invoice calculation utilities:
   - Keep VAT, subtotal, total, and currency formatting in a pure function.
   - Unit-test this function independently from DOCX generation.
3. Simplify invoice export naming:
   - Rename `generatePdf` to something like `generateDocxForManualPdfExport` or remove it from UI until real PDF conversion exists.
4. Remove dead or unused code:
   - Delete unused helpers such as `escapeHtml` if they remain unused.
   - Remove unused imports and commented-out code.
5. Improve error handling:
   - Preserve technical errors for logs while showing user-friendly messages in the UI.
   - Add clear UI states for missing templates, failed downloads, and failed Firestore reads.

### Phase 4: Useful near-term features

1. Invoice lifecycle:
   - Draft, sent, paid, overdue, and cancelled statuses.
   - Due dates and payment terms.
   - Paid date and payment reference.
2. Invoice numbering:
   - Company-level invoice number sequence.
   - Collision-safe transaction or Cloud Function for incrementing numbers.
   - Configurable prefixes such as `INV-2026-0001`.
3. Client improvements:
   - Client search/filtering.
   - Contact person fields.
   - Billing address validation.
4. Expenses and reporting:
   - Monthly profit summary: invoice totals minus expenses.
   - VAT collected and VAT paid report.
   - CSV export for accountant handoff.
5. Template management:
   - Template preview metadata.
   - Validate required placeholders before saving a template.
   - Support per-company default template and multiple named templates.
6. Optional future PDF service:
   - Add a Spring Boot or Cloud Run conversion service only after DOCX generation is stable.
   - Keep conversion server-side to avoid browser limitations and formatting differences.
   - Protect the service with Firebase Auth and company authorization checks.

## Suggested priority order

1. Fix Firebase rules and route/guard mismatches.
2. Make tests run in CI and add core service/guard tests.
3. Refactor invoice calculation and company context.
4. Add invoice lifecycle and numbering.
5. Add reporting/export features.
6. Revisit server-side PDF conversion only when the DOCX workflow is reliable.
