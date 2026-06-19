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
 * v0.7.0 (2026-06-18) — optional DSCR (investor) loan branch. Home Scout is
 * adding a DSCR investor-loan "Get Pre-Approved" CTA. A new `DSCR` value on the
 * `docType` discriminator plus net-new rent fields (`rentBasis`, `leaseRent`,
 * `marketRent`, `strIncome`, `monthlyRent`) were added — ALL optional at the
 * schema level. A dedicated superRefine branch enforces the DSCR minimum ONLY
 * when `docType === "DSCR"` (investor gate `occupancy === "RENTAL"`, a rent
 * source per `rentBasis`, `propertyValue` > 0, one of `loanAmount`/`ltv` > 0,
 * `creditScore`, `propertyType`), so existing purchase/refinance/bank-statement
 * senders are wholly unaffected — non-breaking. The DSCR branch REUSES
 * `creditScore` (FICO), `loanAmount`, `ltv`, `propertyValue`, `annualTaxes`,
 * `annualInsurance`, `monthlyHoa`, `occupancy`, `propertyType` from the existing
 * sets — only the rent fields are net-new. The purchase/refinance/bank-statement
 * required sets are unchanged.
 *
 * v0.8.0 (2026-06-18) — optional VA loan branch. Home Scout is adding a VA-loan
 * "Get Pre-Approved" CTA. A new `VA` value on the `docType` discriminator plus
 * net-new VA fields (`vaCoeStatus`, `vaDisabilityRating`, `vaIsSurvivingSpouse`,
 * `vaPriorVaLoanOpen`, `vaUsedEntitlement`, `vaEntitlementRestored`,
 * `vaHouseholdSize`, `vaGrossMonthlyIncome`, `vaMonthlyDebts`, `vaCountyFips`)
 * were added — ALL optional at the schema level, each mapping 1:1 to a PFP
 * `va_*` custom field. A dedicated superRefine branch enforces the VA minimum
 * ONLY when `docType === "VA"` (rate/residual-critical core: `propertyState`,
 * `propertyValue` > 0, `vaCoeStatus`, veteran eligibility via reused `isVeteran`/
 * `militaryServiceType`, `vaHouseholdSize`, `vaGrossMonthlyIncome`), so existing
 * purchase/refinance/bank-statement/DSCR senders are wholly unaffected —
 * non-breaking. The VA branch REUSES `isVeteran`/`militaryServiceType`,
 * `propertyState`, `propertyValue`, `purchasePrice`/`downPaymentAmount`,
 * `loanPurpose`, `currentLoanBalance`/`currentRate` from the existing sets — only
 * the `va*` fields are net-new. The purchase/refinance/bank-statement/DSCR
 * required sets are unchanged.
 *
 * v0.9.0 (2026-06-19) — optional HECM (reverse-mortgage) loan branch. Home Scout
 * is adding a HECM "Get Pre-Approved" CTA. A new `HECM` value on the `docType`
 * discriminator plus net-new reverse-mortgage fields (`borrowerAge`,
 * `coBorrowerAge`, `existingLienPayoff`, `reverseProductKind`, `useOfProceeds`)
 * were added — ALL optional at the schema level. A dedicated superRefine branch
 * enforces the HECM minimum ONLY when `docType === "HECM"` (rate/PLF-critical
 * core: `borrowerAge` present AND >= 62 [HECM age eligibility], `propertyValue`
 * present & > 0, `propertyState` present), so existing
 * purchase/refinance/bank-statement/DSCR/VA senders are wholly unaffected —
 * non-breaking, mirroring the v0.6.0/v0.7.0/v0.8.0 branches. The HECM branch
 * REUSES `propertyValue` (home value — the PLF base), `propertyState` (county
 * loan-limit lookup), `occupancy` (must be owner-occupied = "PRIMARY"),
 * `propertyType`, `currentLoanBalance` (existing 1st lien), `secondMortgageBalance`
 * (second lien), `baseIncome` (LESA financial-assessment annual income),
 * `annualTaxes`/`annualInsurance` (LESA annual property charges, sent separately),
 * and `vaHouseholdSize` (family size) from the existing sets — only the five
 * fields above are net-new. `existingLienPayoff` is kept DISTINCT from
 * `currentLoanBalance`: the latter is the remaining first-mortgage balance, while
 * the former is the closing payoff figure (balance + accrued interest/payoff
 * costs) that drives HECM net proceeds — same distinct-driver rationale as v0.8.0
 * keeping `vaMonthlyDebts` separate from `otherMonthlyDebts`. The
 * purchase/refinance/bank-statement/DSCR/VA required sets are unchanged.
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
    /** Doc-type discriminator — present only on the bank-statement / DSCR / VA / HECM paths. */
    docType: z.enum(["BANK_STATEMENT", "DSCR", "VA", "HECM"]).optional(),
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
    // ─── DSCR (investor) loan branch (v0.7.0) ────────────────────────────────
    //  Optional, non-breaking addition for Home Scout's DSCR investor-loan
    //  "Get Pre-Approved" CTA. ALL fields below are `.optional()` at the schema
    //  level; the DSCR minimum is enforced ONLY when `docType === "DSCR"` via the
    //  dedicated superRefine branch below. Existing purchase/refinance/bank-statement
    //  senders are wholly unaffected — same backward-compatible pattern as the
    //  v0.6.0 BANK_STATEMENT branch.
    //  REUSED (not redeclared): `creditScore` (FICO), `propertyType`, `occupancy`
    //  (investor gate = "RENTAL"), `loanAmount`, `ltv`, `propertyValue`,
    //  `annualTaxes`, `annualInsurance`, `monthlyHoa`, `expectedRate`,
    //  `reservesMonths`, `interestOnly` — all from the shared/refi/bank-statement
    //  sets above. Only the rent fields below are net-new.
    /** Basis used to qualify rental income — drives the required rent source. */
    rentBasis: z.enum(["LEASE", "MARKET", "STR"]).optional(),
    /** In-place lease rent, monthly (LEASE basis). */
    leaseRent: z.number().nonnegative().max(100_000).optional(),
    /** Appraiser market rent (1007/1025), monthly (MARKET basis, or LEASE fallback). */
    marketRent: z.number().nonnegative().max(100_000).optional(),
    /** Short-term-rental income, monthly (STR basis). */
    strIncome: z.number().nonnegative().max(100_000).optional(),
    /** Resolved qualifying monthly rent (computed/sent rent figure). */
    monthlyRent: z.number().nonnegative().max(100_000).optional(),
    // ─── HECM (reverse-mortgage) loan branch (v0.9.0) ────────────────────────
    //  Optional, non-breaking addition for Home Scout's HECM "Get Pre-Approved"
    //  CTA. ALL fields below are `.optional()` at the schema level; the HECM
    //  minimum is enforced ONLY when `docType === "HECM"` via the dedicated
    //  superRefine branch below. Existing purchase/refinance/bank-statement/DSCR/VA
    //  senders are wholly unaffected — same backward-compatible pattern as the
    //  v0.6.0/v0.7.0/v0.8.0 branches.
    //  REUSED (not redeclared): `propertyValue` (HECM home value — the PLF base),
    //  `propertyState` (county loan-limit lookup), `occupancy` (must be
    //  owner-occupied = "PRIMARY"), `propertyType`, `currentLoanBalance` (existing
    //  1st lien), `secondMortgageBalance` (second lien), `baseIncome` (LESA
    //  financial-assessment annual income), `annualTaxes`/`annualInsurance` (LESA
    //  annual property charges, sent separately), `vaHouseholdSize` (family size).
    //  Only the five fields below are net-new.
    /** Youngest-eligible borrower age — the PLF (principal-limit-factor) driver. The CTA gates 62+, but the contract floor stays 18 (non-rejection); the superRefine enforces >= 62 for HECM. */
    borrowerAge: z.number().int().min(18).max(130).optional(),
    /** Co-borrower age — the youngest of the two borrowers drives the PLF. */
    coBorrowerAge: z.number().int().min(18).max(130).optional(),
    /** Existing first-lien payoff at closing (balance + accrued interest/payoff costs) — the HECM net-proceeds driver; DISTINCT from `currentLoanBalance` (remaining first-mortgage balance). */
    existingLienPayoff: z.number().nonnegative().max(100_000_000).optional(),
    /** Reverse-mortgage product kind → product-specific PLF / margin table. */
    reverseProductKind: z
        .enum(["HECM_ADJUSTABLE", "HECM_FIXED", "HOMESAFE_ADJUSTABLE", "HOMESAFE_FIXED"])
        .optional(),
    /** Intended use of proceeds — nurture free-text (not a quote driver). */
    useOfProceeds: z.string().max(200).optional(),
    // ─── VA loan branch (v0.8.0) ─────────────────────────────────────────────
    //  Optional, non-breaking addition for Home Scout's VA-loan "Get Pre-Approved"
    //  CTA. ALL fields below are `.optional()` at the schema level; the VA minimum
    //  is enforced ONLY when `docType === "VA"` via the dedicated superRefine branch
    //  below. Existing purchase/refinance/bank-statement/DSCR senders are wholly
    //  unaffected — same backward-compatible pattern as the v0.6.0/v0.7.0 branches.
    //  Each net-new field maps 1:1 to a PFP `va_*` custom field so PFP's
    //  `handleVaIntake` (contract VA fields → VaInput → `va_*`) mapping is trivial.
    //  REUSED (not redeclared): `isVeteran` + `militaryServiceType` (veteran
    //  eligibility), `propertyState` (residual-income region), `propertyValue`
    //  (estimated value), `purchasePrice`/`downPaymentAmount` (LTV), `loanPurpose`
    //  (intent derivation), `currentLoanBalance`/`currentRate` (refi/IRRRL),
    //  `propertyCounty` (county lookup) — all from the shared/purchase/refi sets.
    //  Only the `va*` fields below are net-new. `vaMonthlyDebts` is kept distinct
    //  from `otherMonthlyDebts` (DTI) because it is the residual-income denominator
    //  (full monthly debt obligations) and maps 1:1 to its own `va_*` consumer key.
    /** COE status → `va_coe_status` ∈ {HAVE, APPLIED, UNKNOWN}. */
    vaCoeStatus: z.enum(["HAVE", "APPLIED", "UNKNOWN"]).optional(),
    /** VA disability rating bucket → `va_disability_rating` ∈ {NONE, 10_PLUS} (funding-fee input). */
    vaDisabilityRating: z.enum(["NONE", "10_PLUS"]).optional(),
    /** Surviving-spouse eligibility (funding-fee / entitlement input). */
    vaIsSurvivingSpouse: z.boolean().optional(),
    /** Whether a prior VA loan is still open (entitlement / second-tier input). */
    vaPriorVaLoanOpen: z.boolean().optional(),
    /** Previously-used entitlement, USD (second-tier / max-loan input). */
    vaUsedEntitlement: z.number().nonnegative().max(5_000_000).optional(),
    /** Whether prior entitlement has been restored. */
    vaEntitlementRestored: z.boolean().optional(),
    /** Household size for residual-income table lookup. */
    vaHouseholdSize: z.number().int().nonnegative().max(20).optional(),
    /** Gross monthly income — residual-income numerator. */
    vaGrossMonthlyIncome: z.number().nonnegative().max(1_000_000).optional(),
    /** Total monthly debts — residual-income denominator (distinct from otherMonthlyDebts/DTI). */
    vaMonthlyDebts: z.number().nonnegative().max(1_000_000).optional(),
    /** County FIPS (≤5 chars) for county loan-limit / region lookup. */
    vaCountyFips: z.string().max(5).optional(),
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
        }
        else {
            // Require the income field that matches the chosen documentation method.
            const incomeFieldByMethod = {
                personal_bank: "avgMonthlyDeposits",
                business_bank: "avgMonthlyDeposits",
                pnl: "annualNetIncome",
                "1099": "annual1099",
                asset_depletion: "liquidAssets",
            };
            const requiredIncomeField = incomeFieldByMethod[data.incomeMethod];
            if (data[requiredIncomeField] === undefined) {
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
        if (data.expenseFactorSource === "cpa_stated" &&
            data.statedExpenseRatio === undefined) {
            ctx.addIssue({
                code: "custom",
                path: ["statedExpenseRatio"],
                message: "statedExpenseRatio is required when expenseFactorSource is cpa_stated",
            });
        }
    }
    // ─── DSCR (investor) minimum (v0.7.0) ──────────────────────────────────
    //  Fires ONLY when docType === "DSCR"; orthogonal to loanPurpose, so existing
    //  purchase/refinance/bank-statement callers never reach this. DSCR fields are
    //  NOT added to the purchase/refinance/bank-statement required sets above —
    //  this branch is the sole enforcer of the DSCR minimum. Taxes/insurance/HOA
    //  stay optional (MLO/property-lookup fills when the borrower can't).
    if (data.docType === "DSCR") {
        // Investor gate — a DSCR loan must be on a non-owner-occupied (rental)
        // property. The occupancy enum's investment value is "RENTAL".
        if (data.occupancy !== "RENTAL") {
            ctx.addIssue({
                code: "custom",
                path: ["occupancy"],
                message: 'occupancy must be "RENTAL" when docType is DSCR',
            });
        }
        // Rental-income source: rentBasis present, plus the matching rent field.
        if (data.rentBasis === undefined) {
            ctx.addIssue({
                code: "custom",
                path: ["rentBasis"],
                message: "rentBasis is required when docType is DSCR",
            });
        }
        else if (data.rentBasis === "LEASE") {
            // LEASE qualifies on the in-place lease, or appraiser market rent as fallback.
            if (data.leaseRent === undefined && data.marketRent === undefined) {
                ctx.addIssue({
                    code: "custom",
                    path: ["leaseRent"],
                    message: "leaseRent or marketRent is required when rentBasis is LEASE",
                });
            }
        }
        else if (data.rentBasis === "MARKET") {
            if (data.marketRent === undefined) {
                ctx.addIssue({
                    code: "custom",
                    path: ["marketRent"],
                    message: "marketRent is required when rentBasis is MARKET",
                });
            }
        }
        else if (data.rentBasis === "STR") {
            if (data.strIncome === undefined) {
                ctx.addIssue({
                    code: "custom",
                    path: ["strIncome"],
                    message: "strIncome is required when rentBasis is STR",
                });
            }
        }
        // propertyValue is the LTV / quote base for DSCR.
        if (data.propertyValue === undefined || data.propertyValue <= 0) {
            ctx.addIssue({
                code: "custom",
                path: ["propertyValue"],
                message: "propertyValue is required and must be greater than 0 when docType is DSCR",
            });
        }
        // At least one of loanAmount / ltv must be present and positive.
        const hasLoanAmount = data.loanAmount !== undefined && data.loanAmount > 0;
        const hasLtv = data.ltv !== undefined && data.ltv > 0;
        if (!hasLoanAmount && !hasLtv) {
            ctx.addIssue({
                code: "custom",
                path: ["loanAmount"],
                message: "loanAmount or ltv (greater than 0) is required when docType is DSCR",
            });
        }
        // creditScore (FICO) — reused from the shared set; required for DSCR pricing.
        if (data.creditScore === undefined) {
            ctx.addIssue({
                code: "custom",
                path: ["creditScore"],
                message: "creditScore is required when docType is DSCR",
            });
        }
        // propertyType — reused from the shared set; required for DSCR pricing.
        if (data.propertyType === undefined) {
            ctx.addIssue({
                code: "custom",
                path: ["propertyType"],
                message: "propertyType is required when docType is DSCR",
            });
        }
    }
    // ─── VA minimum (v0.8.0) ───────────────────────────────────────────────
    //  Fires ONLY when docType === "VA"; orthogonal to loanPurpose, so existing
    //  purchase/refinance/bank-statement/DSCR callers never reach this. VA fields
    //  are NOT added to the other branches' required sets above — this branch is
    //  the sole enforcer of the VA minimum. Requires only the rate/residual-critical
    //  core; disability/entitlement/used-entitlement stay optional (funding-fee
    //  inputs the MLO can fill).
    if (data.docType === "VA") {
        // Residual-income region — propertyState drives the VA residual table.
        if (data.propertyState === undefined) {
            ctx.addIssue({
                code: "custom",
                path: ["propertyState"],
                message: "propertyState is required when docType is VA",
            });
        }
        // Estimated property value — LTV / quote base.
        if (data.propertyValue === undefined || data.propertyValue <= 0) {
            ctx.addIssue({
                code: "custom",
                path: ["propertyValue"],
                message: "propertyValue is required and must be greater than 0 when docType is VA",
            });
        }
        // COE status — entitlement entry requirement.
        if (data.vaCoeStatus === undefined) {
            ctx.addIssue({
                code: "custom",
                path: ["vaCoeStatus"],
                message: "vaCoeStatus is required when docType is VA",
            });
        }
        // Veteran eligibility — isVeteran === true OR a military service type present.
        const isVeteranEligible = data.isVeteran === true ||
            (data.militaryServiceType !== undefined &&
                data.militaryServiceType !== null);
        if (!isVeteranEligible) {
            ctx.addIssue({
                code: "custom",
                path: ["isVeteran"],
                message: "isVeteran (true) or militaryServiceType is required when docType is VA",
            });
        }
        // Residual-income inputs — household size (table key) + gross monthly income.
        if (data.vaHouseholdSize === undefined) {
            ctx.addIssue({
                code: "custom",
                path: ["vaHouseholdSize"],
                message: "vaHouseholdSize is required when docType is VA",
            });
        }
        if (data.vaGrossMonthlyIncome === undefined) {
            ctx.addIssue({
                code: "custom",
                path: ["vaGrossMonthlyIncome"],
                message: "vaGrossMonthlyIncome is required when docType is VA",
            });
        }
    }
    // ─── HECM (reverse-mortgage) minimum (v0.9.0) ──────────────────────────
    //  Fires ONLY when docType === "HECM"; orthogonal to loanPurpose, so existing
    //  purchase/refinance/bank-statement/DSCR/VA callers never reach this. HECM
    //  fields are NOT added to the other branches' required sets above — this
    //  branch is the sole enforcer of the HECM minimum. Requires only the
    //  PLF/rate-critical core; co-borrower age, income, property charges, and
    //  product kind stay optional (the MLO/borrower may not supply them).
    if (data.docType === "HECM") {
        // HECM age eligibility — borrowerAge present AND >= 62. The contract field
        // floor is 18 (non-rejection of a malformed-but-present value); 62 is the
        // program eligibility gate enforced here.
        if (data.borrowerAge === undefined || data.borrowerAge < 62) {
            ctx.addIssue({
                code: "custom",
                path: ["borrowerAge"],
                message: "borrowerAge must be 62 or older for HECM",
            });
        }
        // Home value — the PLF (principal-limit-factor) base.
        if (data.propertyValue === undefined || data.propertyValue <= 0) {
            ctx.addIssue({
                code: "custom",
                path: ["propertyValue"],
                message: "propertyValue is required and must be greater than 0 when docType is HECM",
            });
        }
        // County loan-limit lookup region.
        if (data.propertyState === undefined) {
            ctx.addIssue({
                code: "custom",
                path: ["propertyState"],
                message: "propertyState is required when docType is HECM",
            });
        }
    }
});
