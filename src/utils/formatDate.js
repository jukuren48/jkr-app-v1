// UTC → 日本時間（JST）に変換して表示する共通関数
export function formatJST(dateString) {
  if (!dateString) return "—";

  return new Date(dateString).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
