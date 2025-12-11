import { BasesEntry, BasesPropertyId, Value } from "obsidian";

export function tryGetValue(
  entry: BasesEntry,
  propId: BasesPropertyId,
): Value | null {
  try {
    return entry.getValue(propId);
  } catch {
    return null;
  }
}
