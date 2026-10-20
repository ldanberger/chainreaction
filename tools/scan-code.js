#!/usr/bin/env node
/*
 * Security scan of the app's own code (no dependencies): run `node tools/scan-code.js`.
 *
 * Fails (exit code 1) if it finds anything that could let data from a project file turn into
 * running code or reach the network:
 *   - eval, new Function, setTimeout/setInterval with a string, document.write
 *   - innerHTML / outerHTML / insertAdjacentHTML set from anything but fixed text
 *   - network calls: fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon, import()
 *   - loading a URL into an element (.src / .href = ...) from anything but fixed text
 * and checks index.html: it must have the Content-Security-Policy, and no inline <script> or
 * on...= handler attributes (the policy blocks those anyway).
 *
 * A line that has been checked by hand can be allowed with a trailing `// scan-ok: <reason>`.
 * The vendored Matter.js in lib/ is not scanned (it's third-party and does none of this).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const problems = [];
const STRING = String.raw`(?:'[^'\n]*'|"[^"\n]*"|\`[^\`$\n]*\`)`; // fixed text, no ${...}
const RULES = [
  [/\beval\s*\(/, 'eval()'],
  [/\bnew\s+Function\s*\(/, 'new Function()'],
  [/\bset(?:Timeout|Interval)\s*\(\s*['"`]/, 'setTimeout/setInterval with a string'],
  [/\bdocument\.write(?:ln)?\s*\(/, 'document.write()'],
  [new RegExp(String.raw`\.(?:inner|outer)HTML\s*=(?!=)(?!\s*(?:${STRING}|[^;?]+\?\s*${STRING}\s*:\s*${STRING})\s*;)`), 'innerHTML/outerHTML set from something other than fixed text'],
  [/\.insertAdjacentHTML\s*\(/, 'insertAdjacentHTML()'],
  [/\bfetch\s*\(/, 'network: fetch()'],
  [/\bXMLHttpRequest\b/, 'network: XMLHttpRequest'],
  [/\bWebSocket\b/, 'network: WebSocket'],
  [/\bEventSource\b/, 'network: EventSource'],
  [/\bsendBeacon\b/, 'network: sendBeacon'],
  [/\bimport\s*\(/, 'dynamic import()'],
  [new RegExp(String.raw`\.(?:src|href|action)\s*=(?!=)(?!\s*${STRING}\s*;)`), 'a URL set from something other than fixed text'],
];

function scanJs(file) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
    if (/\/\/\s*scan-ok:/.test(line)) return;
    const code = line.replace(/\/\/.*$/, ''); // ignore comments
    for (const [re, what] of RULES) if (re.test(code)) problems.push(`${rel}:${i + 1}  ${what}\n    ${line.trim()}`);
  });
}

for (const dir of ['js', 'tools']) {
  for (const f of fs.readdirSync(path.join(root, dir))) {
    if (f.endsWith('.js') && f !== 'scan-code.js') scanJs(path.join(root, dir, f));
  }
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const csp = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i.exec(html);
if (!csp) problems.push('index.html  the Content-Security-Policy <meta> is missing');
else {
  const p = csp[1];
  for (const need of ["script-src 'self'", "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
    if (!p.includes(need)) problems.push(`index.html  the Content-Security-Policy should include ${need}`);
  }
  if (/'unsafe-inline'|'unsafe-eval'|\*/.test(p)) problems.push("index.html  the Content-Security-Policy allows 'unsafe-inline', 'unsafe-eval' or *");
}
if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) problems.push('index.html  has an inline <script> (move it into a file under js/)');
if (/\son[a-z]+\s*=/i.test(html)) problems.push('index.html  has an on...= event-handler attribute');

if (problems.length) {
  console.log(`Security scan: ${problems.length} problem(s)\n\n` + problems.join('\n\n'));
  process.exit(1);
}
console.log('Security scan: OK (js/, tools/, index.html)');
