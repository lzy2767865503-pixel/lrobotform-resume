// SPDX-License-Identifier: MIT
// Copyright (c) 2026 LAI ZEYU

const PRODUCT = "Lrobotform Resume";
const OWNER = "LAI ZEYU";
const RESUME_PRICE_MYR = 79;
const PAYMENT_TOLERANCE_CNY = 20;
const PAYMENT_CONFIDENCE_MIN = 0.72;
const PAYMENT_TAMPER_RISK_MAX = 0.28;
const DEFAULT_MYR_CNY_RATE = 1.55;
const MAX_PROOF_BYTES = 8 * 1024 * 1024;
const MAX_ORDER_BYTES = 9 * 1024 * 1024;
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const RUNNER_STALE_MINUTES = 30;
const FX_FETCH_TIMEOUT_MS = 5000;
const RATE_LIMIT_RETENTION_MS = 15 * 60 * 1000;
const MAX_RATE_LIMIT_BUCKETS = 4096;
const RATE_LIMITS = new Map();
let rateLimitChecks = 0;

function nowStamp() {
  return new Date().toISOString();
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function securityHeaders() {
  return {
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };
}

function withSecurity(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders())) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
}

function pruneRateLimits(now = Date.now()) {
  const cutoff = now - RATE_LIMIT_RETENTION_MS;
  let removed = 0;
  for (const [bucket, hits] of RATE_LIMITS) {
    if (!hits.length || hits[hits.length - 1] <= cutoff) {
      RATE_LIMITS.delete(bucket);
      removed += 1;
    }
  }
  return removed;
}

function rateLimited(bucket, limit, windowSeconds, now = Date.now()) {
  rateLimitChecks += 1;
  if (rateLimitChecks % 256 === 0) pruneRateLimits(now);
  if (!RATE_LIMITS.has(bucket) && RATE_LIMITS.size >= MAX_RATE_LIMIT_BUCKETS) {
    pruneRateLimits(now);
    if (RATE_LIMITS.size >= MAX_RATE_LIMIT_BUCKETS) {
      RATE_LIMITS.delete(RATE_LIMITS.keys().next().value);
    }
  }

  const cutoff = now - windowSeconds * 1000;
  const hits = (RATE_LIMITS.get(bucket) || []).filter((stamp) => stamp > cutoff);
  if (hits.length >= limit) {
    RATE_LIMITS.delete(bucket);
    RATE_LIMITS.set(bucket, hits);
    return true;
  }
  hits.push(now);
  RATE_LIMITS.delete(bucket);
  RATE_LIMITS.set(bucket, hits);
  return false;
}

function resetRateLimits() {
  RATE_LIMITS.clear();
  rateLimitChecks = 0;
}

function sameOriginBrowserWrite(request, url) {
  const origin = request.headers.get("Origin");
  if (origin) return origin === url.origin;
  const referer = request.headers.get("Referer");
  if (referer) {
    try {
      return new URL(referer).origin === url.origin;
    } catch {
      return false;
    }
  }
  return request.headers.get("Sec-Fetch-Site") === "same-origin";
}

function contentLengthTooLarge(request, limit) {
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  return Number.isFinite(contentLength) && contentLength > limit;
}

