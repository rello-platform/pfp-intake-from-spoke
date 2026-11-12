import { describe, expect, it } from "vitest";
import {
  CYR_QUOTE_CONTRACT_VERSION_TO_V,
  CYR_QUOTE_IDEMPOTENCY_KEY_LENGTH,
  HsCyrQuoteIntakePayloadSchema,
  PfpIntakeFromSpokePayloadSchema,
  cyrQuoteIdempotencyKey,
  cyrQuoteSendEligibility,
  parsePfpIntakeFromSpokeRequest,
  type StoredCyrQuoteSubmission,
} from "../src/index";

/**
 * v0.11.0 — the HS_CYR_QUOTE branch (PFP GATEWAY G-8; H-51 item 1, H-68, H-69).
 * Fixtures are Home Scout `CyrQuoteSubmission` rows as HS stores them (shape from HS
 * src/lib/find-your-rate/cyr-quote-store.ts and its g8-cyr-quote test).
 */

const PRICED_SCENARIO = {
  answers: {
    purpose: "buy",
    price: "400000",
    down: "20000",
    zip: "84020",
    occupancy: "PRIMARY",
    propertyType: "SINGLE_FAMILY",
    credit: "FICO_700_719",
    horizon: "FIVE_TO_10",
  },
  horizon: "FIVE_TO_10",
  program: null,
  pricingStatus: "priced",
  quotedAt: "2026-11-11",
  rateType: "RATE_CONV_30YR",
  productName: "Conventional 30-Year Fixed",
  loanAmount: "$380,000",
  downPaymentPct: "5%",
  rowsStatus: "stated",
  rows: [
    { side: "now", rate: "6.500%", apr: "6.612%", closing: "$1,200", closingKind: "pay", monthly: "$2,402", monthlyTotal: null, termMonths: 360 },
    { side: "monthly", rate: "6.125%", apr: "6.380%", closing: "$6,100", closingKind: "pay", monthly: "$2,309", monthlyTotal: "$2,475", termMonths: 360 },
  ],
};

/** A stated refinance: CYR does not price it, so pricingStatus is not "priced" and rows are null (not []). */
const STATED_UNPRICED_SCENARIO = {
  answers: {
    purpose: "refinance",
    propertyValue: "550000",
    loanBalance: "300000",
    cashOutWanted: "true",
    cashOut: "40000",
    currentLoanType: "FHA",
    zip: "84020",
    occupancy: "PRIMARY",
    propertyType: "CONDO",
    credit: "FICO_760_PLUS",
    horizon: "UNSURE",
  },
  horizon: "UNSURE",
  program: null,
  pricingStatus: "refused",
  quotedAt: null,
  rateType: null,
  productName: null,
  loanAmount: null,
  downPaymentPct: null,
  rowsStatus: "not_priced",
  rows: null,
};

const PRICED_ROW: StoredCyrQuoteSubmission = {
  submissionKey: "3f0c2a8e-1d2b-4c5e-9f00-aa11bb22cc33",
  contractVersion: 1,
  scenarioStatus: "stated",
  scenario: PRICED_SCENARIO,
  relloLeadId: "lead-123",
};
const UNPRICED_ROW: StoredCyrQuoteSubmission = {
  submissionKey: "hs_9b1e6a30-77f1-4c55-8d2e-0f1a2b3c4d5e",
  contractVersion: 1,
  scenarioStatus: "stated",
  scenario: STATED_UNPRICED_SCENARIO,
  relloLeadId: "lead-456",
};

const LONGEST_KEY = "k".repeat(50) + "_-".repeat(25); // 100 characters, the longest HS permits
const ALL_SUBMISSION_KEYS = [
  PRICED_ROW.submissionKey,
  UNPRICED_ROW.submissionKey,
  LONGEST_KEY,
  "abcdefgh", // the shortest
  "abcdefgi",
  "ABCDEFGH",
  "hs_" + "0".repeat(97),
  "hs_" + "0".repeat(96) + "1",
];

function payloadFor(row: StoredCyrQuoteSubmission, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const e = cyrQuoteSendEligibility(row);
  if (!e.eligible) throw new Error(`fixture not eligible: ${e.reason}`);
  return {
    source: "HS_CYR_QUOTE",
    agentSlug: "jane",
    relloLeadId: row.relloLeadId,
    leadOwnerId: "user_owner_1",
    sendIdempotencyKey: e.sendIdempotencyKey,
    firstName: "Pat",
    email: "pat@example.com",
    cyrQuote: e.cyrQuote,
    ...extra,
  };
}

