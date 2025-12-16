// src/utils/formatDate.js
export function formatJST(isoString) {
  if (!isoString) return "—";

  const date = new Date(isoString);

  return date.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeJST(isoString) {
  if (!isoString) return "";

  const now = new Date();
  const date = new Date(isoString);

  const nowJST = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  );
  const dateJST = new Date(
    date.toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  );

  const diffMs = nowJST - dateJST;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;

  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}日前`;
}

export function getLoginStatus(lastLoginISO) {
  // 🔴 未ログインは danger 扱い
  if (!lastLoginISO) return "danger";

  const now = new Date();
  const last = new Date(lastLoginISO);

  // JST基準にそろえる
  const nowJST = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  );
  const lastJST = new Date(
    last.toLocaleString("en-US", { timeZone: "Asia/Tokyo" })
  );

  const diffMs = nowJST - lastJST;
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 24) return "recent"; // 🟢
  if (diffHours < 72) return "warning"; // 🟡
  return "danger"; // 🔴
}