async function digestBytes(value) {
  const bytes =
    value instanceof ArrayBuffer
      ? value
      : value instanceof Uint8Array
        ? value
        : new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(byteLength = 24) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function secureCompare(left, right) {
  if (!left || !right) return false;
  const [leftHash, rightHash] = await Promise.all([digestBytes(left), digestBytes(right)]);
  return leftHash === rightHash;
}

function bearerToken(request) {
  return String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

async function runnerAuthorized(request, env) {
  return Boolean(env.RUNNER_SECRET) && secureCompare(bearerToken(request), env.RUNNER_SECRET);
}

async function adminAuthorized(request, env) {
  return Boolean(env.ADMIN_KEY) && secureCompare(bearerToken(request), env.ADMIN_KEY);
}

function safeFilename(value) {
  return (
    String(value || "payment-proof")
      .replace(/[/\\?%*:|"<>]+/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, 90) || "payment-proof"
  );
}

function proofMime(file) {
  const type = String(file?.type || "").toLowerCase();
  if (type) return type;
  const name = String(file?.name || "").toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function proofSupported(file) {
  return /^(image\/(png|jpe?g|webp)|application\/pdf)$/i.test(proofMime(file));
}

function proofSignatureIssue(file, buffer) {
  const mime = proofMime(file);
  const bytes = new Uint8Array(buffer || new ArrayBuffer(0));
  if (!bytes.length) return "empty_file";
  const startsWith = (...values) => values.every((value, index) => bytes[index] === value);
  if (mime === "application/pdf") return startsWith(0x25, 0x50, 0x44, 0x46) ? "" : "pdf_header_mismatch";
  if (mime === "image/png") {
    return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) ? "" : "png_header_mismatch";
  }
  if (mime === "image/jpeg" || mime === "image/jpg") return startsWith(0xff, 0xd8, 0xff) ? "" : "jpeg_header_mismatch";
  if (mime === "image/webp") {
    const riff = startsWith(0x52, 0x49, 0x46, 0x46);
    const webp = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    return riff && webp ? "" : "webp_header_mismatch";
  }
  return "unsupported_mime";
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const clean = String(value || "").replace(/^data:[^,]+,/, "").replace(/\s+/g, "");
  if (!clean) return new Uint8Array();
  const padded = clean.padEnd(Math.ceil(clean.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function money(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

async function currentMyrCnyRate(env, fetchImpl = fetch, timeoutMs = FX_FETCH_TIMEOUT_MS) {
  const configured = Number(env.MYR_CNY_RATE);
  if (Number.isFinite(configured) && configured > 0) return configured;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    const response = await fetchImpl("https://open.er-api.com/v6/latest/MYR", {
      cf: { cacheTtl: 900, cacheEverything: true },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`FX service HTTP ${response.status}`);
    const data = await response.json();
    const rate = Number(data?.rates?.CNY);
    if (Number.isFinite(rate) && rate > 0) return rate;
  } catch {
    // A conservative fallback keeps order intake available if the rate service is temporarily unavailable.
  } finally {
    clearTimeout(timeout);
  }
  return DEFAULT_MYR_CNY_RATE;
}

function amountToCny(amount, currency, rate) {
  if (!Number.isFinite(Number(amount))) return null;
  const normalized = String(currency || "").trim().toUpperCase();
  if (["CNY", "RMB", "¥", "人民币"].includes(normalized)) return Number(amount);
  if (["MYR", "RM", "马币"].includes(normalized)) return Number(amount) * rate;
  return null;
}

function parseJsonFromText(value) {
  const text = String(value || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  }
  throw new Error("Vision response was not valid JSON.");
}

function openAiOutputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n");
}

function normalizedRiskReasons(result) {
  const reasons = Array.isArray(result?.riskReasons) ? result.riskReasons : [];
  return reasons.map((reason) => String(reason || "").trim()).filter(Boolean).slice(0, 8);
}

async function analyzePaymentProof(env, file, buffer, expected, rate) {
  if (!env.OPENAI_API_KEY) {
    return {
      status: "review_needed",
      amount: null,
      currency: "",
      amountCny: null,
      differenceCny: null,
      confidence: 0,
      reference: "",
      notes: "Automated payment verification is not configured. Manual review is required.",
      raw: { source: "manual_review_no_vision_key" },
    };
  }

  const mime = proofMime(file);
  const base64 = arrayBufferToBase64(buffer);
  const low = Math.max(0, expected.expectedCny - PAYMENT_TOLERANCE_CNY);
  const high = expected.expectedCny + PAYMENT_TOLERANCE_CNY;
  const prompt = [
    "Verify whether this is a genuine, completed payment receipt for a resume service.",
    "Return JSON only with keys: isPaymentProof boolean, isSuccessfulPayment boolean, amount number|null, currency string, reference string, paymentStatus string, visibleTransactionTime string, confidence number 0-1, tamperRisk number 0-1, isEditedOrComposited boolean, isCroppedCriticalInfo boolean, amountTextConsistent boolean, riskReasons array, notes string.",
    `Expected price: ${expected.amount} ${expected.currency}; current equivalent: ${expected.expectedCny} CNY at ${rate} CNY per MYR.`,
    `The internal accepted CNY range is ${low.toFixed(2)} to ${high.toFixed(2)}.`,
    "Only identify a successful payment when amount, completed status, and coherent transaction context are visible.",
    "Set tamper risk higher when fonts, alignment, amount, status, time, or transaction reference appear edited, pasted, hidden, or inconsistent.",
    "If any material detail is uncertain, use a low confidence and request manual review.",
  ].join("\n");
  const content = [{ type: "input_text", text: prompt }];
  if (mime === "application/pdf") {
    content.push({
      type: "input_file",
      filename: safeFilename(file.name || "payment-proof.pdf"),
      file_data: `data:${mime};base64,${base64}`,
    });
  } else {
    content.push({
      type: "input_image",
      image_url: `data:${mime};base64,${base64}`,
      detail: env.OPENAI_IMAGE_DETAIL || "high",
    });
  }

  let lastError = "";
  const models = String(env.OPENAI_VISION_MODEL || "gpt-4.1-mini,gpt-4o-mini")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  for (const model of models) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: [{ role: "user", content }],
          max_output_tokens: 700,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastError = data?.error?.message || `OpenAI HTTP ${response.status}`;
        continue;
      }
      const parsed = parseJsonFromText(openAiOutputText(data));
      const amount = money(parsed.amount);
      const currency = String(parsed.currency || "").trim().toUpperCase();
      const amountCnyRaw = amountToCny(amount, currency, rate);
      const amountCny = amountCnyRaw === null ? null : money(amountCnyRaw);
      const differenceCny = amountCny === null ? null : money(amountCny - expected.expectedCny);
      const confidence = Math.max(0, Math.min(1, Number(parsed.confidence || 0)));
      const tamperRisk = Math.max(0, Math.min(1, Number(parsed.tamperRisk ?? 1)));
      const successful = parsed.isSuccessfulPayment === true;
      const edited = parsed.isEditedOrComposited === true;
      const cropped = parsed.isCroppedCriticalInfo === true;
      const amountConsistent = parsed.amountTextConsistent === true;
      const amountMatched = differenceCny !== null && Math.abs(differenceCny) <= PAYMENT_TOLERANCE_CNY;
      const autoApprove =
        parsed.isPaymentProof === true &&
        successful &&
        amountMatched &&
        confidence >= PAYMENT_CONFIDENCE_MIN &&
        tamperRisk <= PAYMENT_TAMPER_RISK_MAX &&
        !edited &&
        !cropped &&
        amountConsistent;
      return {
        status: autoApprove ? "verified" : "review_needed",
        amount,
        currency,
        amountCny,
        differenceCny,
        confidence,
        reference: String(parsed.reference || "").slice(0, 160),
        notes: String(parsed.notes || (autoApprove ? "Payment proof verified." : "Manual review required.")).slice(0, 500),
        raw: {
          ...parsed,
          source: "openai_vision",
          model,
          amountMatched,
          acceptedCnyRange: [money(low), money(high)],
          riskReasons: normalizedRiskReasons(parsed),
        },
      };
    } catch (error) {
      lastError = String(error?.message || error);
    }
  }

  return {
    status: "review_needed",
    amount: null,
    currency: "",
    amountCny: null,
    differenceCny: null,
    confidence: 0,
    reference: "",
    notes: "Automated verification was unavailable. Manual review is required.",
    raw: { source: "openai_vision_unavailable", error: lastError.slice(0, 300) },
  };
}

async function reserveProof(env, proofHash, orderId, file) {
  const existing = await env.DB.prepare(
    "SELECT order_id, created_at FROM payment_proof_fingerprints WHERE proof_hash = ? LIMIT 1",
  )
    .bind(proofHash)
    .first();
  if (existing) return { ok: false, existing };
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO payment_proof_fingerprints
      (proof_hash, order_id, created_at, updated_at, proof_filename, proof_size, payment_status)
     VALUES (?, ?, ?, ?, ?, ?, 'reserved')`,
  )
    .bind(proofHash, orderId, nowStamp(), nowStamp(), safeFilename(file.name), Number(file.size || 0))
    .run();
  return result?.meta?.changes ? { ok: true } : { ok: false, existing: { order_id: "another order" } };
}

async function addEvent(env, orderId, eventType, message, data = {}) {
  await env.DB.prepare(
    `INSERT INTO resume_events (id, resume_order_id, created_at, event_type, message, data_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), orderId, nowStamp(), eventType, message, JSON.stringify(data))
    .run();
}

async function createResumeJob(env, order) {
  const existing = await env.DB.prepare(
    "SELECT id FROM resume_jobs WHERE resume_order_id = ? AND status IN ('queued','running','completed') ORDER BY created_at DESC LIMIT 1",
  )
    .bind(order.id)
    .first();
  if (existing?.id) return existing.id;

  const jobId = crypto.randomUUID();
  const stamp = nowStamp();
  const config = {
    service: "resume_builder",
    owner: OWNER,
    outputs: ["ats", "visual"],
    qualityGate: "factual consistency + ATS readability + two valid PDFs",
  };
  await env.DB.prepare(
    `INSERT INTO resume_jobs
      (id, resume_order_id, created_at, updated_at, status, target_role, target_country,
       output_language, output_set, config_json, attempts)
     VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, 'ats,visual', ?, 0)`,
  )
    .bind(
      jobId,
      order.id,
      stamp,
      stamp,
      order.targetRole || "",
      order.targetCountry || "",
      order.outputLanguage || "en",
      JSON.stringify(config),
    )
    .run();
  await env.DB.prepare(
    `UPDATE resume_orders
     SET status = 'queued', job_status = 'queued', job_id = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(jobId, stamp, order.id)
    .run();
  await addEvent(env, order.id, "resume_job_queued", "Resume generation job queued.", { jobId });
  return jobId;
}

function cleanResumeText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, 30000);
}

async function handleResumeOrder(request, env) {
  const ipKey = (await digestBytes(clientIp(request))).slice(0, 16);
  if (rateLimited(`resume-order:${ipKey}`, 6, 15 * 60)) {
    return json({ ok: false, error: "Too many submissions. Please try again later." }, 429);
  }

  const form = await request.formData();
  const contact = String(form.get("contact") || "").trim().slice(0, 160);
  const targetRole = String(form.get("targetRole") || "").trim().slice(0, 180);
  const targetCountry = String(form.get("targetCountry") || "").trim().slice(0, 120);
  const outputLanguage = ["en", "zh"].includes(String(form.get("outputLanguage"))) ? String(form.get("outputLanguage")) : "en";
  const resumeText = cleanResumeText(form.get("resumeText"));
  const notes = String(form.get("notes") || "").trim().slice(0, 1000);
  const contentAck = ["on", "true", "1"].includes(String(form.get("contentAck") || ""));
  const paymentAck = ["on", "true", "1"].includes(String(form.get("paymentAck") || ""));
  const honeypot = String(form.get("companyWebsite") || "").trim();
  const submittedAt = Number(form.get("submittedAt") || 0);
  const proof = form.get("paymentProof");
  const formAge = Date.now() - submittedAt;

  if (honeypot) throw new Error("Submission rejected.");
  if (!Number.isFinite(formAge) || formAge < 700 || formAge > 6 * 60 * 60 * 1000) {
    throw new Error("The page expired. Refresh and submit again.");
  }
  if (!contact) throw new Error("Contact information is required.");
  if (!targetRole) throw new Error("A target role is required.");
  if (resumeText.length < 80) throw new Error("Provide at least 80 characters of resume source material.");
  if (!contentAck || !paymentAck) throw new Error("Both confirmations are required.");
  if (!(proof instanceof File) || !proof.size) throw new Error("A payment proof is required.");
  if (proof.size > MAX_PROOF_BYTES) throw new Error("Payment proof must be 8 MB or smaller.");
  if (!proofSupported(proof)) throw new Error("Use a PNG, JPG, WebP, or PDF payment proof.");

  const orderId = crypto.randomUUID();
  const accessToken = randomToken();
  const accessTokenHash = await digestBytes(accessToken);
  const trackingCode = `${orderId}.${accessToken}`;
  const proofBuffer = await proof.arrayBuffer();
  const signatureIssue = proofSignatureIssue(proof, proofBuffer);
  if (signatureIssue) throw new Error("The uploaded file signature does not match its file type.");
  const proofHash = await digestBytes(proofBuffer);
  const reservation = await reserveProof(env, proofHash, orderId, proof);
  if (!reservation.ok) {
    return json({ ok: false, error: "This payment proof has already been used for another order." }, 409);
  }

  const proofKey = `resume-orders/${orderId}/payment-${Date.now()}-${safeFilename(proof.name)}`;
  let proofStored = false;
  let orderStored = false;
  try {
    await env.ORDER_FILES.put(proofKey, proofBuffer, {
      httpMetadata: { contentType: proofMime(proof) },
      customMetadata: {
        resumeOrderId: orderId,
        filename: safeFilename(proof.name),
        proofHash,
      },
    });
    proofStored = true;

    const rate = await currentMyrCnyRate(env);
    const expectedCny = money(RESUME_PRICE_MYR * rate);
    const expected = { amount: RESUME_PRICE_MYR, currency: "MYR", expectedCny };
    const analysis = await analyzePaymentProof(env, proof, proofBuffer, expected, rate);
    const paymentStatus = analysis.status;
    const status = paymentStatus === "verified" ? "payment_verified" : "review_needed";
    const stamp = nowStamp();

    await env.DB.prepare(
      `INSERT INTO resume_orders
        (id, access_token_hash, created_at, updated_at, contact, target_role, target_country,
         output_language, raw_resume_text, notes, status, payment_status, expected_amount,
         expected_currency, expected_cny, tolerance_cny, payment_amount, payment_currency,
         payment_cny, payment_difference_cny, payment_confidence, payment_reference,
         payment_notes, payment_analysis_json, proof_key, proof_hash, proof_filename,
         proof_content_type, proof_size, content_ack, payment_ack)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        orderId,
        accessTokenHash,
        stamp,
        stamp,
        contact,
        targetRole,
        targetCountry,
        outputLanguage,
        resumeText,
        notes,
        status,
        paymentStatus,
        RESUME_PRICE_MYR,
        "MYR",
        expectedCny,
        PAYMENT_TOLERANCE_CNY,
        analysis.amount,
        analysis.currency,
        analysis.amountCny,
        analysis.differenceCny,
        analysis.confidence,
        analysis.reference,
        analysis.notes,
        JSON.stringify(analysis.raw || {}),
        proofKey,
        proofHash,
        safeFilename(proof.name),
        proofMime(proof),
        proof.size,
        1,
        1,
      )
      .run();
    orderStored = true;

    await env.DB.prepare(
      `UPDATE payment_proof_fingerprints
       SET updated_at = ?, payment_status = ?, payment_reference = ?, payment_amount = ?, payment_currency = ?
       WHERE proof_hash = ?`,
    )
      .bind(stamp, paymentStatus, analysis.reference || "", analysis.amount, analysis.currency || "", proofHash)
      .run();
    await addEvent(env, orderId, "resume_order_created", "Resume order received.", {
      paymentStatus,
      expectedCny,
    });

    let jobId = "";
    if (paymentStatus === "verified") {
      jobId = await createResumeJob(env, {
        id: orderId,
        targetRole,
        targetCountry,
        outputLanguage,
      });
    }
    return json({
      ok: true,
      id: trackingCode,
      status: jobId ? "queued" : status,
      paymentStatus,
      jobId,
      expected: { amount: RESUME_PRICE_MYR, currency: "MYR" },
      outputs: ["ats", "visual"],
    });
  } catch (error) {
    if (!orderStored) {
      await env.DB.prepare("DELETE FROM payment_proof_fingerprints WHERE proof_hash = ? AND order_id = ?")
        .bind(proofHash, orderId)
        .run()
        .catch(() => {});
      if (proofStored) await env.ORDER_FILES.delete(proofKey).catch(() => {});
    }
    throw error;
  }
}

function splitTrackingCode(value) {
  const code = String(value || "").trim();
  const separator = code.lastIndexOf(".");
  if (separator < 1) return null;
  return { orderId: code.slice(0, separator), token: code.slice(separator + 1), code };
}

async function orderFromTrackingCode(env, value) {
  const tracking = splitTrackingCode(value);
  if (!tracking) return null;
  const row = await env.DB.prepare("SELECT * FROM resume_orders WHERE id = ?").bind(tracking.orderId).first();
  if (!row) return null;
  const suppliedHash = await digestBytes(tracking.token);
  if (!(await secureCompare(suppliedHash, row.access_token_hash))) return null;
  return { row, tracking };
}

function parseJsonSafe(value, fallback = {}) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return fallback;
  }
}

