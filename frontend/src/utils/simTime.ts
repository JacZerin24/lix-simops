const DEFAULT_TIMEZONE = "America/Chicago";

export function formatSimTime(
  value?: string | null,
  timezone = DEFAULT_TIMEZONE,
  includeSeconds = false,
): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    second: includeSeconds ? "2-digit" : undefined,
    hour12: true,
    timeZoneName: "short",
  }).format(new Date(value));
}

export function formatSimDateTime(
  value?: string | null,
  timezone = DEFAULT_TIMEZONE,
): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(new Date(value));
}
