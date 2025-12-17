export function getAccuracyStatus(accuracy) {
  if (accuracy === null || accuracy === undefined) return "none";
  if (accuracy >= 80) return "good";
  if (accuracy >= 50) return "warning";
  return "danger";
}
