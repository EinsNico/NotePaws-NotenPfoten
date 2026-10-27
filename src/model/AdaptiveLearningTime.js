import { normalizeAdaptiveHistory } from "./AdaptiveHistory";

export const LEARNING_TIME_BUCKET_HOURS = 2;
export const LEARNING_TIME_MIN_TOTAL_DAYS = 7;
export const LEARNING_TIME_MIN_DAYS_PER_BUCKET = 3;
export const LEARNING_TIME_MIN_EXERCISES_PER_DAY_BUCKET = 10;
export const LEARNING_TIME_MIN_ELIGIBLE_BUCKETS = 2;
export const LEARNING_TIME_STABLE_DIFFERENCE = 3;

function pad(value) {
  return (`0${value}`).slice(-2);
}

function localDateKey(timestamp) {
  const date = new Date(timestamp);
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-");
}

function bucketStartHour(timestamp) {
  const hour = new Date(timestamp).getHours();
  return Math.floor(hour / LEARNING_TIME_BUCKET_HOURS) * LEARNING_TIME_BUCKET_HOURS;
}

function average(values) {
  if (!values.length) {
    return null;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function createEmptyBucket(startHour) {
  return {
    startHour,
    endHour: startHour + LEARNING_TIME_BUCKET_HOURS,
    samples: []
  };
}

function summarizeBucket(bucket) {
  const dailyAccuracies = bucket.samples.map(sample => (
    sample.correctFirstTry / sample.exerciseCount * 100
  ));
  const dailyResponseTimes = bucket.samples
    .map(sample => average(sample.responseTimesMs))
    .filter(value => value !== null);
  const exerciseCount = bucket.samples.reduce(
    (total, sample) => total + sample.exerciseCount,
    0
  );

  return {
    startHour: bucket.startHour,
    endHour: bucket.endHour,
    dayCount: bucket.samples.length,
    exerciseCount,
    accuracy: dailyAccuracies.length
      ? Math.round(average(dailyAccuracies))
      : null,
    averageResponseTimeMs: dailyResponseTimes.length
      ? Math.round(average(dailyResponseTimes))
      : null,
    eligible: bucket.samples.length >= LEARNING_TIME_MIN_DAYS_PER_BUCKET
  };
}

function summarizeWindowBucket(bucket) {
  const dailyAccuracies = bucket.samples.map(sample => (
    sample.correctFirstTryCount / sample.attemptCount * 100
  ));
  const dailyResponseTimes = bucket.samples
    .map(sample => sample.averageResponseTimeMs)
    .filter(value => Number.isFinite(value) && value > 0);
  const exerciseCount = bucket.samples.reduce(
    (total, sample) => total + sample.attemptCount,
    0
  );

  return {
    startHour: bucket.startHour,
    endHour: bucket.endHour,
    dayCount: bucket.samples.length,
    exerciseCount,
    accuracy: dailyAccuracies.length
      ? Math.round(average(dailyAccuracies))
      : null,
    averageResponseTimeMs: dailyResponseTimes.length
      ? Math.round(average(dailyResponseTimes))
      : null,
    eligible: bucket.samples.length >= LEARNING_TIME_MIN_DAYS_PER_BUCKET
  };
}

function compareBest(left, right) {
  return (
    right.accuracy - left.accuracy
    || (left.averageResponseTimeMs || Infinity) - (right.averageResponseTimeMs || Infinity)
    || left.startHour - right.startHour
  );
}

function compareMostChallenging(left, right) {
  return (
    left.accuracy - right.accuracy
    || (right.averageResponseTimeMs || 0) - (left.averageResponseTimeMs || 0)
    || left.startHour - right.startHour
  );
}

function createLearningTimeSummary(validDateKeys, buckets) {
  const eligibleBuckets = buckets.filter(value => value.eligible);
  const ready = (
    validDateKeys.length >= LEARNING_TIME_MIN_TOTAL_DAYS
    && eligibleBuckets.length >= LEARNING_TIME_MIN_ELIGIBLE_BUCKETS
  );
  const best = ready ? eligibleBuckets.slice().sort(compareBest)[0] : null;
  const mostChallenging = ready
    ? eligibleBuckets.slice().sort(compareMostChallenging)[0]
    : null;
  const difference = ready
    ? Math.abs(best.accuracy - mostChallenging.accuracy)
    : null;
  const dayProgress = Math.min(1, validDateKeys.length / LEARNING_TIME_MIN_TOTAL_DAYS);
  const strongestBucketDays = buckets
    .map(value => Math.min(value.dayCount, LEARNING_TIME_MIN_DAYS_PER_BUCKET))
    .sort((left, right) => right - left)
    .slice(0, LEARNING_TIME_MIN_ELIGIBLE_BUCKETS);
  const bucketProgress = strongestBucketDays.reduce(
    (total, value) => total + value,
    0
  ) / (
    LEARNING_TIME_MIN_ELIGIBLE_BUCKETS * LEARNING_TIME_MIN_DAYS_PER_BUCKET
  );

  return {
    ready,
    recordedDays: validDateKeys.length,
    requiredDays: LEARNING_TIME_MIN_TOTAL_DAYS,
    eligibleBucketCount: eligibleBuckets.length,
    requiredBucketCount: LEARNING_TIME_MIN_ELIGIBLE_BUCKETS,
    progressPercent: Math.round(Math.min(dayProgress, bucketProgress) * 100),
    buckets,
    best,
    mostChallenging,
    difference,
    isStable: ready && difference < LEARNING_TIME_STABLE_DIFFERENCE
  };
}

export function formatLearningTimeRange(startHour) {
  const endHour = startHour + LEARNING_TIME_BUCKET_HOURS;
  return `${pad(startHour)}:00–${pad(endHour)}:00`;
}

export function summarizeAdaptiveLearningTimes(history) {
  const evaluations = normalizeAdaptiveHistory(history).evaluations
    .filter(value => value.completedAt > 0);
  const dailyTotals = Object.create(null);
  const samples = Object.create(null);

  evaluations.forEach(evaluation => {
    const dateKey = localDateKey(evaluation.completedAt);
    const startHour = bucketStartHour(evaluation.completedAt);
    const sampleKey = `${dateKey}|${startHour}`;
    dailyTotals[dateKey] = (dailyTotals[dateKey] || 0) + 1;
    if (!samples[sampleKey]) {
      samples[sampleKey] = {
        dateKey,
        startHour,
        exerciseCount: 0,
        correctFirstTry: 0,
        responseTimesMs: []
      };
    }
    const sample = samples[sampleKey];
    sample.exerciseCount += 1;
    if (evaluation.correctFirstTry) {
      sample.correctFirstTry += 1;
    }
    if (Number.isFinite(evaluation.responseTimeMs) && evaluation.responseTimeMs > 0) {
      sample.responseTimesMs.push(evaluation.responseTimeMs);
    }
  });

  const validDateKeys = Object.keys(dailyTotals).filter(dateKey => (
    dailyTotals[dateKey] >= LEARNING_TIME_MIN_EXERCISES_PER_DAY_BUCKET
  ));
  const validDates = validDateKeys.reduce((result, dateKey) => {
    result[dateKey] = true;
    return result;
  }, Object.create(null));
  const bucketsByHour = [];
  for (let hour = 0; hour < 24; hour += LEARNING_TIME_BUCKET_HOURS) {
    bucketsByHour[hour] = createEmptyBucket(hour);
  }
  Object.keys(samples).forEach(key => {
    const sample = samples[key];
    if (
      validDates[sample.dateKey]
      && sample.exerciseCount >= LEARNING_TIME_MIN_EXERCISES_PER_DAY_BUCKET
    ) {
      bucketsByHour[sample.startHour].samples.push(sample);
    }
  });

  const buckets = bucketsByHour.filter(Boolean).map(summarizeBucket);
  return createLearningTimeSummary(validDateKeys, buckets);
}

export function summarizeAdaptiveLearningTimeWindows(windows) {
  const normalizedWindows = (Array.isArray(windows) ? windows : [])
    .filter(window => (
      window
      && typeof window.day === "string"
      && Number.isInteger(Number(window.startHour))
      && Number(window.startHour) >= 0
      && Number(window.startHour) < 24
    ))
    .map(window => ({
      day: window.day,
      startHour: Number(window.startHour),
      attemptCount: Math.max(0, Math.floor(Number(window.attemptCount) || 0)),
      correctFirstTryCount: Math.max(
        0,
        Math.floor(Number(window.correctFirstTryCount) || 0)
      ),
      averageResponseTimeMs: (
        Number(window.timedAttemptCount) > 0
        && Number.isFinite(Number(window.responseTimeTotalMs))
      )
        ? Number(window.responseTimeTotalMs) / Number(window.timedAttemptCount)
        : (
          Number.isFinite(Number(window.averageResponseTimeMs))
            ? Number(window.averageResponseTimeMs)
            : null
        )
    }));
  const dailyTotals = normalizedWindows.reduce((totals, window) => {
    totals[window.day] = (totals[window.day] || 0) + window.attemptCount;
    return totals;
  }, Object.create(null));
  const validDateKeys = Object.keys(dailyTotals).filter(day => (
    dailyTotals[day] >= LEARNING_TIME_MIN_EXERCISES_PER_DAY_BUCKET
  ));
  const validDates = validDateKeys.reduce((result, day) => {
    result[day] = true;
    return result;
  }, Object.create(null));
  const buckets = [];
  for (let hour = 0; hour < 24; hour += LEARNING_TIME_BUCKET_HOURS) {
    const bucket = createEmptyBucket(hour);
    bucket.samples = normalizedWindows.filter(window => (
      window.startHour === hour
      && validDates[window.day]
      && window.attemptCount >= LEARNING_TIME_MIN_EXERCISES_PER_DAY_BUCKET
    ));
    buckets.push(summarizeWindowBucket(bucket));
  }

  return createLearningTimeSummary(validDateKeys, buckets);
}

export default {
  LEARNING_TIME_BUCKET_HOURS,
  LEARNING_TIME_MIN_TOTAL_DAYS,
  LEARNING_TIME_MIN_DAYS_PER_BUCKET,
  LEARNING_TIME_MIN_EXERCISES_PER_DAY_BUCKET,
  LEARNING_TIME_MIN_ELIGIBLE_BUCKETS,
  LEARNING_TIME_STABLE_DIFFERENCE,
  formatLearningTimeRange,
  summarizeAdaptiveLearningTimes,
  summarizeAdaptiveLearningTimeWindows
};
