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
export declare const PfpIntakeFromSpokePayloadSchema: z.ZodObject<{
    agentSlug: z.ZodString;
    relloLeadId: z.ZodOptional<z.ZodString>;
    sendIdempotencyKey: z.ZodString;
    firstName: z.ZodString;
    lastName: z.ZodString;
    email: z.ZodString;
    phone: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    loanPurpose: z.ZodEnum<{
        PURCHASE: "PURCHASE";
        REFINANCE: "REFINANCE";
    }>;
    propertyType: z.ZodEnum<{
        SINGLE_FAMILY: "SINGLE_FAMILY";
        CONDO: "CONDO";
        TOWN_HOME: "TOWN_HOME";
        MULTI_FAMILY: "MULTI_FAMILY";
    }>;
    occupancy: z.ZodEnum<{
        PRIMARY: "PRIMARY";
        SECONDARY: "SECONDARY";
        RENTAL: "RENTAL";
    }>;
    creditScoreRange: z.ZodEnum<{
        "780+": "780+";
        "740-779": "740-779";
        "700-739": "700-739";
        "660-699": "660-699";
        "620-659": "620-659";
        "580-619": "580-619";
        "Below 580": "Below 580";
    }>;
    creditScore: z.ZodNumber;
    militaryServiceType: z.ZodNullable<z.ZodEnum<{
        ACTIVE_DUTY: "ACTIVE_DUTY";
        VETERAN: "VETERAN";
        RESERVE_GUARD: "RESERVE_GUARD";
    }>>;
    isVeteran: z.ZodBoolean;
    employmentType: z.ZodEnum<{
        W2: "W2";
        SELF_EMPLOYED: "SELF_EMPLOYED";
        RETIRED: "RETIRED";
    }>;
    baseIncome: z.ZodNumber;
    yearsSinceBankruptcy: z.ZodEnum<{
        NEVER: "NEVER";
        LESS_THAN_7: "LESS_THAN_7";
    }>;
    hasForeclosureHistory: z.ZodBoolean;
    yearsSinceForeclosure: z.ZodNullable<z.ZodEnum<{
        NEVER: "NEVER";
        LESS_THAN_7: "LESS_THAN_7";
    }>>;
    isFirstTimeBuyer: z.ZodOptional<z.ZodBoolean>;
    purchaseStage: z.ZodOptional<z.ZodEnum<{
        SIGNED_PURCHASE_AGREEMENT: "SIGNED_PURCHASE_AGREEMENT";
        BUYING_2_TO_6_MONTHS: "BUYING_2_TO_6_MONTHS";
        OFFER_PENDING: "OFFER_PENDING";
        RESEARCHING: "RESEARCHING";
    }>>;
    wantsAgentReferral: z.ZodOptional<z.ZodBoolean>;
    purchasePrice: z.ZodOptional<z.ZodNumber>;
    downPaymentAmount: z.ZodOptional<z.ZodNumber>;
    downPaymentPct: z.ZodOptional<z.ZodNumber>;
    refiGoal: z.ZodOptional<z.ZodEnum<{
        LOWER_PAYMENT: "LOWER_PAYMENT";
        CASH_OUT: "CASH_OUT";
        SHORTEN_TERM: "SHORTEN_TERM";
        REMOVE_PMI: "REMOVE_PMI";
        DEBT_CONSOLIDATION: "DEBT_CONSOLIDATION";
    }>>;
    currentLoanType: z.ZodOptional<z.ZodEnum<{
        CONVENTIONAL: "CONVENTIONAL";
        FHA: "FHA";
        VA: "VA";
        USDA: "USDA";
        NOT_SURE: "NOT_SURE";
    }>>;
    propertyValue: z.ZodOptional<z.ZodNumber>;
    currentLoanBalance: z.ZodOptional<z.ZodNumber>;
    currentRate: z.ZodOptional<z.ZodNumber>;
    hasSecondMortgage: z.ZodOptional<z.ZodBoolean>;
    secondMortgageBalance: z.ZodOptional<z.ZodNumber>;
    cashOutAmount: z.ZodOptional<z.ZodNumber>;
    latePaymentsLastYear: z.ZodOptional<z.ZodEnum<{
        NONE: "NONE";
        ONE: "ONE";
        TWO_PLUS: "TWO_PLUS";
    }>>;
    paysMortgageInsurance: z.ZodOptional<z.ZodBoolean>;
    propertyCity: z.ZodOptional<z.ZodString>;
    propertyState: z.ZodOptional<z.ZodString>;
    propertyCounty: z.ZodOptional<z.ZodString>;
    propertyZip: z.ZodOptional<z.ZodString>;
    unitCount: z.ZodOptional<z.ZodNumber>;
    docType: z.ZodOptional<z.ZodEnum<{
        VA: "VA";
        BANK_STATEMENT: "BANK_STATEMENT";
        DSCR: "DSCR";
        HECM: "HECM";
    }>>;
    incomeMethod: z.ZodOptional<z.ZodEnum<{
        personal_bank: "personal_bank";
        business_bank: "business_bank";
        pnl: "pnl";
        1099: "1099";
        asset_depletion: "asset_depletion";
    }>>;
    statementMonths: z.ZodOptional<z.ZodNumber>;
    avgMonthlyDeposits: z.ZodOptional<z.ZodNumber>;
    annualNetIncome: z.ZodOptional<z.ZodNumber>;
    annual1099: z.ZodOptional<z.ZodNumber>;
    liquidAssets: z.ZodOptional<z.ZodNumber>;
    expenseFactorSource: z.ZodOptional<z.ZodEnum<{
        fixed: "fixed";
        cpa_stated: "cpa_stated";
    }>>;
    statedExpenseRatio: z.ZodOptional<z.ZodNumber>;
    loanAmount: z.ZodOptional<z.ZodNumber>;
    ltv: z.ZodOptional<z.ZodNumber>;
    annualTaxes: z.ZodOptional<z.ZodNumber>;
    annualInsurance: z.ZodOptional<z.ZodNumber>;
    monthlyHoa: z.ZodOptional<z.ZodNumber>;
    otherMonthlyDebts: z.ZodOptional<z.ZodNumber>;
    expectedRate: z.ZodOptional<z.ZodNumber>;
    reservesMonths: z.ZodOptional<z.ZodNumber>;
    interestOnly: z.ZodOptional<z.ZodBoolean>;
    amortTermMonths: z.ZodOptional<z.ZodNumber>;
    prepayTerm: z.ZodOptional<z.ZodNumber>;
    residency: z.ZodOptional<z.ZodEnum<{
        us_citizen: "us_citizen";
        permanent_resident: "permanent_resident";
        itin: "itin";
        foreign_national: "foreign_national";
    }>>;
    existingLienBalance: z.ZodOptional<z.ZodNumber>;
    businessType: z.ZodOptional<z.ZodString>;
    yearsSelfEmployed: z.ZodOptional<z.ZodNumber>;
    entityType: z.ZodOptional<z.ZodEnum<{
        sole_prop: "sole_prop";
        llc: "llc";
        s_corp: "s_corp";
        c_corp: "c_corp";
        partnership: "partnership";
    }>>;
    numberOfBusinesses: z.ZodOptional<z.ZodNumber>;
    cpaRelationship: z.ZodOptional<z.ZodEnum<{
        yes: "yes";
        no: "no";
        considering: "considering";
    }>>;
    incomePosture: z.ZodOptional<z.ZodEnum<{
        pnl: "pnl";
        1099: "1099";
        bank_statements: "bank_statements";
        mixed: "mixed";
    }>>;
    leadSource: z.ZodOptional<z.ZodEnum<{
        realtor: "realtor";
        cpa_attorney: "cpa_attorney";
        referral: "referral";
        online: "online";
        repeat_client: "repeat_client";
        other: "other";
    }>>;
    bestTimeToCall: z.ZodOptional<z.ZodEnum<{
        mornings: "mornings";
        afternoons: "afternoons";
        evenings: "evenings";
        anytime: "anytime";
    }>>;
    rentBasis: z.ZodOptional<z.ZodEnum<{
        LEASE: "LEASE";
        MARKET: "MARKET";
        STR: "STR";
    }>>;
    leaseRent: z.ZodOptional<z.ZodNumber>;
    marketRent: z.ZodOptional<z.ZodNumber>;
    strIncome: z.ZodOptional<z.ZodNumber>;
    monthlyRent: z.ZodOptional<z.ZodNumber>;
    borrowerAge: z.ZodOptional<z.ZodNumber>;
    coBorrowerAge: z.ZodOptional<z.ZodNumber>;
    existingLienPayoff: z.ZodOptional<z.ZodNumber>;
    reverseProductKind: z.ZodOptional<z.ZodEnum<{
        HECM_ADJUSTABLE: "HECM_ADJUSTABLE";
        HECM_FIXED: "HECM_FIXED";
        HOMESAFE_ADJUSTABLE: "HOMESAFE_ADJUSTABLE";
        HOMESAFE_FIXED: "HOMESAFE_FIXED";
    }>>;
    useOfProceeds: z.ZodOptional<z.ZodString>;
    vaCoeStatus: z.ZodOptional<z.ZodEnum<{
        HAVE: "HAVE";
        APPLIED: "APPLIED";
        UNKNOWN: "UNKNOWN";
    }>>;
    vaDisabilityRating: z.ZodOptional<z.ZodEnum<{
        NONE: "NONE";
        "10_PLUS": "10_PLUS";
    }>>;
    vaIsSurvivingSpouse: z.ZodOptional<z.ZodBoolean>;
    vaPriorVaLoanOpen: z.ZodOptional<z.ZodBoolean>;
    vaUsedEntitlement: z.ZodOptional<z.ZodNumber>;
    vaEntitlementRestored: z.ZodOptional<z.ZodBoolean>;
    vaHouseholdSize: z.ZodOptional<z.ZodNumber>;
    vaGrossMonthlyIncome: z.ZodOptional<z.ZodNumber>;
    vaMonthlyDebts: z.ZodOptional<z.ZodNumber>;
    vaCountyFips: z.ZodOptional<z.ZodString>;
    magnetType: z.ZodOptional<z.ZodEnum<{
        other: "other";
        free_prequal: "free_prequal";
        free_home_value: "free_home_value";
        free_buying_power: "free_buying_power";
        free_neighborhood_report: "free_neighborhood_report";
    }>>;
    scoutLeadMagnetId: z.ZodOptional<z.ZodString>;
    scoutIntentSignal: z.ZodOptional<z.ZodEnum<{
        buying_now: "buying_now";
        buying_3_6mo: "buying_3_6mo";
        buying_6_12mo: "buying_6_12mo";
        researching: "researching";
    }>>;
    scoutSubmittedAt: z.ZodOptional<z.ZodString>;
    scoutFormPayload: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export type PfpIntakeFromSpokePayload = z.infer<typeof PfpIntakeFromSpokePayloadSchema>;
//# sourceMappingURL=index.d.ts.map