describe("H-68 — the idempotency key is a fixed-length hash, never the raw submissionKey", () => {
  it("the longest valid submissionKey (100 chars) yields a 48-character key inside the 64 limit", () => {
    expect(LONGEST_KEY.length).toBe(100);
    const key = cyrQuoteIdempotencyKey(LONGEST_KEY);
    expect(key.length).toBe(CYR_QUOTE_IDEMPOTENCY_KEY_LENGTH);
    expect(key.length).toBeLessThanOrEqual(64);
    expect(key.startsWith("cyrq:")).toBe(true);
    expect(key).not.toContain(LONGEST_KEY.slice(0, 20));
  });

  it("every key is exactly 48 characters, whatever the submissionKey's length", () => {
    for (const k of ALL_SUBMISSION_KEYS) expect(cyrQuoteIdempotencyKey(k)).toHaveLength(48);
  });

  it("the key is not the raw key (a uuid submissionKey never appears in it)", () => {
    const key = cyrQuoteIdempotencyKey(PRICED_ROW.submissionKey);
    expect(key).not.toBe(`cyrq:${PRICED_ROW.submissionKey}`);
    expect(key).not.toContain(PRICED_ROW.submissionKey);
  });

  it("a replay of the same submission gives the same key", () => {
    expect(cyrQuoteIdempotencyKey(PRICED_ROW.submissionKey)).toBe(cyrQuoteIdempotencyKey(PRICED_ROW.submissionKey));
    const a = cyrQuoteSendEligibility(PRICED_ROW);
    const b = cyrQuoteSendEligibility({ ...PRICED_ROW });
    expect(a.eligible && b.eligible && a.sendIdempotencyKey === b.sendIdempotencyKey).toBe(true);
  });

  it("two different submissionKeys never collide in the fixture set", () => {
    const keys = ALL_SUBMISSION_KEYS.map(cyrQuoteIdempotencyKey);
    expect(new Set(ALL_SUBMISSION_KEYS).size).toBe(ALL_SUBMISSION_KEYS.length);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("the stated derivation: cyrq: + base64url(sha256(key)), pinned for one key", () => {
    // sha256("abcdefgh") base64url, computed independently (openssl dgst -sha256 -binary | base64 | tr '+/' '-_' | tr -d '=')
    expect(cyrQuoteIdempotencyKey("abcdefgh")).toBe("cyrq:nFbMUbN0w7oYkhDVttS_V3kNNRyWxHwCGQ7PHkMGNas");
  });

  it("a payload carrying the RAW key (or another quote's key) is refused", () => {
    const raw = payloadFor(PRICED_ROW, { sendIdempotencyKey: `cyrq:${PRICED_ROW.submissionKey}` });
    expect(HsCyrQuoteIntakePayloadSchema.safeParse(raw).success).toBe(false);
    const other = payloadFor(PRICED_ROW, { sendIdempotencyKey: cyrQuoteIdempotencyKey(UNPRICED_ROW.submissionKey) });
    const r = HsCyrQuoteIntakePayloadSchema.safeParse(other);
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path.join("."))).toContain("sendIdempotencyKey");
  });

  it("an invalid submissionKey is refused by the derivation (never hashed into a key)", () => {
    expect(() => cyrQuoteIdempotencyKey("short")).toThrow(/submissionKey must match/);
    expect(() => cyrQuoteIdempotencyKey("k".repeat(101))).toThrow(/submissionKey must match/);
    expect(() => cyrQuoteIdempotencyKey("has space1")).toThrow(/submissionKey must match/);
  });
});

