import {
  LEARNING_TIME_BUCKET_HOURS,
  LEARNING_TIME_MIN_TOTAL_DAYS,
  LEARNING_TIME_MIN_DAYS_PER_BUCKET,
  LEARNING_TIME_MIN_EXERCISES_PER_DAY_BUCKET,
  LEARNING_TIME_MIN_ELIGIBLE_BUCKETS,
  LEARNING_TIME_STABLE_DIFFERENCE,
  formatLearningTimeRange
} from "./AdaptiveLearningTime";
import { getRoundInputGroup } from "./RoundStatistics";

export const NORMAL_LEARNING_TIME_MAX_ROUND_WEIGHT = 20;

function pad(value) {
  return (`0${value}`).slice(-2);
}

function localDateKey(timestamp) {
  const date = new Date(timestamp);
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())]
    .join("-");
}

function bucketStartHour(timestamp) {
  const hour = new Date(timestamp).getHours();
  return Math.floor(hour / LEARNING_TIME_BUCKET_HOURS)
    * LEARNING_TIME_BUCKET_HOURS;
}

function average(values) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;
}

function clampPercent(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.max(0, Math.min(100, numericValue))
    : 0;
}

function getPlayedNoteCount(round) {
  const correct = Number(round && round.numCorrect);
  if (Number.isFinite(correct) && correct >= 0) {
    return Math.floor(correct);
  }
  const answers = Number(round && round.numAnswers);
  if (!Number.isFinite(answers) || answers <= 0) {
    return 0;
  }
  return Math.floor(answers * clampPercent(round.accuracy) / 100);
}

function getRoundAccuracy(round) {
  const answers = Number(round && round.numAnswers);
  const correct = Number(round && round.numCorrect);
  if (
    Number.isFinite(answers)
    && answers > 0
    && Number.isFinite(correct)
    && correct >= 0
  ) {
    return clampPercent(correct / answers * 100);
  }
  return clampPercent(round && round.accuracy);
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
    sample.weightedAccuracy / sample.accuracyWeight
  ));
  return {
    startHour: bucket.startHour,
    endHour: bucket.endHour,
    dayCount: bucket.samples.length,
    roundCount: bucket.samples.reduce(
      (total, sample) => total + sample.roundCount,
      0
    ),
    exerciseCount: bucket.samples.reduce(
      (total, sample) => total + sample.playedNotes,
      0
    ),
    accuracy: dailyAccuracies.length
      ? Math.round(average(dailyAccuracies))
      : null,
    eligible: bucket.samples.length >= LEARNING_TIME_MIN_DAYS_PER_BUCKET
  };
}

function compareBest(left, right) {
  return right.accuracy - left.accuracy || left.startHour - right.startHour;
}

function compareMostChallenging(left, right) {
  return left.accuracy - right.accuracy || left.startHour - right.startHour;
}

export function summarizeNormalLearningTimes(rounds, inputGroup = "") {
  const normalRounds = Array.isArray(rounds)
    ? rounds.filter(round => (
      round
      && round.mode === "normal"
      && Number(round.completedAt) > 0
      && (
        !inputGroup
        || getRoundInputGroup(round.settings && round.settings.inputMode)
          === inputGroup
      )
    ))
    : [];
  const dailyTotals = Object.create(null);
  const samples = Object.create(null);

  normalRounds.forEach(round => {
    const playedNotes = getPlayedNoteCount(round);
    if (playedNotes <= 0) {
      return;
    }
    const dateKey = localDateKey(round.completedAt);
    const startHour = bucketStartHour(round.completedAt);
    const sampleKey = `${dateKey}|${startHour}`;
    dailyTotals[dateKey] = (dailyTotals[dateKey] || 0) + playedNotes;
    if (!samples[sampleKey]) {
      samples[sampleKey] = {
        dateKey,
        startHour,
        playedNotes: 0,
        roundCount: 0,
        weightedAccuracy: 0,
        accuracyWeight: 0
      };
    }
    const sample = samples[sampleKey];
    const roundWeight = Math.min(
      NORMAL_LEARNING_TIME_MAX_ROUND_WEIGHT,
      playedNotes
    );
    sample.playedNotes += playedNotes;
    sample.roundCount += 1;
    sample.weightedAccuracy += getRoundAccuracy(round) * roundWeight;
    sample.accuracyWeight += roundWeight;
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
      && sample.playedNotes >= LEARNING_TIME_MIN_EXERCISES_PER_DAY_BUCKET
    ) {
      bucketsByHour[sample.startHour].samples.push(sample);
    }
  });

  const buckets = bucketsByHour.filter(Boolean).map(summarizeBucket);
  const eligibleBuckets = buckets.filter(bucket => bucket.eligible);
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
  const dayProgress = Math.min(
    1,
    validDateKeys.length / LEARNING_TIME_MIN_TOTAL_DAYS
  );
  const strongestBucketDays = buckets
    .map(bucket => Math.min(
      bucket.dayCount,
      LEARNING_TIME_MIN_DAYS_PER_BUCKET
    ))
    .sort((left, right) => right - left)
    .slice(0, LEARNING_TIME_MIN_ELIGIBLE_BUCKETS);
  const bucketProgress = strongestBucketDays.reduce(
    (total, value) => total + value,
    0
  ) / (
    LEARNING_TIME_MIN_ELIGIBLE_BUCKETS
    * LEARNING_TIME_MIN_DAYS_PER_BUCKET
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

export {
  LEARNING_TIME_MIN_DAYS_PER_BUCKET,
  formatLearningTimeRange
};

export default {
  NORMAL_LEARNING_TIME_MAX_ROUND_WEIGHT,
  summarizeNormalLearningTimes,
  formatLearningTimeRange
};
