// Lockr catches setItem errors, so returning from set() is not a save receipt.
// Verify the serialized payload that the app will actually read after restart.
export function writeVerified(storage, key, value) {
  try {
    const expected = JSON.stringify(value);
    storage.set(key, value);
    return JSON.stringify(storage.get(key)) === expected;
  } catch (error) {
    return false;
  }
}
