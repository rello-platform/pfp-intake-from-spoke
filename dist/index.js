/**
 * @rello-platform/pfp-intake-from-spoke
 *
 * Canonical zod payload schema for cross-app PFP LeadIntake creation initiated
 * by a spoke (e.g., Home Scout's `get-pre-approved` CTA). The PFP receiver
 * endpoint `POST /api/intakes/from-spoke` validates incoming payloads against
 * `PfpIntakeFromSpokePayloadSchema` and writes a `LeadIntake` row with
 * `status: "QUICK_ESTIMATE"`.
 *
 * v0.4.0 (2026-06-08) — REFINANCE branch. The original 15-field set was
 * purchase-shaped. A refinance asks a different set (current balance, current
 * rate, home value, cash-out, second mortgage, etc.), so the purchase-only
 * fields became `.optional()` and a refinance block was added. A `superRefine`
 * enforces the correct set per `loanPurpose` — PURCHASE still requires the full
 * purchase set (existing callers unchanged / backward-compatible), REFINANCE
 * requires the refinance set. Each field still maps 1:1 to a PFP `LeadIntake`
 * column (most refi columns already existed; `secondMortgageBalance` is the one
 * net-new column added in the companion PFP PR).
 *
 * Auth: PFP receiver gates via `requireServiceBearer` + the
 * `pfp-intake-from-spoke:write` permission slug.
 */
