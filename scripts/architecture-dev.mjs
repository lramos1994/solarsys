import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const environment = { ...process.env };
// LikeC4 discovers optional AI integrations from ambient credentials. The
// architecture viewer is local and offline, so it must not activate one.
delete environment.OPENROUTER_API_KEY;

const cli = fileURLToPath(new URL('../node_modules/likec4/bin/likec4.mjs', import.meta.url));
const child = spawn(process.execPath, [cli, 'start', 'docs/architecture'], {
  env: environment,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
  }

  process.exitCode = code ?? 1;
});
