#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Only auto-reinstall if a previous `init` was done — indicated by selected-ides.json
const selPath = path.join(os.homedir(), '.refacil-sdd-ai', 'selected-ides.json');
if (!fs.existsSync(selPath)) process.exit(0);

const { execFileSync } = require('child_process');
try {
  execFileSync(process.execPath, [path.join(__dirname, 'cli.js'), 'update'], {
    stdio: 'inherit',
    timeout: 120000,
  });
} catch (_) {
  // Non-fatal: postinstall must never break npm install
}
