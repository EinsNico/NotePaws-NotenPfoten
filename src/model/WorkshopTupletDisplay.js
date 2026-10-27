const FIELDS = ["bracket", "showNumber", "placement"];
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

// Only explicit engraving choices are stored. Missing fields keep the editor's
// existing automatic defaults and do not change the tuplet's played rhythm.
export function isValidWorkshopTupletDisplay(value) {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length > 0 && Object.keys(value).every(key => FIELDS.includes(key))
    && (!has(value, "bracket") || typeof value.bracket === "boolean")
    && (!has(value, "showNumber") || ["actual", "both", "none"].includes(value.showNumber))
    && (!has(value, "placement") || ["above", "below"].includes(value.placement));
}

export function workshopTupletDisplay(event) {
  return event && isValidWorkshopTupletDisplay(event.tupletDisplay)
    ? Object.assign({}, event.tupletDisplay) : null;
}

export function importWorkshopTupletDisplay(attributes, unsupported = () => {}) {
  const result = {};
  if (has(attributes, "bracket")) {
    if (["yes", "no"].includes(attributes.bracket)) result.bracket = attributes.bracket === "yes";
    else unsupported();
  }
  if (has(attributes, "show-number")) {
    if (["actual", "both", "none"].includes(attributes["show-number"])) result.showNumber = attributes["show-number"];
    else unsupported();
  }
  if (has(attributes, "placement")) {
    if (["above", "below"].includes(attributes.placement)) result.placement = attributes.placement;
    else unsupported();
  }
  return isValidWorkshopTupletDisplay(result) ? result : null;
}

export function exportWorkshopTupletDisplay(value) {
  if (!isValidWorkshopTupletDisplay(value)) return "";
  return (has(value, "bracket") ? ` bracket="${value.bracket ? "yes" : "no"}"` : "")
    + (has(value, "showNumber") ? ` show-number="${value.showNumber}"` : "")
    + (has(value, "placement") ? ` placement="${value.placement}"` : "");
}
