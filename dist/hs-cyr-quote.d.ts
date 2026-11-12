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
import { z } from "zod";
/** The branch discriminator. */
export declare const HS_CYR_QUOTE_SOURCE: "HS_CYR_QUOTE";
/** Prefix of every HS_CYR_QUOTE idempotency key. */
export declare const CYR_QUOTE_IDEMPOTENCY_PREFIX: "cyrq:";
/** Length of every HS_CYR_QUOTE idempotency key: "cyrq:" (5) + base64url sha256 (43) = 48. */
export declare const CYR_QUOTE_IDEMPOTENCY_KEY_LENGTH = 48;
/**
 * Stored `CyrQuoteSubmission.contractVersion` → the `cyrQuote.v` this package sends. Stated, not inferred:
 * a version missing from this table has no known shape.
 */
export declare const CYR_QUOTE_CONTRACT_VERSION_TO_V: Readonly<Record<number, 1>>;
/** Home Scout's submission-key shape (the Worker's `crypto.randomUUID`, or `hs_<uuid>`; 8–100 of [A-Za-z0-9_-]). */
export declare const CYR_SUBMISSION_KEY_RE: RegExp;
/**
 * The idempotency key for a submission: "cyrq:" + base64url(sha256(submissionKey)), 48 characters.
 * Deterministic, so a replay of the same submission always sends the same key.
 * @throws when `submissionKey` is not a valid Home Scout submission key
 */
