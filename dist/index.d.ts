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
    isFirstTimeBuyer: z.ZodBoolean;
    purchaseStage: z.ZodEnum<{
        SIGNED_PURCHASE_AGREEMENT: "SIGNED_PURCHASE_AGREEMENT";
        BUYING_2_TO_6_MONTHS: "BUYING_2_TO_6_MONTHS";
        OFFER_PENDING: "OFFER_PENDING";
        RESEARCHING: "RESEARCHING";
    }>;
    wantsAgentReferral: z.ZodBoolean;
    purchasePrice: z.ZodNumber;
    downPaymentAmount: z.ZodNumber;
    downPaymentPct: z.ZodNumber;
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
}, z.core.$strip>;
export type PfpIntakeFromSpokePayload = z.infer<typeof PfpIntakeFromSpokePayloadSchema>;
//# sourceMappingURL=index.d.ts.map