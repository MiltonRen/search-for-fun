import { describe, expect, it } from "vitest";
import { buildCodexResumeLink } from "../studio/client/codex-link.js";

describe("Codex resume links", () => {
  it("returns to the originating task when a thread ID was captured", () => {
    expect(buildCodexResumeLink({
      workspacePath: "/tmp/search for fun",
      searchId: "s_20260720_test",
      codexThreadId: "thread_test_123",
    })).toBe("codex://threads/thread_test_123");
  });

  it("falls back to a prefilled new task for older searches", () => {
    const link = buildCodexResumeLink({
      workspacePath: "/tmp/search for fun",
      searchId: "s_20260720_test",
    });
    expect(link).toContain("codex://new?path=%2Ftmp%2Fsearch%20for%20fun&prompt=");
    expect(decodeURIComponent(link)).toContain("Resume s_20260720_test");
  });

  it("uses the prefilled task flow when pending work needs a continuation prompt", () => {
    const link = buildCodexResumeLink({
      workspacePath: "/tmp/search for fun",
      searchId: "s_20260720_test",
      codexThreadId: "thread_test_123",
      prefillContinuation: true,
    });
    expect(link).toContain("codex://new?path=%2Ftmp%2Fsearch%20for%20fun&prompt=");
    expect(decodeURIComponent(link)).toContain("$search-for-fun Resume s_20260720_test and process the pending commands.");
  });
});
