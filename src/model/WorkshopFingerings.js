export const WORKSHOP_MAX_FINGERINGS = 16;
export const WORKSHOP_MAX_FINGERING_CHARS = 32;
const FIELDS = ["value", "substitution", "alternate", "placement"];
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export function isValidWorkshopFingerings(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= WORKSHOP_MAX_FINGERINGS
    && Array.from(value).every(entry => !!entry && typeof entry === "object" && !Array.isArray(entry)
      && Object.keys(entry).every(key => FIELDS.includes(key)) && has(entry, "value")
      && typeof entry.value === "string" && entry.value.length > 0 && entry.value.length <= WORKSHOP_MAX_FINGERING_CHARS
      && entry.value === entry.value.trim() && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(entry.value)
      && ["substitution", "alternate"].every(key => !has(entry, key) || typeof entry[key] === "boolean")
      && (!has(entry, "placement") || ["above", "below"].includes(entry.placement)));
}

// Existing pieces use one numeric fingering. Consumers read both formats here,
// without mutating saved data or sharing editable entry objects with the score.
export function workshopFingerings(event) {
  if (!event || typeof event !== "object") return [];
  if (isValidWorkshopFingerings(event.fingerings)) return event.fingerings.map(entry => Object.assign({}, entry));
  return Number.isInteger(event.fingering) && event.fingering >= 1 && event.fingering <= 5
    ? [{ value: String(event.fingering) }] : [];
}
