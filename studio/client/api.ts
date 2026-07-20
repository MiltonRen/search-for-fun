import type {
  CommandRecord,
  CommandType,
  EvaluationRecord,
  SearchListItem,
  SearchProjection,
} from "../shared/types";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(body.error ?? `${response.status} ${response.statusText}`);
  return body;
}

export async function fetchSessionToken(): Promise<string> {
  return (await requestJson<{ token: string }>("/api/session")).token;
}

export async function fetchSearches(): Promise<SearchListItem[]> {
  return (await requestJson<{ searches: SearchListItem[] }>("/api/searches")).searches;
}

export async function fetchSearch(searchId: string): Promise<SearchProjection> {
  return requestJson<SearchProjection>(`/api/searches/${encodeURIComponent(searchId)}`);
}

function writeHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Search-for-fun-token": token,
  };
}

export interface EvaluationPayload {
  nodeId: string;
  session: EvaluationRecord["session"];
  ratings: Record<string, number | null>;
  preserve: string;
  change: string;
  note: string;
  nextMove?: string;
  telemetry?: EvaluationRecord["telemetry"];
}

export async function saveEvaluation(
  searchId: string,
  token: string,
  payload: EvaluationPayload,
): Promise<EvaluationRecord> {
  return requestJson<EvaluationRecord>(`/api/searches/${encodeURIComponent(searchId)}/evaluations`, {
    method: "POST",
    headers: writeHeaders(token),
    body: JSON.stringify(payload),
  });
}

export async function queueCommand(
  searchId: string,
  token: string,
  payload: {
    type: CommandType;
    nodeIds: string[];
    mode: CommandRecord["mode"];
    instruction: string;
  },
): Promise<CommandRecord> {
  return requestJson<CommandRecord>(`/api/searches/${encodeURIComponent(searchId)}/commands`, {
    method: "POST",
    headers: writeHeaders(token),
    body: JSON.stringify(payload),
  });
}

export async function savePreview(
  searchId: string,
  nodeId: string,
  token: string,
  dataUrl: string,
): Promise<void> {
  await requestJson<{ ok: true }>(
    `/api/searches/${encodeURIComponent(searchId)}/nodes/${encodeURIComponent(nodeId)}/preview`,
    {
      method: "POST",
      headers: writeHeaders(token),
      body: JSON.stringify({ dataUrl }),
    },
  );
}

export async function recordRuntimeFailure(
  searchId: string,
  nodeId: string,
  token: string,
  reason: string,
): Promise<void> {
  await requestJson<{ ok: true }>(
    `/api/searches/${encodeURIComponent(searchId)}/nodes/${encodeURIComponent(nodeId)}/runtime-failure`,
    {
      method: "POST",
      headers: writeHeaders(token),
      body: JSON.stringify({ reason }),
    },
  );
}
