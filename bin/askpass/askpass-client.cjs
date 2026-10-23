"use strict";
// Started by omp-web-askpass (as sudo's askpass program). Sends sudo's prompt to
// omp-web's loopback askpass endpoint, waits for the user's answer in the web
// UI, and prints the password for sudo. Any failure exits 1, which sudo treats
// as "no password given".
const http = require("node:http");

const url = process.env.OMP_WEB_ASKPASS_URL;
const token = process.env.OMP_WEB_ASKPASS_TOKEN;
if (!url || !token) process.exit(1);

const body = JSON.stringify({ token, prompt: String(process.argv[2] ?? "") });
const request = http.request(url, {
  method: "POST",
  headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
}, (response) => {
  const chunks = [];
  response.on("data", (chunk) => chunks.push(chunk));
  response.on("end", () => {
    if (response.statusCode !== 200) process.exit(1);
    let password;
    try {
      password = JSON.parse(Buffer.concat(chunks).toString("utf8")).password;
    } catch {
      process.exit(1);
    }
    if (typeof password !== "string") process.exit(1);
    process.stdout.write(`${password}\n`, () => process.exit(0));
  });
});
request.on("error", () => process.exit(1));
request.end(body);