describe("the branch is discriminated — it never inherits PURCHASE's required borrower fields", () => {
  it("a CYR payload with no creditScore / employmentType / baseIncome / veteran / bankruptcy fields parses", () => {
    const r = parsePfpIntakeFromSpokeRequest(payloadFor(PRICED_ROW));
    if (!r.success) throw new Error(r.error.message);
    expect(r.data.kind).toBe("HS_CYR_QUOTE");
  });

  it("lastName and phone are optional; firstName and email are required", () => {
    expect(parsePfpIntakeFromSpokeRequest(payloadFor(PRICED_ROW, { lastName: "Example", phone: "(801) 555-0199" })).success).toBe(true);
    const noFirst = payloadFor(PRICED_ROW);
    delete noFirst.firstName;
    expect(parsePfpIntakeFromSpokeRequest(noFirst).success).toBe(false);
    const noEmail = payloadFor(PRICED_ROW);
    delete noEmail.email;
    expect(parsePfpIntakeFromSpokeRequest(noEmail).success).toBe(false);
  });

  it("relloLeadId is required and non-null; leadOwnerId must be stated (null = unknown)", () => {
    expect(parsePfpIntakeFromSpokeRequest(payloadFor(PRICED_ROW, { relloLeadId: null })).success).toBe(false);
    const noOwner = payloadFor(PRICED_ROW);
    delete noOwner.leadOwnerId;
    expect(parsePfpIntakeFromSpokeRequest(noOwner).success).toBe(false);
    expect(parsePfpIntakeFromSpokeRequest(payloadFor(PRICED_ROW, { leadOwnerId: null })).success).toBe(true);
  });

  it("the form schema alone refuses the same payload — the discriminator is what admits it", () => {
    const r = PfpIntakeFromSpokePayloadSchema.safeParse(payloadFor(PRICED_ROW));
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["creditScore", "employmentType", "baseIncome", "isVeteran"]));
  });

  it("a malformed CYR payload never falls through to the form schema, even carrying every PURCHASE field", () => {
    const purchaseFields = {
      lastName: "Doe", loanPurpose: "PURCHASE", propertyType: "SINGLE_FAMILY", occupancy: "PRIMARY",
      creditScoreRange: "740-779", creditScore: 760, militaryServiceType: null, isVeteran: false, employmentType: "W2",
      baseIncome: 120000, yearsSinceBankruptcy: "NEVER", hasForeclosureHistory: false, yearsSinceForeclosure: null,
      isFirstTimeBuyer: true, purchaseStage: "RESEARCHING", wantsAgentReferral: false, purchasePrice: 400000,
      downPaymentAmount: 20000, downPaymentPct: 5, sendIdempotencyKey: "x", agentSlug: "jane", firstName: "P", email: "p@example.com",
    };
    expect(PfpIntakeFromSpokePayloadSchema.safeParse(purchaseFields).success).toBe(true); // control: a valid form payload
    expect(parsePfpIntakeFromSpokeRequest({ ...purchaseFields, source: "HS_CYR_QUOTE" }).success).toBe(false);
  });

  it("an unknown source is refused, not read as a form payload", () => {
    const r = parsePfpIntakeFromSpokeRequest({ ...payloadFor(PRICED_ROW), source: "SOMETHING_ELSE" });
    expect(r.success).toBe(false);
  });

  it("a request with no source is the form schema, unchanged (existing senders)", () => {
    const form = {
      agentSlug: "jane", sendIdempotencyKey: "lead:get-pre-approved:1", firstName: "Jane", lastName: "Doe",
      email: "jane@example.com", loanPurpose: "PURCHASE", propertyType: "SINGLE_FAMILY", occupancy: "PRIMARY",
      isFirstTimeBuyer: true, purchaseStage: "BUYING_2_TO_6_MONTHS", wantsAgentReferral: false, purchasePrice: 450000,
      downPaymentAmount: 90000, downPaymentPct: 20, creditScoreRange: "740-779", creditScore: 760, militaryServiceType: null,
      isVeteran: false, employmentType: "W2", baseIncome: 120000, yearsSinceBankruptcy: "NEVER", hasForeclosureHistory: false,
      yearsSinceForeclosure: null,
    };
    const r = parsePfpIntakeFromSpokeRequest(form);
    if (!r.success) throw new Error(r.error.message);
    expect(r.data.kind).toBe("SPOKE_FORM");
    expect(r.data.payload).toEqual(PfpIntakeFromSpokePayloadSchema.parse(form));
  });
});

