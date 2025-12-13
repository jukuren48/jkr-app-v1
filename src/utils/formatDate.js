// UTC → 日本時間（JST）に変換して表示する共通関数

export function formatJST(utcString, withTime = true) {
  if (!utcString) return "—";

  const date = new Date(utcString);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime && {
      hour: "2-digit",
      minute: "2-digit",
    }),
  });
}
