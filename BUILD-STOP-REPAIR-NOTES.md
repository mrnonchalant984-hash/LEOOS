# LeonardX build-stop repair notes

## Change made
- The `build` script now runs `npm run clean` before `next build`. This removes stale `.next` build and generated route-type artifacts before the production build begins.
- The existing `typecheck` script already performs clean + `next typegen` + `tsc --noEmit`; use it instead of running `npx tsc --noEmit` against potentially stale generated types.

## Run in PowerShell
```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

## Important limitation
The supplied terminal transcript ends at `Creating an optimized production build ...` and does not contain the actual build failure or final result. This change addresses stale `.next` artifacts as a precaution, but cannot be represented as a confirmed fix for an unseen build error. If the build still stops, send the final 30–50 lines of the error output so the exact failing source can be patched.
