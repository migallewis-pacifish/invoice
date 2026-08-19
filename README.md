# Invoice

## Deploying Firebase Functions

Firebase Functions deploy through the **Deploy Firebase Functions** GitHub Actions workflow.

- On demand: open **Actions → Deploy Firebase Functions → Run workflow** and choose the branch to deploy.
- Automatic: a push to `main` deploys only when `functions/**`, `firebase.json`, or `.firebaserc` changed.
- Every deployment installs the locked Functions dependencies and runs the renderer tests first.
- The workflow uses the existing `FIREBASE_SERVICE_ACCOUNT_INVOICE_SIMPLE_336` repository secret and deploys to `invoice-simple-336`.

Hosting workflows remain separate and do not deploy Functions.

### SendGrid deployment and operations

Outbound mail has two deliberately separate modes:

- **Nexus managed fallback** uses only `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL`. `SENDGRID_FROM_EMAIL` must be an address on the Nexus-owned, SendGrid-authenticated sending domain. A company address is added only as `reply_to`; it is never used as the envelope From identity with the platform key.
- **Company-owned SendGrid** uses `COMPANY_SENDGRID_CREDENTIALS`, an administrator-managed Secret Manager JSON value keyed by company ID, for example `{"company-id":{"apiKey":"SG.…","fromEmail":"billing@example.com","fromName":"Example Billing"}}`. Do not put this key in Firestore company documents, frontend configuration, logs, support tickets, or browser forms. After provisioning, an authenticated company member must select **Test connection and verify sender**; the backend tests the key and confirms a verified sender or authenticated domain before recording connected public metadata.

Before deployment, set all applicable Firebase secrets with `firebase functions:secrets:set NAME`, grant the Functions runtime service account secret access, and deploy Functions so the secret bindings take effect. The Nexus SendGrid account must have its sending domain authenticated with valid **DKIM** and **SPF** DNS records. Configure branded link tracking for the Nexus domain (or disable click tracking if it cannot be branded), HTTPS links, bounce/event handling, suppression processing, and a monitored return path. Verify these settings in SendGrid after every DNS or account change.

Nexus managed sending is fail-closed. Set `NEXUS_SENDGRID_DOMAIN` to the exact authenticated domain and set `NEXUS_EMAIL_ENABLED=true` only after production review; omitting either is the administrative kill switch. Optional `NEXUS_EMAIL_HOURLY_LIMIT` and `NEXUS_EMAIL_DAILY_LIMIT` values default to 50 and 250 per company. Set `SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY` to SendGrid's Event Webhook verification key and enable signed events for `sendGridEventWebhook`; hard bounces, complaints, and unsubscribes populate company suppression records. Operators should monitor `emailSendRecords`, `emailUsage`, and suppression growth for spikes or abuse before raising quotas.

Rotate platform and company API keys on a regular schedule and immediately after suspected exposure. Create a least-privilege replacement key, update the relevant secret, redeploy Functions, run the connection/sender check, send a monitored test, and only then revoke the old key. Rotation must not change the authenticated From domain accidentally; re-check DKIM/SPF, branded links, bounce events, and suppression processing after rotation.

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

## Email delivery status semantics

Email send records use a provider-neutral lifecycle: `pending`, `sent`, `accepted`,
`deferred`, `delivered`, `dropped`, `bounced`, `complained`, `unsubscribed`, or
`failed`. SendGrid Event Webhook events are authenticated with SendGrid's ECDSA
signature headers and `SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY`; configure the webhook to
post delivered, deferred, dropped, bounce, spam-report, and unsubscribe events.
The outbound `sendRecordId` custom argument is the preferred correlation key, with
the SendGrid message ID as a fallback. Events are deduplicated and provider event
timestamps prevent stale deliveries from regressing a newer state.

Gmail API `messages.send` confirms that Gmail accepted the message into its send
pipeline, not that the recipient's server or mailbox received it. Gmail sends are
therefore stored as `accepted`. Microsoft Graph `sendMail` returns acceptance for
processing and does not provide a delivery receipt in this integration, so those
sends are also stored as `accepted` (or `sent` if a future adapter can only confirm
submission). Neither provider is labelled `delivered` without an authenticated
provider delivery event.

Hard bounces, spam complaints, and unsubscribes create a company/client-associated,
hashed-recipient suppression record. All providers consult that record before a
send and block active suppressions. Transient deferrals, policy blocks, and drops
remain actionable status warnings but do not permanently suppress the recipient.
