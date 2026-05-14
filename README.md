# @rello-platform/pfp-intake-from-spoke

Canonical zod payload schema for cross-app **PFP `LeadIntake` creation initiated by a spoke** (e.g., Home Scout's `get-pre-approved` CTA writing a row in Pathfinder Pro's pre-approval cockpit).

## Topology

Spoke → Spoke (per `~API-KEY-LIFECYCLE-README.md` §2 topology #4):

```
Home Scout (origin)  ──HTTP POST──▶  Pathfinder Pro /api/intakes/from-spoke (receiver)
                  Bearer: HS-issued ApiKey row
                  with permission: pfp-intake-from-spoke:write
```

The PFP receiver validates the Bearer via `requireServiceBearer` against `@rello-platform/permissions::INTAKE_FROM_SPOKE_WRITE` and parses the request body against `PfpIntakeFromSpokePayloadSchema` before creating the row with `status: "QUICK_ESTIMATE"`.

## Install (consumer side)

```sh
npm install --save 'github:rello-platform/pfp-intake-from-spoke#v0.1.0'
```

Consumers pin to a tag (not `main`) per [[feedback-npm-github-tag-stale-resolve]]. The repo commits `dist/` per [[feedback-rello-platform-packages-must-commit-dist-not-prepare-script]] — Railway nixpacks resolves the consumer dependency without needing `prepare` to run.

## Usage

```ts
import {
  PfpIntakeFromSpokePayloadSchema,
  type PfpIntakeFromSpokePayload,
} from "@rello-platform/pfp-intake-from-spoke";

// Spoke side (HS): build payload + POST
const payload: PfpIntakeFromSpokePayload = {
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  loanPurpose: "PURCHASE",
  propertyType: "SINGLE_FAMILY",
  occupancy: "PRIMARY",
  isFirstTimeBuyer: true,
  purchaseStage: "BUYING_2_TO_6_MONTHS",
  wantsAgentReferral: false,
  purchasePrice: 450_000,
  downPaymentAmount: 90_000,
  downPaymentPct: 20,
  creditScoreRange: "740-779",
  creditScore: 760,
  militaryServiceType: null,
  isVeteran: false,
  employmentType: "W2",
  baseIncome: 120_000,
  yearsSinceBankruptcy: "NEVER",
  hasForeclosureHistory: false,
  yearsSinceForeclosure: null,
};

// Receiver side (PFP): validate inside route handler
const parsed = PfpIntakeFromSpokePayloadSchema.safeParse(await request.json());
if (!parsed.success) {
  return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
}
```

## Field reference

15-question survey + capture-card per Kelly's `2026-05-12` lock (HS `ANSWERS.md` §16 Q-NEW-5). Each field maps 1:1 to a PFP `LeadIntake` column.

| Field | PFP `LeadIntake` column | Enum-source notes |
|---|---|---|
| `firstName`, `lastName`, `email`, `phone`, `notes` | `firstName` / `lastName` / `email` / `phone` / `notes` | — |
| `loanPurpose` | `loanPurpose String?` | PFP-canonical (`PURCHASE` / `REFINANCE`) |
| `propertyType` | `propertyType String?` | PFP-canonical (`SINGLE_FAMILY` / `CONDO` / `TOWN_HOME` / `MULTI_FAMILY`) |
| `occupancy` | `occupancy String?` | PFP-canonical (`PRIMARY` / `SECONDARY` / `RENTAL`) |
| `isFirstTimeBuyer` | `isFirstTimeBuyer Boolean?` | — |
| `purchaseStage` | `purchaseStage String?` *(NEW — MAIN-BUILD PR 4)* | HS-canonical 4-bucket |
| `wantsAgentReferral` | `wantsAgentReferral Boolean?` *(NEW — MAIN-BUILD PR 4)* | — |
| `purchasePrice` | `purchasePrice Float?` | $50k-$10M validated |
| `downPaymentAmount`, `downPaymentPct` | `downPaymentAmount Float?` + `downPaymentPct Float?` | both stored; % drives slider |
| `creditScoreRange`, `creditScore` | `creditScoreRange String?` + derived `creditScore Int?` | HS 7-bucket; PFP-side extension lands in MAIN-BUILD PR 4 (Kelly 2026-05-12 adjudication) |
| `militaryServiceType`, `isVeteran` | `militaryServiceType String?` + `isVeteran Boolean` | PFP-canonical (`ACTIVE_DUTY` / `VETERAN` / `RESERVE_GUARD`; nullable when "None") |
| `employmentType` | `employmentType String?` | PFP-canonical naming: `W2` (NOT `W2_EMPLOYEE`); `RETIRED` is PFP-extend in MAIN-BUILD PR 4 (Kelly 2026-05-12 adjudication) |
| `baseIncome` | `baseIncome Float?` | gross annual borrower(s) |
| `yearsSinceBankruptcy` | `yearsSinceBankruptcy String?` | HS surveys narrow `NEVER` / `LESS_THAN_7`; MLO refines to PFP's wider documented enum (`NEVER` / `LESS_THAN_1` / `1_TO_2` / `2_TO_3` / `3_TO_4` / `4_TO_5` / `5_TO_7` / `7_PLUS`) post-intake |
| `hasForeclosureHistory`, `yearsSinceForeclosure` | `hasForeclosureHistory Boolean?` + `yearsSinceForeclosure String?` | same narrow-union pattern as `yearsSinceBankruptcy` |

## v0.3.0 — Lead-magnet discriminator + scout_* cache (2026-05-14)

Additive optional fields appended to `PfpIntakeFromSpokePayloadSchema` for the Home Scout lead-magnet → PFP intake flow. All fields are optional; v0.2.0 callers (the shipped `get-pre-approved` flow) remain byte-identical.

| Field | Type | Purpose |
|---|---|---|
| `magnetType` | enum `free_prequal` \| `free_home_value` \| `free_buying_power` \| `free_neighborhood_report` \| `other` (optional) | Discriminator; non-null marks the payload as a lead-magnet flow. Null/absent = generic spoke intake (the existing `get-pre-approved` flow). |
| `scoutLeadMagnetId` | string (1-64 chars, optional) | HS StandaloneForm or LeadMagnet row id; cross-spoke FK semantically (no DB constraint). |
| `scoutIntentSignal` | enum `buying_now` \| `buying_3_6mo` \| `buying_6_12mo` \| `researching` (optional) | Buyer intent slug captured by the HS magnet form. |
| `scoutSubmittedAt` | ISO datetime string (optional) | HS `FormSubmission.createdAt`. Distinct from PFP `LeadIntake.createdAt`. |
| `scoutFormPayload` | `Record<string, unknown>` (optional) | Catch-all for non-canonical HS form fields (UTM attribution, custom configurator inputs). |

The PFP receiver at `POST /api/intakes/from-spoke` branches on `payload.magnetType != null` to populate first-class `scout*` cache columns on `LeadIntake` + set `source: "HS_LEAD_MAGNET"`. See `SPEC-PFP-HS-REFERRAL-PATH` for the full receiver-side contract.

Backward-compat: `z.object` default-strips unknown keys (no `.strict()` / no `.passthrough()` on the schema), so v0.2.0 callers omitting the new fields produce byte-identical validation behavior.

## Versioning

- `0.1.0` — initial schema (15-field survey + capture-card; PFP-canonical enums; `creditScoreRange` 7-bucket + `employmentType.RETIRED` per Kelly 2026-05-12 adjudication, awaiting PFP-side extension in MAIN-BUILD PR 4).

## Related platform packages

- `@rello-platform/permissions` — `INTAKE_FROM_SPOKE_WRITE` (slug `pfp-intake-from-spoke:write`, `validatedBy: ["pathfinder-pro"]`).
- `@rello-platform/api-client` — `getPathfinderProBaseUrl()` for outbound HS→PFP URL normalization.
- `@rello-platform/slugs` — `APP_SLUGS` / `ENGINE_SLUGS` registry (consumed via the permissions package).
