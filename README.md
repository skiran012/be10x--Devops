# SpendSight

SpendSight is a static HTML, CSS, and JavaScript personal-finance dashboard. The development server serves the project directly; there is no bundling step.

## Run locally

```sh
npm install
npm start
```

Open http://localhost:5173/.

## Test before building

```sh
npm test
npm run build
```

`npm run build` automatically runs the full Vitest suite first (`prebuild`). If the tests fail, the build check does not run. After tests pass, the build check uses Node's syntax checker on the JavaScript source and tests; no generated bundle is produced.

The test suite includes ledger reconciliation, transfer netting, budget thresholds, bill recurrence and linking, goal allocations, and dashboard UI state/update tests. Requirement IDs are included in test names.