export declare function cyrQuoteIdempotencyKey(submissionKey: string): string;
export declare const CYR_PRICING_STATUSES: readonly ["priced", "pricing_off", "refused", "routed", "not_offered", "unavailable", "skipped_budget"];
export declare const CYR_ROWS_STATUSES: readonly ["stated", "pair_absent", "pair_unsupported", "pair_refused", "pair_malformed", "variant_refused", "not_priced"];
/** Every status Home Scout can store for a submission. Only "stated" is sent. */
export declare const CYR_STORED_SCENARIO_STATUSES: readonly ["stated", "answers_missing", "answers_invalid", "intake_unavailable", "unreadable"];
export declare const CyrQuoteRowSchema: z.ZodObject<{
    side: z.ZodEnum<{
        now: "now";
        monthly: "monthly";
        other: "other";
    }>;
    rate: z.ZodString;
    apr: z.ZodString;
    closing: z.ZodString;
    closingKind: z.ZodEnum<{
        pay: "pay";
        zero: "zero";
        credit: "credit";
    }>;
    monthly: z.ZodString;
    monthlyTotal: z.ZodNullable<z.ZodString>;
    termMonths: z.ZodNumber;
}, z.core.$strict>;
export declare const CyrQuoteScenarioSchema: z.ZodObject<{
    answers: z.ZodRecord<z.ZodString, z.ZodString>;
    horizon: z.ZodString;
    program: z.ZodNullable<z.ZodString>;
    pricingStatus: z.ZodEnum<{
        priced: "priced";
        pricing_off: "pricing_off";
        refused: "refused";
        routed: "routed";
        not_offered: "not_offered";
        unavailable: "unavailable";
        skipped_budget: "skipped_budget";
    }>;
    quotedAt: z.ZodNullable<z.ZodString>;
    rateType: z.ZodNullable<z.ZodString>;
    productName: z.ZodNullable<z.ZodString>;
    loanAmount: z.ZodNullable<z.ZodString>;
    downPaymentPct: z.ZodNullable<z.ZodString>;
    rowsStatus: z.ZodEnum<{
        stated: "stated";
        pair_absent: "pair_absent";
        pair_unsupported: "pair_unsupported";
        pair_refused: "pair_refused";
        pair_malformed: "pair_malformed";
        variant_refused: "variant_refused";
        not_priced: "not_priced";
    }>;
    rows: z.ZodNullable<z.ZodArray<z.ZodObject<{
        side: z.ZodEnum<{
            now: "now";
            monthly: "monthly";
            other: "other";
        }>;
        rate: z.ZodString;
        apr: z.ZodString;
        closing: z.ZodString;
        closingKind: z.ZodEnum<{
            pay: "pay";
            zero: "zero";
            credit: "credit";
        }>;
        monthly: z.ZodString;
        monthlyTotal: z.ZodNullable<z.ZodString>;
        termMonths: z.ZodNumber;
    }, z.core.$strict>>>;
}, z.core.$strict>;
/** The quote as sent: a stored row whose scenarioStatus is "stated", verbatim. */
export declare const CyrQuoteSchema: z.ZodObject<{
    v: z.ZodLiteral<1>;
    submissionKey: z.ZodString;
    scenarioStatus: z.ZodLiteral<"stated">;
    scenario: z.ZodObject<{
        answers: z.ZodRecord<z.ZodString, z.ZodString>;
        horizon: z.ZodString;
        program: z.ZodNullable<z.ZodString>;
        pricingStatus: z.ZodEnum<{
            priced: "priced";
            pricing_off: "pricing_off";
            refused: "refused";
            routed: "routed";
            not_offered: "not_offered";
            unavailable: "unavailable";
            skipped_budget: "skipped_budget";
        }>;
        quotedAt: z.ZodNullable<z.ZodString>;
        rateType: z.ZodNullable<z.ZodString>;
        productName: z.ZodNullable<z.ZodString>;
        loanAmount: z.ZodNullable<z.ZodString>;
        downPaymentPct: z.ZodNullable<z.ZodString>;
        rowsStatus: z.ZodEnum<{
            stated: "stated";
            pair_absent: "pair_absent";
            pair_unsupported: "pair_unsupported";
            pair_refused: "pair_refused";
            pair_malformed: "pair_malformed";
            variant_refused: "variant_refused";
            not_priced: "not_priced";
        }>;
        rows: z.ZodNullable<z.ZodArray<z.ZodObject<{
            side: z.ZodEnum<{
                now: "now";
                monthly: "monthly";
                other: "other";
            }>;
            rate: z.ZodString;
            apr: z.ZodString;
            closing: z.ZodString;
            closingKind: z.ZodEnum<{
                pay: "pay";
                zero: "zero";
                credit: "credit";
            }>;
            monthly: z.ZodString;
            monthlyTotal: z.ZodNullable<z.ZodString>;
            termMonths: z.ZodNumber;
        }, z.core.$strict>>>;
    }, z.core.$strict>;
}, z.core.$strict>;
export declare const HsCyrQuoteIntakePayloadSchema: z.ZodObject<{
    source: z.ZodLiteral<"HS_CYR_QUOTE">;
    agentSlug: z.ZodString;
    relloLeadId: z.ZodString;
    leadOwnerId: z.ZodNullable<z.ZodString>;
    sendIdempotencyKey: z.ZodString;
    firstName: z.ZodString;
    email: z.ZodString;
    lastName: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    cyrQuote: z.ZodObject<{
        v: z.ZodLiteral<1>;
        submissionKey: z.ZodString;
        scenarioStatus: z.ZodLiteral<"stated">;
        scenario: z.ZodObject<{
            answers: z.ZodRecord<z.ZodString, z.ZodString>;
            horizon: z.ZodString;
            program: z.ZodNullable<z.ZodString>;
            pricingStatus: z.ZodEnum<{
                priced: "priced";
                pricing_off: "pricing_off";
                refused: "refused";
                routed: "routed";
                not_offered: "not_offered";
                unavailable: "unavailable";
                skipped_budget: "skipped_budget";
            }>;
            quotedAt: z.ZodNullable<z.ZodString>;
            rateType: z.ZodNullable<z.ZodString>;
            productName: z.ZodNullable<z.ZodString>;
            loanAmount: z.ZodNullable<z.ZodString>;
            downPaymentPct: z.ZodNullable<z.ZodString>;
            rowsStatus: z.ZodEnum<{
                stated: "stated";
                pair_absent: "pair_absent";
                pair_unsupported: "pair_unsupported";
                pair_refused: "pair_refused";
                pair_malformed: "pair_malformed";
                variant_refused: "variant_refused";
                not_priced: "not_priced";
            }>;
            rows: z.ZodNullable<z.ZodArray<z.ZodObject<{
                side: z.ZodEnum<{
                    now: "now";
                    monthly: "monthly";
                    other: "other";
                }>;
                rate: z.ZodString;
                apr: z.ZodString;
                closing: z.ZodString;
                closingKind: z.ZodEnum<{
                    pay: "pay";
                    zero: "zero";
                    credit: "credit";
                }>;
                monthly: z.ZodString;
                monthlyTotal: z.ZodNullable<z.ZodString>;
                termMonths: z.ZodNumber;
            }, z.core.$strict>>>;
        }, z.core.$strict>;
    }, z.core.$strict>;
}, z.core.$strict>;
export type HsCyrQuoteIntakePayload = z.infer<typeof HsCyrQuoteIntakePayloadSchema>;
export type CyrQuote = z.infer<typeof CyrQuoteSchema>;
export type CyrQuoteScenario = z.infer<typeof CyrQuoteScenarioSchema>;
export type CyrQuoteRow = z.infer<typeof CyrQuoteRowSchema>;
/** The columns of `home_scout."CyrQuoteSubmission"` this package reads. */
export interface StoredCyrQuoteSubmission {
    submissionKey: string;
    contractVersion: number;
    scenarioStatus: string;
    scenario: unknown;
    relloLeadId: string | null;
}
/** Why a stored row is not sent. Each is counted by the sender, never sent. */
export type CyrQuoteNotEligibleReason = "no_rello_lead" | "contract_version_unknown" | `scenario_status:${string}` | "scenario_unreadable";
export type CyrQuoteSendEligibility = {
    eligible: true;
    cyrQuote: CyrQuote;
    sendIdempotencyKey: string;
} | {
    eligible: false;
    reason: CyrQuoteNotEligibleReason;
};
/**
 * Decide whether a stored row is sent, and build its `cyrQuote` verbatim when it is.
 * Only scenarioStatus "stated" rows with a relloLeadId and a known contractVersion are sent; every other row is
 * named by reason (unreadable, answers_missing, answers_invalid, intake_unavailable carry no scenario for PFP).
 * The scenario is copied, not reshaped: every status and every null survives (rows null stays null).
 */
export declare function cyrQuoteSendEligibility(row: StoredCyrQuoteSubmission): CyrQuoteSendEligibility;
//# sourceMappingURL=hs-cyr-quote.d.ts.map