describe("H-69 — strict envelope", () => {
  it.each([
    ["top level: tenantId", (p: Record<string, unknown>) => ({ ...p, tenantId: "tenant_x" })],
    ["top level: creditScore", (p: Record<string, unknown>) => ({ ...p, creditScore: 760 })],
    ["top level: loanPurpose", (p: Record<string, unknown>) => ({ ...p, loanPurpose: "PURCHASE" })],
    ["cyrQuote: extra key", (p: Record<string, unknown>) => ({ ...p, cyrQuote: { ...(p.cyrQuote as object), extra: 1 } })],
    [
      "scenario: extra key",
      (p: Record<string, unknown>) => {
        const q = p.cyrQuote as { scenario: object };
        return { ...p, cyrQuote: { ...q, scenario: { ...q.scenario, ssn: "123" } } };
      },
    ],
    [
      "row: extra key",
      (p: Record<string, unknown>) => {
        const q = p.cyrQuote as { scenario: { rows: object[] } };
        return { ...p, cyrQuote: { ...q, scenario: { ...q.scenario, rows: [{ ...q.scenario.rows[0], lender: "x" }] } } };
      },
    ],
  ])("refuses an unknown field (%s)", (_name, mutate) => {
    expect(parsePfpIntakeFromSpokeRequest(mutate(payloadFor(PRICED_ROW))).success).toBe(false);
  });

  it("contractVersion → v is stated: 1 → 1, and nothing else is known", () => {
    expect(CYR_QUOTE_CONTRACT_VERSION_TO_V).toEqual({ 1: 1 });
    expect(cyrQuoteSendEligibility({ ...PRICED_ROW, contractVersion: 2 })).toEqual({ eligible: false, reason: "contract_version_unknown" });
    expect(parsePfpIntakeFromSpokeRequest(payloadFor(PRICED_ROW, { cyrQuote: { ...(payloadFor(PRICED_ROW).cyrQuote as object), v: 2 } })).success).toBe(false);
  });

  it("only scenarioStatus 'stated' is sent; rows [] is refused (null is the only 'no rows')", () => {
    const q = payloadFor(UNPRICED_ROW).cyrQuote as { scenario: object };
    expect(parsePfpIntakeFromSpokeRequest(payloadFor(UNPRICED_ROW, { cyrQuote: { ...q, scenarioStatus: "answers_missing" } })).success).toBe(false);
    expect(parsePfpIntakeFromSpokeRequest(payloadFor(UNPRICED_ROW, { cyrQuote: { ...q, scenario: { ...q.scenario, rows: [] } } })).success).toBe(false);
    // rows present with rowsStatus not "stated" is refused too
    const p = payloadFor(PRICED_ROW).cyrQuote as { scenario: object };
    expect(parsePfpIntakeFromSpokeRequest(payloadFor(PRICED_ROW, { cyrQuote: { ...p, scenario: { ...p.scenario, rowsStatus: "pair_absent" } } })).success).toBe(false);
  });
});

describe("H-69 — stored HS row → package → parsed payload round trips preserve every status and every null", () => {
  it.each([
    ["priced", PRICED_ROW],
    ["stated-unpriced", UNPRICED_ROW],
  ])("%s: the parsed cyrQuote equals the stored row, field for field", (_name, row) => {
    const r = parsePfpIntakeFromSpokeRequest(JSON.parse(JSON.stringify(payloadFor(row))));
    if (!r.success) throw new Error(r.error.message);
    if (r.data.kind !== "HS_CYR_QUOTE") throw new Error("wrong branch");
    const q = r.data.payload.cyrQuote;
    expect(q.v).toBe(row.contractVersion);
    expect(q.submissionKey).toBe(row.submissionKey);
    expect(q.scenarioStatus).toBe(row.scenarioStatus);
    expect(q.scenario).toEqual(row.scenario);
    // toEqual treats undefined and missing alike; check nulls and key sets exactly
    expect(Object.keys(q.scenario).sort()).toEqual(Object.keys(row.scenario as object).sort());
    for (const [k, v] of Object.entries(row.scenario as Record<string, unknown>)) {
      if (v === null) expect((q.scenario as Record<string, unknown>)[k]).toBeNull();
    }
  });

  it("stated-unpriced keeps rows null (never []), pricingStatus and rowsStatus each their own value", () => {
    const e = cyrQuoteSendEligibility(UNPRICED_ROW);
    if (!e.eligible) throw new Error(e.reason);
    expect(e.cyrQuote.scenario.rows).toBeNull();
    expect(e.cyrQuote.scenario.pricingStatus).toBe("refused");
    expect(e.cyrQuote.scenario.rowsStatus).toBe("not_priced");
    expect(e.cyrQuote.scenario.quotedAt).toBeNull();
    expect(e.cyrQuote.scenario.program).toBeNull();
  });

  it("priced keeps a null monthlyTotal null and the second row's string verbatim", () => {
    const e = cyrQuoteSendEligibility(PRICED_ROW);
    if (!e.eligible) throw new Error(e.reason);
    expect(e.cyrQuote.scenario.rows?.[0].monthlyTotal).toBeNull();
    expect(e.cyrQuote.scenario.rows?.[1].monthlyTotal).toBe("$2,475");
  });

  it.each(["unreadable", "answers_missing", "answers_invalid", "intake_unavailable"])(
    "a %s row is counted, not sent",
    (status) => {
      expect(cyrQuoteSendEligibility({ ...PRICED_ROW, scenarioStatus: status, scenario: null })).toEqual({
        eligible: false,
        reason: `scenario_status:${status}`,
      });
    },
  );

  it("a stated row without a relloLeadId is not sent", () => {
    expect(cyrQuoteSendEligibility({ ...PRICED_ROW, relloLeadId: null })).toEqual({ eligible: false, reason: "no_rello_lead" });
  });

  it("a stated row whose scenario does not match the contract is not sent (named, not thrown)", () => {
    expect(cyrQuoteSendEligibility({ ...PRICED_ROW, scenario: { ...PRICED_SCENARIO, rows: [] } })).toEqual({
      eligible: false,
      reason: "scenario_unreadable",
    });
  });
});
