import { describe, expect, it } from "vitest";
import { type FlaggedScene, buildReport } from "../src/report";

const flag = (over: Partial<FlaggedScene>): FlaggedScene => ({ id: "x", pairing: "A/B", card: "blowjob", top: "A", bottom: "B", topVerb: "gets sucked", bottomVerb: "sucks cock", act: "blowjob", pattern: "lips-around", evidence: "A made-up sentence.", confidence: 0.57, reasons: [], note: "", ...over });
const base = { source: "patterns", summaries: [], missed: [], general: "" };

describe("the mistake report keeps what looks right", () => {
  it("lists the items marked right in their own section, without ‘what is wrong’", () => {
    const text = buildReport({ ...base, flags: [flag({ id: "w", reasons: ["swapped"] })], right: [flag({ id: "r", evidence: "A sentence that is fine." })] });
    expect(text).toContain("## Things I think are wrong (1)");
    expect(text).toContain("## Things I checked that look right (1)");
    const right = text.slice(text.indexOf("## Things I checked that look right"));
    expect(right).toContain("A sentence that is fine.");
    expect(right).toContain("Pattern: lips-around");
    expect(right).not.toContain("What is wrong");
    expect(text).toContain("Give those more weight than the rest");
    expect(text).toContain("not readings that are correct in every circumstance");
  });
  it("works with only right items, and with a note, a hint, a vibe rating and a factor", () => {
    const text = buildReport({ ...base, flags: [], right: [
      flag({ id: "1", note: "Exactly as written." }),
      flag({ id: "2", kind: "hint", card: "anal", top: "A", bottom: "top (said)", act: "anal sex" }),
      flag({ id: "3", kind: "vibe", card: "vibe", top: "A", bottom: "", act: "Total top", evidence: "" }),
      flag({ id: "4", kind: "factor", card: "vibe", top: "A", bottom: "", act: "Total top", extra: ["Factor that looks right: top · tier 1"], evidence: "" }),
    ] });
    expect(text).not.toContain("Things I think are wrong");
    expect(text).toContain("## Things I checked that look right (4)");
    expect(text).toContain("My note: Exactly as written.");
    expect(text).toContain("anal hint");
    expect(text).toContain("vibe rating");
    expect(text).toContain("rating factor");
    expect(text).toContain("Factor that looks right: top · tier 1");
  });
  it("leaves the section and the extra sentence out when nothing is marked right", () => {
    const text = buildReport({ ...base, flags: [flag({ reasons: ["swapped"] })] });
    expect(text).not.toContain("look right");
    expect(text).not.toContain("Give those more weight");
  });
  it("leaves out an item taken out of the report", () => {
    expect(buildReport({ ...base, flags: [], right: [flag({ included: false })] })).not.toContain("look right (");
  });
});
