export type TelemetryEvent = {
  event_id: string;
  event_type: string;
  schema_version: "v1";
  producer: string;
  occurred_at: string;
  idempotency_key: string;
  trace_id?: string;
};

export function createTelemetryEvent(input: Omit<TelemetryEvent, "schema_version" | "occurred_at">): TelemetryEvent {
  return {
    ...input,
    schema_version: "v1",
    occurred_at: new Date().toISOString()
  };
}
