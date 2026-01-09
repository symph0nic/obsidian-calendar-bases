export function cssUrl(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `url("${escaped}")`;
}
