/**
 * v0.11.0 (2026-11-12) — the HS_CYR_QUOTE branch (PFP GATEWAY G-8, hand-off H-51 item 1).
 *
 * A borrower on an MLO's Check Your Rate page who asks for the details becomes a Rello lead, and Home Scout
 * stores the quote they saw (`home_scout."CyrQuoteSubmission"`). This branch carries that stored quote to
 * PathfinderPro so the MLO sees the borrower's scenario in their pipeline.
 *
 * ⛔ A DISTINCT BRANCH. It is NOT a variant of the purchase/refinance payload: it is a separate strict object,
 * chosen by `source: "HS_CYR_QUOTE"` before any other schema runs (`parsePfpIntakeFromSpokeRequest`). It
 * therefore never inherits PURCHASE's required borrower fields (creditScore, employmentType, baseIncome,
 * militaryServiceType, isVeteran, bankruptcy / foreclosure). Check Your Rate asks none of them, and this
 * package never makes a sender invent one.
 *
 * ⛔ STRICT ENVELOPE (H-69). Every object on this branch refuses unknown keys — a `tenantId`, a `loanPurpose`,
 * a `creditScore` riding along is a 400, never silently stripped. The tenant is the receiver's to derive.
 *
 * contractVersion → v (H-69). Home Scout stores the Worker's `cyrQuote.v` in the column `contractVersion`.
 * `CYR_QUOTE_CONTRACT_VERSION_TO_V` is the mapping, stated: stored contractVersion 1 is sent as `v: 1`. A row
 * with any other contractVersion has no known shape and is not sendable (`cyrQuoteSendEligibility` names it).
 *
 * Idempotency (H-68). `sendIdempotencyKey` = "cyrq:" + base64url(sha256(submissionKey)) — the full 43-character
 * digest, untruncated, so every key is exactly 48 characters (inside the receiver's 64-character column limit)
 * whatever the submissionKey's length (Home Scout permits 8–100). The raw submissionKey is never the key. The
 * schema refuses a key that is not the hash of the payload's own `cyrQuote.submissionKey`, so a sender cannot
 * pair one quote with another quote's key.
 *
 * Nulls are values. `scenario.rows` is null unless `rowsStatus` is "stated", and never `[]`. Every status keeps
 * its own value; nothing here maps one status onto another.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
/** The branch discriminator. */
export const HS_CYR_QUOTE_SOURCE = "HS_CYR_QUOTE";
/** Prefix of every HS_CYR_QUOTE idempotency key. */
export const CYR_QUOTE_IDEMPOTENCY_PREFIX = "cyrq:";
/** Length of every HS_CYR_QUOTE idempotency key: "cyrq:" (5) + base64url sha256 (43) = 48. */
export const CYR_QUOTE_IDEMPOTENCY_KEY_LENGTH = 48;
/**
 * Stored `CyrQuoteSubmission.contractVersion` → the `cyrQuote.v` this package sends. Stated, not inferred:
 * a version missing from this table has no known shape.
 */
export const CYR_QUOTE_CONTRACT_VERSION_TO_V = Object.freeze({ 1: 1 });
/** Home Scout's submission-key shape (the Worker's `crypto.randomUUID`, or `hs_<uuid>`; 8–100 of [A-Za-z0-9_-]). */
export const CYR_SUBMISSION_KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;
const IDEMPOTENCY_KEY_RE = /^cyrq:[A-Za-z0-9_-]{43}$/;
/**
 * The idempotency key for a submission: "cyrq:" + base64url(sha256(submissionKey)), 48 characters.
 * Deterministic, so a replay of the same submission always sends the same key.
 * @throws when `submissionKey` is not a valid Home Scout submission key
 */
export function cyrQuoteIdempotencyKey(submissionKey) {
    if (typeof submissionKey !== "string" || !CYR_SUBMISSION_KEY_RE.test(submissionKey)) {
        throw new Error("cyrQuoteIdempotencyKey: submissionKey must match ^[A-Za-z0-9_-]{8,100}$");
    }
    const digest = createHash("sha256").update(submissionKey, "utf8").digest("base64url");
    return `${CYR_QUOTE_IDEMPOTENCY_PREFIX}${digest}`;
}
// ─── The stored scenario (mirrors Home Scout `src/lib/find-your-rate/cyr-quote.ts`, contract v1) ──────────
export const CYR_PRICING_STATUSES = [
    "priced",
    "pricing_off",
    "refused",
    "routed",
    "not_offered",
    "unavailable",
    "skipped_budget",
];
export const CYR_ROWS_STATUSES = [
    "stated",
    "pair_absent",
    "pair_unsupported",
    "pair_refused",
    "pair_malformed",
    "variant_refused",
    "not_priced",
];
/** Every status Home Scout can store for a submission. Only "stated" is sent. */
export const CYR_STORED_SCENARIO_STATUSES = [
    "stated",
    "answers_missing",
    "answers_invalid",
    "intake_unavailable",
    "unreadable",
];
const CONTROL_OR_MARKUP = /[\u0000-\u001f\u007f<>]/;
const text = (max) => z
    .string()
    .min(1)
    .max(max)
    .refine((s) => !CONTROL_OR_MARKUP.test(s), "control or markup character");
