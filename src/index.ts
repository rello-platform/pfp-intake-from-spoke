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
 * v0.6.0 (2026-06-18) — optional BANK_STATEMENT loan branch. Home Scout is
 * adding a "Get Pre-Approved for a Bank Statement loan" CTA whose lead must
 * reach PFP's bank-statement advisor with enough to produce a quote. A
 * `docType` discriminator plus bank-statement fields were added — ALL optional
 * at the schema level. A dedicated superRefine branch enforces the
 * bank-statement minimum ONLY when `docType === "BANK_STATEMENT"`, so existing
 * purchase/refinance senders (which never set `docType`) are completely
 * unaffected — non-breaking, mirroring the v0.5.0 `unitCount` precedent. The
 * purchase/refinance required sets are unchanged.
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
    /**
     * Number of units (1–4) for the subject property; required by PFP's
     * purchase pricing gate (`required-intake-fields.ts`) to enable
     * purchase-rate generation in the cockpit. Optional in the contract so
     * non-purchase / other-spoke senders aren't broken — gate-completeness is
     * enforced downstream, NOT by contract rejection.
     */
    unitCount: z.number().int().nonnegative().optional(),

    // ─── BANK-STATEMENT loan branch (v0.6.0) ─────────────────────────────────
    //  Optional, non-breaking addition for Home Scout's "Get Pre-Approved for a
    //  Bank Statement loan" CTA. ALL fields below are `.optional()` at the schema
    //  level; the bank-statement minimum is enforced ONLY when
    //  `docType === "BANK_STATEMENT"` via the dedicated superRefine branch below.
    //  Existing purchase/refinance senders (which never set `docType`) are wholly
    //  unaffected — same backward-compatible pattern as `unitCount` (v0.5.0).
    //  `propertyValue`, `occupancy`, `cashOutAmount`, `propertyCity/State/County/Zip`
    //  and `creditScore` are REUSED from the shared/refinance sets above — not
    //  redeclared here.
    /** Doc-type discriminator — present only on the bank-statement path. */
    docType: z.enum(["BANK_STATEMENT"]).optional(),
    /** How qualifying income is documented (drives the method-specific income field). */
    incomeMethod: z
      .enum(["personal_bank", "business_bank", "pnl", "1099", "asset_depletion"])
      .optional(),
    /** Number of bank-statement months provided (12–24). */
    statementMonths: z.number().int().min(12).max(24).optional(),
    /** Average monthly deposits (personal_bank | business_bank income method). */
    avgMonthlyDeposits: z.number().nonnegative().max(1_000_000).optional(),
    /** Annual net income from CPA-prepared P&L (pnl income method). */
    annualNetIncome: z.number().nonnegative().max(10_000_000).optional(),
    /** Annual 1099 income (1099 income method). */
    annual1099: z.number().nonnegative().max(10_000_000).optional(),
    /** Liquid assets for asset-depletion qualifying (asset_depletion income method). */
    liquidAssets: z.number().nonnegative().max(10_000_000).optional(),
    /** Source of the expense factor applied to deposits — fixed table vs CPA-stated. */
    expenseFactorSource: z.enum(["fixed", "cpa_stated"]).optional(),
    /** CPA-stated expense ratio (0–1); required when expenseFactorSource === "cpa_stated". */
    statedExpenseRatio: z.number().min(0).max(1).optional(),
    /** Requested loan amount. */
    loanAmount: z.number().nonnegative().max(10_000_000).optional(),
    /** Loan-to-value percent (0–100). */
    ltv: z.number().min(0).max(100).optional(),
    /** Annual property taxes. */
    annualTaxes: z.number().nonnegative().optional(),
    /** Annual hazard insurance. */
    annualInsurance: z.number().nonnegative().optional(),
    /** Monthly HOA dues. */
    monthlyHoa: z.number().nonnegative().optional(),
    /** Other monthly debt obligations (for DTI). */
    otherMonthlyDebts: z.number().nonnegative().optional(),
    /** Expected note rate, percent (0–25). */
    expectedRate: z.number().min(0).max(25).optional(),
    /** Reserves expressed in months of PITIA. */
    reservesMonths: z.number().min(0).optional(),
    /** Whether an interest-only structure is requested. */
    interestOnly: z.boolean().optional(),
    /** Amortization term in months (360–480). */
    amortTermMonths: z.number().int().min(360).max(480).optional(),
    /** Prepayment-penalty term in months (0 = none). */
    prepayTerm: z.number().int().min(0).optional(),
    /** Borrower residency / citizenship status. */
    residency: z
      .enum(["us_citizen", "permanent_resident", "itin", "foreign_national"])
      .optional(),
    /** Existing lien balance on the subject property. */
    existingLienBalance: z.number().nonnegative().max(100_000_000).optional(),
    /** Free-text business type / industry. */
    businessType: z.string().max(120).optional(),
    /** Years self-employed. */
    yearsSelfEmployed: z.number().nonnegative().max(80).optional(),
    /** Business entity type. */
    entityType: z.enum(["sole_prop", "llc", "s_corp", "c_corp", "partnership"]).optional(),
    /** Number of businesses owned. */
    numberOfBusinesses: z.number().int().nonnegative().max(100).optional(),
    /** Whether the borrower has a CPA relationship. */
    cpaRelationship: z.enum(["yes", "no", "considering"]).optional(),
    /** Borrower's income-documentation posture / preference. */
    incomePosture: z.enum(["bank_statements", "pnl", "1099", "mixed"]).optional(),
    /** Where the lead originated. */
    leadSource: z
      .enum(["realtor", "cpa_attorney", "referral", "online", "repeat_client", "other"])
      .optional(),
    /** Preferred contact window. */
    bestTimeToCall: z.enum(["mornings", "afternoons", "evenings", "anytime"]).optional(),

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
    const requireFields = (fields: string[]) => {
      for (const field of fields) {
        if ((data as Record<string, unknown>)[field] === undefined) {
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
    } else if (data.loanPurpose === "REFINANCE") {
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

    // ─── BANK-STATEMENT minimum (v0.6.0) ───────────────────────────────────
    //  Fires ONLY when docType === "BANK_STATEMENT"; orthogonal to loanPurpose,
    //  so existing purchase/refinance callers (no docType) never reach this.
    //  Bank-statement fields are NOT added to the purchase/refinance required
    //  sets above — this branch is the sole enforcer of the bank-statement min.
    if (data.docType === "BANK_STATEMENT") {
      // incomeMethod is the entry requirement for the bank-statement path.
      if (data.incomeMethod === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["incomeMethod"],
          message: "incomeMethod is required when docType is BANK_STATEMENT",
        });
      } else {
        // Require the income field that matches the chosen documentation method.
        const incomeFieldByMethod: Record<typeof data.incomeMethod, string> = {
          personal_bank: "avgMonthlyDeposits",
          business_bank: "avgMonthlyDeposits",
          pnl: "annualNetIncome",
          "1099": "annual1099",
          asset_depletion: "liquidAssets",
        };
        const requiredIncomeField = incomeFieldByMethod[data.incomeMethod];
        if ((data as Record<string, unknown>)[requiredIncomeField] === undefined) {
          ctx.addIssue({
            code: "custom",
            path: [requiredIncomeField],
            message: `${requiredIncomeField} is required when incomeMethod is ${data.incomeMethod}`,
          });
        }
      }

      // propertyValue is the DTI base / core quote driver for bank-statement loans.
      if (data.propertyValue === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["propertyValue"],
          message: "propertyValue is required when docType is BANK_STATEMENT",
        });
      }

      // A CPA-stated expense factor must carry the stated ratio.
      if (
        data.expenseFactorSource === "cpa_stated" &&
        data.statedExpenseRatio === undefined
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["statedExpenseRatio"],
          message:
            "statedExpenseRatio is required when expenseFactorSource is cpa_stated",
        });
      }
    }
  });

export type PfpIntakeFromSpokePayload = z.infer<
  typeof PfpIntakeFromSpokePayloadSchema
>;
