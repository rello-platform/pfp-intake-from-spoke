/**
 * @rello-platform/pfp-intake-from-spoke
 *
 * Canonical zod payload schema for cross-app PFP LeadIntake creation initiated
 * by a spoke (e.g., Home Scout's `get-pre-approved` CTA). The PFP receiver
 * endpoint `POST /api/intakes/from-spoke` validates incoming payloads against
 * `PfpIntakeFromSpokePayloadSchema` and writes a `LeadIntake` row with
 * `status: "QUICK_ESTIMATE"`.
 *
 * Field set is the 15-question survey + capture-card lock authored by Kelly
 * 2026-05-12 (see HS `ANSWERS.md` §16 Q-NEW-5). Each field maps 1:1 to PFP
 * `LeadIntake` columns; two additive PFP columns (`purchaseStage`,
 * `wantsAgentReferral`) ship in the gated MAIN-BUILD wave PR 4. The
 * `creditScoreRange` 7-bucket scheme and `employmentType.RETIRED` value
 * require companion PFP-side enum extensions (also MAIN-BUILD PR 4) per
 * Kelly 2026-05-12 adjudication.
 *
 * Auth: PFP receiver gates via `requireServiceBearer` + the
 * `pfp-intake-from-spoke:write` permission slug (added in
 * `@rello-platform/permissions` at v0.30.0 alongside this package's v0.1.0).
 */

import { z } from "zod";

export const PfpIntakeFromSpokePayloadSchema = z.object({
  // ─── Identity (capture-card per Q-NEW-5 Q15) ───
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email().max(200),
  phone: z.string().min(7).max(40).optional(),
  notes: z.string().max(2000).optional(),

  // ─── 14 survey-answer fields (verbatim from ANSWERS §16 Q-NEW-5 table) ───

  // Q1 — loan purpose (PFP canonical: PURCHASE | REFINANCE)
  loanPurpose: z.enum(["PURCHASE", "REFINANCE"]),

  // Q2 — property type (PFP canonical)
  propertyType: z.enum(["SINGLE_FAMILY", "CONDO", "TOWN_HOME", "MULTI_FAMILY"]),

  // Q3 — occupancy (PFP canonical)
  occupancy: z.enum(["PRIMARY", "SECONDARY", "RENTAL"]),

  // Q4 — first-time buyer
  isFirstTimeBuyer: z.boolean(),

  // Q5 — purchase stage (NEW field on PFP LeadIntake; ships in MAIN-BUILD PR 4)
  purchaseStage: z.enum([
    "SIGNED_PURCHASE_AGREEMENT",
    "BUYING_2_TO_6_MONTHS",
    "OFFER_PENDING",
    "RESEARCHING",
  ]),

  // Q6 — wants agent referral (NEW field on PFP LeadIntake; ships in MAIN-BUILD PR 4)
  wantsAgentReferral: z.boolean(),

  // Q7 — purchase price
  purchasePrice: z.number().nonnegative().max(10_000_000),

  // Q8 — down payment ($ + % both stored; % drives slider)
  downPaymentAmount: z.number().nonnegative(),
  downPaymentPct: z.number().min(0).max(100),

  // Q9 — credit score (HS 7-bucket scheme; PFP-side accepted-values extension
  // ships in MAIN-BUILD PR 4 per Kelly 2026-05-12 adjudication)
  creditScoreRange: z.enum([
    "780+",
    "740-779",
    "700-739",
    "660-699",
    "620-659",
    "580-619",
    "Below 580",
  ]),
  // Derived per prefillMap ("780+"→800, "740-779"→760, "700-739"→720,
  // "660-699"→680, "620-659"→640, "580-619"→600, "Below 580"→560)
  creditScore: z.number().int().min(300).max(850),

  // Q10 — military status (PFP canonical; nullable when "None")
  militaryServiceType: z
    .enum(["ACTIVE_DUTY", "VETERAN", "RESERVE_GUARD"])
    .nullable(),
  isVeteran: z.boolean(),

  // Q11 — employment status (PFP canonical naming W2 not W2_EMPLOYEE per
  // 2026-05-12 lock; RETIRED is PFP-extend in MAIN-BUILD PR 4)
  employmentType: z.enum(["W2", "SELF_EMPLOYED", "RETIRED"]),

  // Q12 — base income (gross annual borrower(s))
  baseIncome: z.number().nonnegative().max(10_000_000),

  // Q13 — bankruptcy in last 7 years (HS surveys narrow union; MLO refines
  // to PFP's wider documented enum post-intake)
  yearsSinceBankruptcy: z.enum(["NEVER", "LESS_THAN_7"]),

  // Q14 — foreclosure in last 7 years (same narrow-union pattern as Q13)
  hasForeclosureHistory: z.boolean(),
  yearsSinceForeclosure: z.enum(["NEVER", "LESS_THAN_7"]).nullable(),
});

export type PfpIntakeFromSpokePayload = z.infer<
  typeof PfpIntakeFromSpokePayloadSchema
>;
