// Export and import both require pending learning writes to finish first.
export async function recoverPendingLearningWrites(learningStorage) {
  await learningStorage.flush();
  if (
    typeof learningStorage.getStatus !== "function"
    || learningStorage.getStatus().failedWrites === 0
  ) {
    return;
  }
  const retry = await learningStorage.retryFailedWrites();
  if (!retry.saved || retry.failedWrites > 0) {
    throw retry.error || new Error("Pending learning data could not be saved.");
  }
}

// Practice results belong to their global writer, including after their screen
// has closed. A drained promise queue alone does not prove that they were saved.
export async function recoverPendingPracticeWrites(practiceStorage) {
  await practiceStorage.flush();
  if (typeof practiceStorage.getStatus !== "function") return;
  if (practiceStorage.getStatus().failedWrites > 0) {
    const retry = await practiceStorage.retryFailedWrites();
    if (!retry.saved) {
      const error = retry.error || new Error("Pending practice results could not be saved.");
      error.key = "SAVE_DATA_UNSAVED_CHANGES";
      throw error;
    }
  }
  const status = practiceStorage.getStatus();
  if (status.failedWrites > 0 || status.pendingWrites > 0) {
    const error = status.lastError || new Error("Practice results are still pending.");
    error.key = "SAVE_DATA_UNSAVED_CHANGES";
    throw error;
  }
}
