// Declares side-effect CSS imports for Vite-bundled stylesheets. The
// application imports `./styles.css` from `main.ts`; `tsc` (strict, noEmit)
// needs this module declaration because the `types` array in tsconfig.json
// does not include `vite/client`.
declare module '*.css';
