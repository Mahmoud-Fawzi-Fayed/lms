import { spawnSync } from 'node:child_process';

const steps = [
  {
    name: 'Live API security regression',
    command: 'node',
    args: ['test-security.mjs'],
  },
  {
    name: 'Paymob webhook security checks',
    command: 'npm',
    args: ['run', 'test:paymob-security'],
  },
];

let failed = false;

for (const step of steps) {
  console.log(`\n=== ${step.name} ===`);
  const result = spawnSync(step.command, step.args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });

  if (result.status !== 0) {
    failed = true;
    console.error(`\n[FAIL] ${step.name} exited with code ${result.status}`);
    break;
  }

  console.log(`[PASS] ${step.name}`);
}

if (failed) {
  process.exit(1);
}

console.log('\nAll live validation suites passed.');