import { z } from "zod";
export const PfpIntakeFromSpokePayloadSchema = z
    .object({
    // ─── Cross-app routing + dedup (v0.2.0 — SPEC §4.2 + §4.5 + §9.3) ───
    /** Agent on whose subdomain/storefront the lead transacted. */
    agentSlug: z.string().min(1).max(120),
    /** Optional Rello-side lead id for cross-app correlation. */
    relloLeadId: z.string().min(1).max(64).optional(),
    /** Spoke-side outbox idempotency key (`<leadId>:get-pre-approved:<interactionId>`). */
    sendIdempotencyKey: z.string().min(1).max(64),
    // ─── Identity (capture-card) — required on every path ───
    firstName: z.string().min(1).max(80),
    lastName: z.string().min(1).max(80),
    email: z.string().email().max(200),
    phone: z.string().min(7).max(40).optional(),
    notes: z.string().max(2000).optional(),
    // ─── Loan purpose — the branch discriminator ───
    loanPurpose: z.enum(["PURCHASE", "REFINANCE"]),
    // ─── Shared fields (asked on BOTH purchase + refinance) ───
    propertyType: z.enum(["SINGLE_FAMILY", "CONDO", "TOWN_HOME", "MULTI_FAMILY"]),
    occupancy: z.enum(["PRIMARY", "SECONDARY", "RENTAL"]),
    // Exact estimated credit score (300–850); `creditScoreRange` bucket derived from it.
    creditScoreRange: z.enum([
        "780+",
        "740-779",
        "700-739",
        "660-699",
        "620-659",
        "580-619",
        "Below 580",
    ]),
    creditScore: z.number().int().min(300).max(850),
    militaryServiceType: z.enum(["ACTIVE_DUTY", "VETERAN", "RESERVE_GUARD"]).nullable(),
    isVeteran: z.boolean(),
    employmentType: z.enum(["W2", "SELF_EMPLOYED", "RETIRED"]),
    baseIncome: z.number().nonnegative().max(10_000_000),
    yearsSinceBankruptcy: z.enum(["NEVER", "LESS_THAN_7"]),
    hasForeclosureHistory: z.boolean(),
    yearsSinceForeclosure: z.enum(["NEVER", "LESS_THAN_7"]).nullable(),
    // ─── PURCHASE-only fields (optional at field level; required for PURCHASE
    //      via the superRefine below — keeps existing purchase callers valid) ───
    isFirstTimeBuyer: z.boolean().optional(),
    purchaseStage: z
        .enum([
        "SIGNED_PURCHASE_AGREEMENT",
        "BUYING_2_TO_6_MONTHS",
        "OFFER_PENDING",
        "RESEARCHING",
    ])
        .optional(),
    wantsAgentReferral: z.boolean().optional(),
    purchasePrice: z.number().nonnegative().max(10_000_000).optional(),
    downPaymentAmount: z.number().nonnegative().optional(),
    downPaymentPct: z.number().min(0).max(100).optional(),
    // ─── REFINANCE-only fields (v0.4.0; optional at field level, required for
    //      REFINANCE via the superRefine below) ───
    /** Borrower's primary refinance objective. */
    refiGoal: z
        .enum([
        "LOWER_PAYMENT",
        "CASH_OUT",
        "SHORTEN_TERM",
        "REMOVE_PMI",
        "DEBT_CONSOLIDATION",
    ])
        .optional(),
    /** Current loan program — drives streamline/IRRRL eligibility. */
    currentLoanType: z.enum(["CONVENTIONAL", "FHA", "VA", "USDA", "NOT_SURE"]).optional(),
    /** Estimated current market value of the property. */
    propertyValue: z.number().nonnegative().max(100_000_000).optional(),
    /** Remaining balance on the (first) mortgage. */
    currentLoanBalance: z.number().nonnegative().max(100_000_000).optional(),
    /** Current note rate, percent (e.g. 5.25). */
    currentRate: z.number().min(0).max(25).optional(),
    /** Whether a second mortgage / subordinate lien exists. */
    hasSecondMortgage: z.boolean().optional(),
    /** Balance on the second mortgage (required when hasSecondMortgage === true). */
    secondMortgageBalance: z.number().nonnegative().max(100_000_000).optional(),
    /** Additional cash the borrower wants to take out (0 = none). */
    cashOutAmount: z.number().nonnegative().max(100_000_000).optional(),
    /** Mortgage lates in the last 12 months. */
    latePaymentsLastYear: z.enum(["NONE", "ONE", "TWO_PLUS"]).optional(),
    /** Whether the borrower currently pays mortgage insurance (PMI/MIP). */
    paysMortgageInsurance: z.boolean().optional(),
    // ─── Subject-property location (refinance autocomplete; optional, best-effort) ───
    propertyCity: z.string().max(120).optional(),
    propertyState: z.string().max(40).optional(),
    propertyCounty: z.string().max(120).optional(),
    propertyZip: z.string().max(12).optional(),
    // ─── Lead-magnet discriminator + cache (v0.3.0) ───
    magnetType: z
        .enum([
        "free_prequal",
        "free_home_value",
        "free_buying_power",
        "free_neighborhood_report",
        "other",
    ])
        .optional(),
    scoutLeadMagnetId: z.string().min(1).max(64).optional(),
    scoutIntentSignal: z
        .enum(["buying_now", "buying_3_6mo", "buying_6_12mo", "researching"])
        .optional(),
    scoutSubmittedAt: z.string().datetime().optional(),
    scoutFormPayload: z.record(z.string(), z.unknown()).optional(),
})
    .superRefine((data, ctx) => {
    const requireFields = (fields) => {
        for (const field of fields) {
            if (data[field] === undefined) {
                ctx.addIssue({
                    code: "custom",
                    path: [field],
                    message: `${field} is required when loanPurpose is ${data.loanPurpose}`,
                });
            }
        }
    };
    if (data.loanPurpose === "PURCHASE") {
        requireFields([
            "isFirstTimeBuyer",
            "purchaseStage",
            "wantsAgentReferral",
            "purchasePrice",
            "downPaymentAmount",
            "downPaymentPct",
        ]);
    }
    else if (data.loanPurpose === "REFINANCE") {
        requireFields([
            "refiGoal",
            "currentLoanType",
            "propertyValue",
            "currentLoanBalance",
            "currentRate",
            "hasSecondMortgage",
            "latePaymentsLastYear",
        ]);
        // Second-mortgage balance is required only when a second mortgage exists.
        if (data.hasSecondMortgage === true && data.secondMortgageBalance === undefined) {
            ctx.addIssue({
                code: "custom",
                path: ["secondMortgageBalance"],
                message: "secondMortgageBalance is required when hasSecondMortgage is true",
            });
        }
    }
});
