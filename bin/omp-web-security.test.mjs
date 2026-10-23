import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const guardPath = require.resolve("./private-network-guard.js");
const { isPrivateNetworkAddress, isTrustedHostHeader } = require(guardPath);

test("passwordless guard admits loopback, private LAN/VPN and local IPv6 clients only", () => {
  for (const address of ["127.0.0.1", "127.8.9.10", "::1", "::ffff:127.0.0.1", "10.66.0.2", "172.16.0.1",
    "172.31.255.255", "192.168.31.82", "::ffff:192.168.1.5", "fd12:3456::1", "fe80::1%wg0"]) {
    assert.equal(isPrivateNetworkAddress(address), true, address);
  }
  for (const address of ["203.0.113.10", "172.15.255.255", "172.32.0.1", "192.169.0.1", "100.64.0.1",
    "169.254.1.1", "::ffff:8.8.8.8", "2001:db8::1", "fec0::1", "", undefined]) {
    assert.equal(isPrivateNetworkAddress(address), false, String(address));
  }
});

test("passwordless guard refuses DNS names that could be rebound to a private address", () => {
  for (const host of ["10.66.0.3:30177", "192.168.31.38", "localhost:30177", "[::1]:30177", "[fd00::1]"]) {
    assert.equal(isTrustedHostHeader(host), true, host);
  }
  for (const host of ["evil.example:30177", "nas.local", "localhost.evil.example", "[evil]:1", "", undefined]) {
    assert.equal(isTrustedHostHeader(host), false, String(host));
  }
});

test("preloaded guard rejects untrusted Host headers on a real server", async () => {
  const script = `const http=require("node:http");const s=http.createServer((q,r)=>r.end("ok"));`
    + `s.listen(0,"127.0.0.1",()=>console.log(s.address().port));`;
  const child = spawn(process.execPath, ["--require", guardPath, "-e", script], {
    env: { ...process.env, OMP_WEB_PRIVATE_NETWORK_ONLY: "1" },
    stdio: ["ignore", "pipe", "inherit"],
  });
  try {
    const port = await new Promise((resolve, reject) => {
      child.stdout.once("data", (chunk) => resolve(Number(String(chunk).trim())));
      child.once("exit", (code) => reject(new Error(`server exited with ${code}`)));
    });
    const get = (host) => new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, headers: { host } }, (response) => {
        response.resume();
        resolve(response.statusCode);
      }).on("error", reject);
    });
    assert.equal(await get(`127.0.0.1:${port}`), 200);
    assert.equal(await get(`evil.example:${port}`), 403);
  } finally {
    child.kill();
  }
});
