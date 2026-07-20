export function buildCodexResumeLink(options: {
  workspacePath: string;
  searchId: string;
  codexThreadId?: string;
  prefillContinuation?: boolean;
}): string {
  if (options.codexThreadId && !options.prefillContinuation) {
    return `codex://threads/${encodeURIComponent(options.codexThreadId)}`;
  }
  const prompt = `$search-for-fun Resume ${options.searchId} and process the pending commands.`;
  return `codex://new?path=${encodeURIComponent(options.workspacePath)}&prompt=${encodeURIComponent(prompt)}`;
}
