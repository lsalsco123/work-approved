export function todayYmd(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function splitCutoffTime(value: string): [string, string] {
  const [start = "", end = ""] = value.split("~", 2).map((part) => part.trim());
  return [start, end];
}

export function joinCutoffTime(start: string, end: string): string {
  if (!start && !end) return "";
  return `${start} ~ ${end}`;
}
