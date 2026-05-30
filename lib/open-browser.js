'use strict';

const { spawn } = require('child_process');

/**
 * Open a URL in the default system browser (cross-platform, no npm deps).
 * @param {string} url
 * @returns {boolean} true if spawn succeeded
 */
function openInBrowser(url) {
  const platform = process.platform;
  let cmd;
  let cmdArgs;
  if (platform === 'win32') {
    cmd = 'cmd';
    cmdArgs = ['/c', 'start', '""', url];
  } else if (platform === 'darwin') {
    cmd = 'open';
    cmdArgs = [url];
  } else {
    cmd = 'xdg-open';
    cmdArgs = [url];
  }
  try {
    spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = { openInBrowser };