async function handleResumeStatus(request, env) {
  const result = await orderFromTrackingCode(env, new URL(request.url).searchParams.get("id"));
  if (!result) return json({ ok: false, error: "Order not found or access code is invalid." }, 404);
  const { row, tracking } = result;
  const job = await env.DB.prepare(
    "SELECT * FROM resume_jobs WHERE resume_order_id = ? ORDER BY created_at DESC LIMIT 1",
  )
    .bind(row.id)
    .first();
  const runnerResult = parseJsonSafe(job?.result_json, {});
  const downloads = {};
  if (job?.status === "completed" && job.ats_pdf_key && job.visual_pdf_key) {
    const encoded = encodeURIComponent(tracking.code);
    downloads.ats = `/api/resume-download?id=${encoded}&type=ats`;
    downloads.visual = `/api/resume-download?id=${encoded}&type=visual`;
  }
  return json({
    ok: true,
    id: tracking.code,
    status: row.status,
    paymentStatus: row.payment_status,
    jobStatus: job?.status || row.job_status || "",
    summary: row.job_summary || job?.error || runnerResult.summary || "",
    stage: runnerResult.stage || "",
    quality: runnerResult.quality || null,
    downloads,
  });
}

async function handleResumeDownload(request, env) {
  const url = new URL(request.url);
  const result = await orderFromTrackingCode(env, url.searchParams.get("id"));
  const type = String(url.searchParams.get("type") || "");
  if (!result || !["ats", "visual"].includes(type)) return json({ ok: false, error: "Invalid download request." }, 404);
  const job = await env.DB.prepare(
    "SELECT * FROM resume_jobs WHERE resume_order_id = ? ORDER BY created_at DESC LIMIT 1",
  )
    .bind(result.row.id)
    .first();
  const key = type === "ats" ? job?.ats_pdf_key : job?.visual_pdf_key;
  if (!key || job.status !== "completed") return json({ ok: false, error: "PDF is not ready." }, 404);
  const object = await env.ORDER_FILES.get(key);
  if (!object) return json({ ok: false, error: "PDF file was not found." }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `attachment; filename="lrobotform-${type}-resume.pdf"`);
  return new Response(object.body, { headers });
}