/** An answer key: the intake's own short identifiers. Home Scout's door holds the exact list. */
const ANSWER_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
export const CyrQuoteRowSchema = z
    .object({
    side: z.enum(["now", "monthly", "other"]),
    rate: text(16),
    apr: text(16),
    closing: text(24),
    closingKind: z.enum(["pay", "zero", "credit"]),
    monthly: text(24),
    monthlyTotal: text(24).nullable(),
    termMonths: z.number().int().min(1).max(600),
})
    .strict();
export const CyrQuoteScenarioSchema = z
    .object({
    answers: z
        .record(z.string(), text(64))
        .refine((a) => Object.keys(a).length >= 1 && Object.keys(a).length <= 32, "1 to 32 answers")
        .refine((a) => Object.keys(a).every((k) => ANSWER_KEY_RE.test(k)), "an answer key outside the intake's shape"),
    horizon: z.string().max(32),
    program: text(64).nullable(),
    pricingStatus: z.enum(CYR_PRICING_STATUSES),
    quotedAt: text(64).nullable(),
    rateType: text(64).nullable(),
    productName: text(120).nullable(),
    loanAmount: text(24).nullable(),
    downPaymentPct: text(16).nullable(),
    rowsStatus: z.enum(CYR_ROWS_STATUSES),
    rows: z.array(CyrQuoteRowSchema).min(1).max(12).nullable(),
})
    .strict()
    .refine((s) => (s.rowsStatus === "stated") === (s.rows !== null), "rows are present exactly when rowsStatus is stated (never [] for unknown)");
/** The quote as sent: a stored row whose scenarioStatus is "stated", verbatim. */
export const CyrQuoteSchema = z
    .object({
    v: z.literal(1),
    submissionKey: z.string().regex(CYR_SUBMISSION_KEY_RE),
    scenarioStatus: z.literal("stated"),
    scenario: CyrQuoteScenarioSchema,
})
    .strict();
// ─── The branch ────────────────────────────────────────────────────────────────────────────────────────────
export const HsCyrQuoteIntakePayloadSchema = z
    .object({
    source: z.literal(HS_CYR_QUOTE_SOURCE),
    /** The agent whose Check Your Rate page priced the quote (the PAGE agent, H-66). */
    agentSlug: z.string().min(1).max(120),
    /** The Rello lead the contact door forwarded to. Required: a submission without one is not sent. */
    relloLeadId: z.string().min(1).max(64),
    /**
     * H-52 / H-66: the Rello USER id that owns the lead, as Rello stated it. Required as a key so the sender states
     * it; null = Rello stated none (unknown, never the page's agent).
     */
    leadOwnerId: z.string().min(1).max(64).nullable(),
    /** "cyrq:" + base64url(sha256(cyrQuote.submissionKey)) — 48 characters (H-68). */
    sendIdempotencyKey: z.string().regex(IDEMPOTENCY_KEY_RE),
    // Contact (from the contact-door request; Home Scout stores none of it). Only what Check Your Rate asks.
    firstName: z.string().trim().min(1).max(80),
    email: z.string().email().max(200),
    lastName: z.string().trim().min(1).max(80).optional(),
    phone: z.string().min(7).max(40).optional(),
    cyrQuote: CyrQuoteSchema,
})
    .strict()
    .superRefine((data, ctx) => {
    // The key must be THIS quote's key — never another submission's, never the raw submissionKey.
    if (data.sendIdempotencyKey !== cyrQuoteIdempotencyKey(data.cyrQuote.submissionKey)) {
        ctx.addIssue({
            code: "custom",
            path: ["sendIdempotencyKey"],
            message: "sendIdempotencyKey must be cyrQuoteIdempotencyKey(cyrQuote.submissionKey)",
        });
    }
});
/**
 * Decide whether a stored row is sent, and build its `cyrQuote` verbatim when it is.
 * Only scenarioStatus "stated" rows with a relloLeadId and a known contractVersion are sent; every other row is
 * named by reason (unreadable, answers_missing, answers_invalid, intake_unavailable carry no scenario for PFP).
 * The scenario is copied, not reshaped: every status and every null survives (rows null stays null).
 */
export function cyrQuoteSendEligibility(row) {
    if (row.scenarioStatus !== "stated")
        return { eligible: false, reason: `scenario_status:${row.scenarioStatus}` };
    if (row.relloLeadId === null || row.relloLeadId === "")
        return { eligible: false, reason: "no_rello_lead" };
    const v = Object.prototype.hasOwnProperty.call(CYR_QUOTE_CONTRACT_VERSION_TO_V, row.contractVersion)
        ? CYR_QUOTE_CONTRACT_VERSION_TO_V[row.contractVersion]
        : undefined;
    if (v === undefined)
        return { eligible: false, reason: "contract_version_unknown" };
    const parsed = CyrQuoteSchema.safeParse({
        v,
        submissionKey: row.submissionKey,
        scenarioStatus: row.scenarioStatus,
        scenario: row.scenario,
    });
    if (!parsed.success)
        return { eligible: false, reason: "scenario_unreadable" };
    return { eligible: true, cyrQuote: parsed.data, sendIdempotencyKey: cyrQuoteIdempotencyKey(row.submissionKey) };
}
