// Application shell entry point.
//
// The UI layer (controls, preview, export) is built in slice 3 of the
// migration; this file exists so the static build pipeline chosen in task 1.3
// is real and verifiable. It intentionally contains no scene logic: the
// generator lives under `ts/generator/` and stays DOM-free (D-18, D-21).
const root = document.querySelector<HTMLElement>('#app');

if (root) {
  root.textContent = 'SolarSys — TypeScript migration in progress.';
}
