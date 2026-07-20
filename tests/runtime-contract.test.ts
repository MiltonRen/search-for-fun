import { describe, expect, it } from "vitest";
import { RUNTIME_PROTOCOL_VERSION, isRuntimeMessage } from "../studio/runtime/contract.js";

describe("runtime protocol", () => {
  it("accepts close requests sent by a focused game iframe", () => {
    expect(isRuntimeMessage({
      kind: "sff:runtime",
      protocol: RUNTIME_PROTOCOL_VERSION,
      sessionId: "session-test",
      nonce: "nonce-test",
      nodeId: "n_0000_test",
      runId: 0,
      event: "close_requested",
      atMs: 100,
    })).toBe(true);
  });
});