async function handleRunnerNext(request, env) {
  if (!(await runnerAuthorized(request, env))) return json({ ok: false, error: "Unauthorized." }, 401);
  const staleCutoff = new Date(Date.now() - RUNNER_STALE_MINUTES * 60 * 1000).toISOString();
  await env.DB.prepare(
    `UPDATE resume_jobs
     SET status = 'queued', updated_at = ?, lease_token = '',
         error = 'Previous runner lease expired; job recovered automatically.'
     WHERE status = 'running' AND updated_at < ?`,
  )
    .bind(nowStamp(), staleCutoff)
    .run();

  const job = await env.DB.prepare(
    `SELECT j.*, o.raw_resume_text, o.notes
     FROM resume_jobs j
     JOIN resume_orders o ON o.id = j.resume_order_id
     WHERE j.status = 'queued' AND o.payment_status = 'verified'
     ORDER BY j.created_at ASC
     LIMIT 1`,
  ).first();
  if (!job) return json({ ok: true, job: null });
  const stamp = nowStamp();
  const leaseToken = randomToken();
  const claimed = await env.DB.prepare(
    `UPDATE resume_jobs
     SET status = 'running', updated_at = ?, attempts = attempts + 1, error = '', lease_token = ?
     WHERE id = ? AND status = 'queued'`,
  )
    .bind(stamp, leaseToken, job.id)
    .run();
  if (!claimed?.meta?.changes) return json({ ok: true, job: null });
  await env.DB.prepare(
    "UPDATE resume_orders SET status = 'running', job_status = 'running', updated_at = ? WHERE id = ?",
  )
    .bind(stamp, job.resume_order_id)
    .run();
  await addEvent(env, job.resume_order_id, "resume_job_started", "AWS runner claimed the job.", {
    jobId: job.id,
  });
  return json({
    ok: true,
    job: {
      id: job.id,
      leaseToken,
      orderId: job.resume_order_id,
      targetRole: job.target_role || "",
      targetCountry: job.target_country || "",
      outputLanguage: job.output_language || "en",
      outputs: String(job.output_set || "").split(",").filter(Boolean),
      resumeText: job.raw_resume_text || "",
      notes: job.notes || "",
      config: parseJsonSafe(job.config_json, {}),
    },
  });
}

