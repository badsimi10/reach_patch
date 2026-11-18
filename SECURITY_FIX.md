# Reach security fix

## Root cause
The original POST `/` route interpolated user-controlled `host` into `exec(`ping -c 1 -W 2 ${host}`)`, allowing shell command injection.

## Remediation
The route now requires a single DNS hostname or IP address, rejects shell metacharacters and option-like input, and calls `execFile` with a fixed argument array rather than invoking a shell. Output remains HTML-escaped by the existing renderer.

## Local verification
1. `npm install` and `npm start` (requires `ping` on PATH).
2. Check `127.0.0.1` or `example.com`: a normal result card should appear.
3. Check `127.0.0.1; whoami`: the request should return HTTP 400 and a validation message.
4. Check `/health`: it should return `{ "ok": true }`.
5. Check a nonexistent hostname: it should show `down` without crashing.

Note: This fix addresses command injection, not network-scanning abuse. A public service should also consider rate limits, authentication, and restrictions on internal network targets.
