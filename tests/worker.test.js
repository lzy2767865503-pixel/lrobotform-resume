import assert from "node:assert/strict";
import test from "node:test";

import worker, { __test } from "../src/worker.js";

function request(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("CF-Connecting-IP", init.ip || "192.0.2.10");
  return new Request(`https://resume.test${path}`, { ...init, headers });
}

test("health endpoint identifies the product and applies security headers", async () => {
  const response = await worker.fetch(request("/api/health"), {});
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.product, "Lrobotform Resume");
  assert.equal(payload.owner, "LAI ZEYU");
  assert.deepEqual(payload.outputs, ["ats", "visual"]);
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");
  assert.match(response.headers.get("Content-Security-Policy"), /frame-ancestors 'none'/);
});

test("cross-origin order writes are rejected before any storage access", async () => {
  const response = await worker.fetch(
    request("/api/resume-order", {
      method: "POST",
      headers: { Origin: "https://attacker.example" },
    }),
    {},
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { ok: false, error: "Forbidden." });
});

test("runner and administrator routes deny requests without their independent secrets", async () => {
  const runnerResponse = await worker.fetch(
    request("/api/resume-runner/next", { method: "POST" }),
    {},
  );
  const adminResponse = await worker.fetch(request("/api/admin/resume-orders"), {});

  assert.equal(runnerResponse.status, 401);
  assert.equal(adminResponse.status, 401);
  assert.equal((await runnerResponse.json()).error, "Unauthorized.");
  assert.equal((await adminResponse.json()).error, "Unauthorized.");
});

test("payment evidence signatures must match their declared file types", () => {
  const pngHeader = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const fakePng = Uint8Array.from([0x25, 0x50, 0x44, 0x46]);

  assert.equal(
    __test.proofSignatureIssue({ type: "image/png", name: "proof.png" }, pngHeader.buffer),
    "",
  );
  assert.equal(
    __test.proofSignatureIssue({ type: "image/png", name: "proof.png" }, fakePng.buffer),
    "png_header_mismatch",
  );
  assert.equal(
    __test.proofSignatureIssue({ type: "application/pdf", name: "proof.pdf" }, fakePng.buffer),
    "",
  );
});

test("completion requires two structurally valid PDFs and a passing content gate", () => {
  const header = new TextEncoder().encode("%PDF-1.7\n");
  const body = new Uint8Array(1900);
  const tail = new TextEncoder().encode("\n%%EOF");
  const pdf = new Uint8Array(header.length + body.length + tail.length);
  pdf.set(header);
  pdf.set(body, header.length);
  pdf.set(tail, header.length + body.length);

  assert.deepEqual(__test.validatePdf(pdf, "ATS"), { bytes: pdf.length, passed: true });
  assert.equal(
    __test.validateCompletionGate("ats.pdf", "visual.pdf", { quality: { passed: true } }),
    true,
  );
  assert.throws(
    () => __test.validateCompletionGate("ats.pdf", "", { quality: { passed: true } }),
    /Both ATS and visual PDFs are required/,
  );
  assert.throws(
    () => __test.validateCompletionGate("ats.pdf", "visual.pdf", { quality: { passed: false } }),
    /quality gate did not pass/,
  );
  assert.throws(
    () => __test.validatePdf(new TextEncoder().encode("%PDF-1.7\n%%EOF"), "Visual"),
    /too small/,
  );
});

test("exchange-rate lookup uses configured data or a bounded fallback without network dependence", async () => {
  let called = false;
  const configured = await __test.currentMyrCnyRate(
    { MYR_CNY_RATE: "1.61" },
    async () => {
      called = true;
      throw new Error("must not run");
    },
    5,
  );
  assert.equal(configured, 1.61);
  assert.equal(called, false);

  const unavailable = await __test.currentMyrCnyRate(
    {},
    async () => new Response("unavailable", { status: 503 }),
    5,
  );
  assert.equal(unavailable, 1.55);

  const started = Date.now();
  const timedOut = await __test.currentMyrCnyRate(
    {},
    async (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        );
      }),
    10,
  );
  assert.equal(timedOut, 1.55);
  assert.ok(Date.now() - started < 500, "fallback should not wait on an unbounded request");
});

test("rate-limit buckets expire instead of accumulating for the isolate lifetime", () => {
  __test.resetRateLimits();
  assert.equal(__test.rateLimited("client-a", 1, 60, 0), false);
  assert.equal(__test.rateLimited("client-a", 1, 60, 1), true);
  assert.equal(__test.rateLimitBucketCount(), 1);
  assert.equal(__test.pruneRateLimits(15 * 60 * 1000 + 1), 1);
  assert.equal(__test.rateLimitBucketCount(), 0);
  __test.resetRateLimits();
});
