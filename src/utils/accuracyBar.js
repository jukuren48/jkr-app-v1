export function getAccuracyBarStyle(accuracy) {
  if (accuracy === null || accuracy === undefined) {
    return { width: "0%", color: "bg-gray-300" };
  }
  if (accuracy >= 80) return { width: `${accuracy}%`, color: "bg-green-500" };
  if (accuracy >= 50) return { width: `${accuracy}%`, color: "bg-yellow-500" };
  return { width: `${accuracy}%`, color: "bg-red-500" };
}
