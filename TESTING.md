# Safe database-backed testing

AuraPay automated tests never use `MONGO_URI` as a fallback. Database-backed commands require both `NODE_ENV=test` (set by the package scripts) and an explicit `MONGO_URI_TEST`.

`MONGO_URI_TEST` must name a dedicated database with a clear `test`, `testing`, or `e2e` segment, such as `aurapay_test`. It must not identify the same database as `MONGO_URI`. A replica-set-capable dedicated MongoDB database is the canonical strategy because AuraPay's merchant lifecycle regressions exercise transactions.

PowerShell example (supply your own dedicated test credentials and host):

```powershell
$env:MONGO_URI_TEST = "mongodb://HOST/aurapay_test"
npm run test:integration
```

Useful commands:

- `npm run test:unit` — database-independent tests, including the URI guard.
- `npm run test:integration` — database-backed API/Admin regressions.
- `npm run test:api` and `npm run test:smoke` — focused database-backed checks.
- In `aurapay-dashboard`, `npm run test:e2e` — Playwright against the isolated test backend.

Every database-backed run validates the URI before connecting and validates the actual connected database name. Cleanup validates it again and deletes only tracked/run-scoped records. E2E seed files include a unique run ID.

For an interrupted E2E run, retain its exact seed file and run:

```powershell
$env:MONGO_URI_TEST = "mongodb://HOST/aurapay_test"
npm run test:cleanup-run -- K:\path\to\seed.json
```

The cleanup command refuses missing/wildcard run IDs, requires exact merchant/user IDs, prints the run ID, and cannot operate on `MONGO_URI`.
