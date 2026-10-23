"use strict";

// Passwordless access control for a non-loopback bind. The launcher preloads
// this module into the Next.js server (`node --require`) when no password is
// set, so every listening socket in that process only serves:
//   - clients on loopback, RFC 1918 private IPv4 (LAN, WireGuard, Docker
//     bridges), IPv6 ULA or IPv6 link-local addresses;
//   - requests whose Host is an IP literal or `localhost`. A DNS name could be
//     rebound by a public website to this private address, so it is refused.
// Clients are checked at the TCP layer; forwarding headers are never trusted.
// A tunnel or reverse proxy on this host (frp, ssh -R, …) connects from
// loopback and therefore bypasses the address check: never expose a
// passwordless ompweb through one.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const net = require("node:net");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const http = require("node:http");

function parseIPv4(address) {
  const parts = address.split(".").map(Number);
  return parts.length === 4 && parts.every((p) => Number.isInteger(p) && p >= 0 && p <= 255) ? parts : null;
}

function isPrivateNetworkAddress(address) {
  if (typeof address !== "string") return false;
  let ip = address.trim().toLowerCase();
  if (ip.startsWith("::ffff:") && net.isIPv4(ip.slice(7))) ip = ip.slice(7);
  if (net.isIPv4(ip)) {
    const [a, b] = parseIPv4(ip);
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (net.isIPv6(ip.split("%")[0])) {
    ip = ip.split("%")[0];
    if (ip === "::1") return true;
    const first = parseInt(ip.split(":")[0] || "0", 16);
    return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
  }
  return false;
}

function isTrustedHostHeader(host) {
  if (typeof host !== "string" || host.length === 0) return false;
  let name = host.trim().toLowerCase();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(name);
  if (bracketed) return net.isIPv6(bracketed[1]);
  name = name.replace(/:\d+$/, "");
  return name === "localhost" || net.isIPv4(name);
}

function rejectRequest(request, response) {
  request.resume();
  response.writeHead(403, { "Connection": "close", "Content-Type": "text/plain" });
  response.end("Forbidden: open ompweb by IP address from loopback, LAN or VPN.\n");
}

function installPrivateNetworkGuard() {
  const emit = net.Server.prototype.emit;
  net.Server.prototype.emit = function guardedEmit(event, ...args) {
    if (event === "connection" && !isPrivateNetworkAddress(args[0]?.remoteAddress)) {
      args[0]?.destroy();
      return true;
    }
    if (this instanceof http.Server) {
      if (event === "request" && !isTrustedHostHeader(args[0]?.headers?.host)) {
        rejectRequest(args[0], args[1]);
        return true;
      }
      if (event === "upgrade" && !isTrustedHostHeader(args[0]?.headers?.host)) {
        args[1]?.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
        return true;
      }
    }
    return emit.call(this, event, ...args);
  };
}

if (process.env.OMP_WEB_PRIVATE_NETWORK_ONLY === "1") installPrivateNetworkGuard();

module.exports = { isPrivateNetworkAddress, isTrustedHostHeader, installPrivateNetworkGuard };
