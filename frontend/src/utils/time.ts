export const EXERCISE_TIME_ZONE = "America/Chicago";

function validDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatExerciseTime(
  value?: string | Date | null,
  fallback = "Manual",
) {
  if (!value) return fallback;
  const date = validDate(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: EXERCISE_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(date);
}

export function formatExerciseDateTime(
  value?: string | Date | null,
  fallback = "No valid time",
) {
  if (!value) return fallback;
  const date = validDate(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat("en-US", {
    timeZone: EXERCISE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  })
    .format(date)
    .replace(",", "");
}