function validatePdf(bytes, label) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (data.length < 1800) throw new Error(`${label} PDF is too small.`);
  if (data.length > MAX_PDF_BYTES) throw new Error(`${label} PDF exceeds 5 MB.`);
  const header = new TextDecoder("latin1").decode(data.slice(0, 8));
  const tail = new TextDecoder("latin1").decode(data.slice(-1024));
  if (!header.startsWith("%PDF-") || !tail.includes("%%EOF")) throw new Error(`${label} output is not a complete PDF.`);
  return { bytes: data.length, passed: true };
}

function validateCompletionGate(atsKey, visualKey, result) {
  if (!atsKey || !visualKey) throw new Error("Both ATS and visual PDFs are required.");
  if (result?.quality?.passed !== true) throw new Error("The resume quality gate did not pass.");
  return true;
}

async function storeRunnerPdf(env, orderId, jobId, type, payload) {
  const encoded = payload?.[`${type}PdfBase64`];
  if (!encoded) return "";
  const bytes = base64ToBytes(encoded);
  validatePdf(bytes, type.toUpperCase());
  const key = `resume-outputs/${orderId}/${jobId}/${type}.pdf`;
  await env.ORDER_FILES.put(key, bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { resumeOrderId: orderId, jobId, type },
  });
  return key;
}

