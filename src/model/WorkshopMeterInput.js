import { isValidWorkshopMeter } from "./Workshop";

// Keep the raw-input grammar aligned with isValidWorkshopMeter. Numeric bounds
// remain owned by the score model; this helper only identifies the input error.
const METER_INPUT_FORMAT = /^\d{1,2}(?:\+\d{1,2}){0,7}\/\d{1,2}$/;

export function parseWorkshopMeterInput(value) {
  if (typeof value !== "string" || !METER_INPUT_FORMAT.test(value)) {
    return { meter: null, reason: "format" };
  }
  if (!isValidWorkshopMeter(value)) return { meter: null, reason: "value" };
  return { meter: value, reason: null };
}