async function handleRunnerUpdate(request, env) {
  if (!(await runnerAuthorized(request, env))) return json({ ok: false, error: "Unauthorized." }, 401);
  const payload = await request.json().catch(() => ({}));
  const jobId = String(payload.jobId || "").trim();
  const leaseToken = String(payload.leaseToken || "").trim();
  const requestedStatus = String(payload.status || "").trim();
  if (!jobId || !leaseToken || !["running", "completed", "failed", "cancelled"].includes(requestedStatus)) {
    return json({ ok: false, error: "Invalid runner update." }, 400);
  }
  const job = await env.DB.prepare("SELECT * FROM resume_jobs WHERE id = ?").bind(jobId).first();
  if (!job) return json({ ok: false, error: "Resume job not found." }, 404);
  if (!(await secureCompare(leaseToken, job.lease_token))) {
    return json({ ok: false, error: "Runner lease expired or was replaced." }, 409);
  }

  const result = payload.result && typeof payload.result === "object" ? payload.result : {};
  let status = requestedStatus;
  let error = String(payload.error || "").slice(0, 1000);
  let atsKey = job.ats_pdf_key || "";
  let visualKey = job.visual_pdf_key || "";
  if (requestedStatus === "completed") {
    try {
      atsKey = (await storeRunnerPdf(env, job.resume_order_id, jobId, "ats", payload)) || atsKey;
      visualKey = (await storeRunnerPdf(env, job.resume_order_id, jobId, "visual", payload)) || visualKey;
      validateCompletionGate(atsKey, visualKey, result);
    } catch (validationError) {
      status = "failed";
      error = String(validationError?.message || validationError).slice(0, 1000);
      result.failureClass = "resume_delivery_validation";
      result.summary = error;
    }
  }

  const stamp = nowStamp();
  await env.DB.prepare(
    `UPDATE resume_jobs
     SET status = ?, updated_at = ?, result_json = ?, error = ?, ats_pdf_key = ?, visual_pdf_key = ?
     WHERE id = ?`,
  )
    .bind(status, stamp, JSON.stringify(result), error, atsKey, visualKey, jobId)
    .run();
  const orderStatus = status === "completed" ? "completed" : status === "failed" ? "failed" : status;
  await env.DB.prepare(
    `UPDATE resume_orders
     SET status = ?, job_status = ?, job_summary = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(orderStatus, status, String(result.summary || error || "").slice(0, 1000), stamp, job.resume_order_id)
    .run();
  await addEvent(env, job.resume_order_id, `resume_runner_${status}`, `Runner status: ${status}.`, {
    jobId,
    hasAtsPdf: Boolean(atsKey),
    hasVisualPdf: Boolean(visualKey),
  });
  return json({ ok: true, status, atsPdfKey: atsKey, visualPdfKey: visualKey });
}

async function handleAdminOrders(request, env) {
  if (!(await adminAuthorized(request, env))) return json({ ok: false, error: "Unauthorized." }, 401);
  const requestedLimit = Number(new URL(request.url).searchParams.get("limit") || 50);
  const limit = Math.max(1, Math.min(100, Number.isFinite(requestedLimit) ? requestedLimit : 50));
  const { results = [] } = await env.DB.prepare(
    `SELECT id, created_at, updated_at, contact, target_role, target_country, output_language,
            status, payment_status, expected_amount, expected_currency, payment_amount,
            payment_currency, payment_confidence, payment_reference, payment_notes,
            proof_filename, proof_hash, job_status, job_id, job_summary
     FROM resume_orders
     ORDER BY created_at DESC
     LIMIT ?`,
  )
    .bind(limit)
    .all();
  return json({
    ok: true,
    owner: OWNER,
    orders: results.map((row) => ({
      ...row,
      proof_hash: row.proof_hash ? String(row.proof_hash).slice(0, 16) : "",
    })),
  });
}

async function handleAdminProof(request, env) {
  if (!(await adminAuthorized(request, env))) return json({ ok: false, error: "Unauthorized." }, 401);
  const id = String(new URL(request.url).searchParams.get("id") || "");
  const row = await env.DB.prepare(
    "SELECT proof_key, proof_filename, proof_content_type FROM resume_orders WHERE id = ?",
  )
    .bind(id)
    .first();
  if (!row?.proof_key) return json({ ok: false, error: "Proof not found." }, 404);
  const object = await env.ORDER_FILES.get(row.proof_key);
  if (!object) return json({ ok: false, error: "Proof not found." }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", row.proof_content_type || "application/octet-stream");
  headers.set("Content-Disposition", `inline; filename="${encodeURIComponent(row.proof_filename || "proof")}"`);
  return new Response(object.body, { headers });
}

async function handleAdminAction(request, env, orderId, action) {
  if (!(await adminAuthorized(request, env))) return json({ ok: false, error: "Unauthorized." }, 401);
  const row = await env.DB.prepare("SELECT * FROM resume_orders WHERE id = ?").bind(orderId).first();
  if (!row) return json({ ok: false, error: "Resume order not found." }, 404);
  const stamp = nowStamp();

  if (action === "approve") {
    const jobId = await createResumeJob(env, {
      id: row.id,
      targetRole: row.target_role,
      targetCountry: row.target_country,
      outputLanguage: row.output_language,
    });
    await env.DB.prepare(
      `UPDATE resume_orders
       SET payment_status = 'verified', status = 'queued', job_status = 'queued',
           job_id = ?, updated_at = ?
       WHERE id = ?`,
    )
      .bind(jobId, stamp, row.id)
      .run();
    await addEvent(env, row.id, "payment_manually_approved", "Payment approved by the owner.", { jobId });
    return json({ ok: true, jobId });
  }

  if (action === "reject") {
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE resume_orders SET payment_status = 'rejected', status = 'payment_rejected', job_status = 'cancelled', updated_at = ? WHERE id = ?",
      ).bind(stamp, row.id),
      env.DB.prepare(
        "UPDATE resume_jobs SET status = 'cancelled', updated_at = ?, error = 'Payment rejected by owner.' WHERE resume_order_id = ? AND status IN ('queued','running')",
      ).bind(stamp, row.id),
    ]);
    await addEvent(env, row.id, "payment_rejected", "Payment rejected by the owner.", {});
    return json({ ok: true });
  }

  if (action === "retry") {
    if (row.payment_status !== "verified") return json({ ok: false, error: "Payment must be verified before retry." }, 409);
    const failedJob = await env.DB.prepare(
      "SELECT id FROM resume_jobs WHERE resume_order_id = ? AND status IN ('failed','cancelled') ORDER BY created_at DESC LIMIT 1",
    )
      .bind(row.id)
      .first();
    if (!failedJob?.id) return json({ ok: false, error: "No failed job is available to retry." }, 409);
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE resume_jobs SET status = 'queued', updated_at = ?, lease_token = '', error = '', result_json = '{}' WHERE id = ?",
      ).bind(stamp, failedJob.id),
      env.DB.prepare(
        "UPDATE resume_orders SET status = 'queued', job_status = 'queued', job_id = ?, job_summary = '', updated_at = ? WHERE id = ?",
      ).bind(failedJob.id, stamp, row.id),
    ]);
    await addEvent(env, row.id, "resume_job_retried", "Failed resume job requeued by the owner.", {
      jobId: failedJob.id,
    });
    return json({ ok: true, jobId: failedJob.id });
  }

  return json({ ok: false, error: "Unknown action." }, 404);
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  if (request.method === "POST" && url.pathname === "/api/resume-order") {
    if (!sameOriginBrowserWrite(request, url)) return json({ ok: false, error: "Forbidden." }, 403);
    if (contentLengthTooLarge(request, MAX_ORDER_BYTES)) return json({ ok: false, error: "Upload is too large." }, 413);
    return handleResumeOrder(request, env);
  }
  if (request.method === "GET" && url.pathname === "/api/resume-status") return handleResumeStatus(request, env);
  if (request.method === "GET" && url.pathname === "/api/resume-download") return handleResumeDownload(request, env);
  if (request.method === "POST" && url.pathname === "/api/resume-runner/next") return handleRunnerNext(request, env);
  if (request.method === "POST" && url.pathname === "/api/resume-runner/update") {
    if (contentLengthTooLarge(request, 14 * 1024 * 1024)) return json({ ok: false, error: "Runner update is too large." }, 413);
    return handleRunnerUpdate(request, env);
  }
  if (request.method === "GET" && url.pathname === "/api/admin/resume-orders") return handleAdminOrders(request, env);
  if (request.method === "GET" && url.pathname === "/api/admin/resume-proof") return handleAdminProof(request, env);
  const adminAction = url.pathname.match(/^\/api\/admin\/resume-orders\/([0-9a-f-]+)\/(approve|reject|retry)$/i);
  if (request.method === "POST" && adminAction) {
    return handleAdminAction(request, env, adminAction[1], adminAction[2].toLowerCase());
  }
  if (request.method === "GET" && url.pathname === "/api/health") {
    return json({
      ok: true,
      product: PRODUCT,
      owner: OWNER,
      outputs: ["ats", "visual"],
      pipeline: "resume-v3-private-proof-quality-gated",
    });
  }
  return json({ ok: false, error: "Not found." }, 404);
}

export const __test = Object.freeze({
  currentMyrCnyRate,
  pruneRateLimits,
  proofSignatureIssue,
  rateLimitBucketCount: () => RATE_LIMITS.size,
  rateLimited,
  resetRateLimits,
  sameOriginBrowserWrite,
  validateCompletionGate,
  validatePdf,
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ipKey = (await digestBytes(clientIp(request))).slice(0, 16);
    if (rateLimited(`all:${ipKey}`, 240, 60)) {
      return withSecurity(json({ ok: false, error: "Too many requests." }, 429));
    }

    if (url.pathname.startsWith("/api/")) {
      try {
        return withSecurity(await handleApi(request, env));
      } catch (error) {
        return withSecurity(json({ ok: false, error: String(error?.message || "Request failed.").slice(0, 500) }, 400));
      }
    }

    if (url.pathname === "/favicon.ico") {
      return withSecurity(await env.ASSETS.fetch(new Request(new URL("/assets/lrobotform-logo.png", url), request)));
    }
    return withSecurity(await env.ASSETS.fetch(request));
  },
};
