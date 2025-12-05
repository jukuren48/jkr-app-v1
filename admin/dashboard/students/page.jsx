// app/admin/students/page.jsx

import { createClient } from "@/utils/supabase/server";
import dayjs from "dayjs";

export default async function StudentsPage() {
  const supabase = createClient();

  // 1️⃣ 生徒一覧を取得（users_extended から）
  const { data: users } = await supabase
    .from("users_extended")
    .select("*")
    .order("created_at", { ascending: true });

  // 今日の範囲
  const startOfToday = dayjs().startOf("day").toISOString();
  const endOfToday = dayjs().endOf("day").toISOString();

  // 2️⃣ 各生徒ごとの学習ログをまとめて取得
  const { data: logs } = await supabase.from("study_logs").select("*");

  // 3️⃣ 生徒ごとの集計を作成
  const studentStats = users.map((user) => {
    const userLogs = logs.filter((l) => l.user_id === user.id);

    const total = userLogs.length; // 総学習数
    const correct = userLogs.filter((l) => l.is_correct).length;
    const suspicious = userLogs.filter((l) => l.is_suspicious).length;

    const accuracy = total > 0 ? ((correct / total) * 100).toFixed(1) : "-";

    // 今日のログ
    const todayLogs = userLogs.filter(
      (l) => l.created_at >= startOfToday && l.created_at <= endOfToday
    );

    return {
      ...user,
      total,
      accuracy,
      suspicious,
      today: todayLogs.length,
    };
  });

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">生徒一覧</h1>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white shadow-md rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-gray-100 text-left text-sm font-semibold text-gray-700">
              <th className="p-4">名前</th>
              <th className="p-4">最終ログイン</th>
              <th className="p-4">総学習数</th>
              <th className="p-4">正答率</th>
              <th className="p-4">適当回答数</th>
              <th className="p-4">今日の学習数</th>
            </tr>
          </thead>

          <tbody>
            {studentStats.map((student) => (
              <tr key={student.id} className="border-b hover:bg-gray-50">
                <td className="p-4 font-medium">{student.name || "未登録"}</td>
                <td className="p-4 text-sm text-gray-600">
                  {student.last_login
                    ? dayjs(student.last_login).format("YYYY/MM/DD HH:mm")
                    : "-"}
                </td>
                <td className="p-4">{student.total}</td>
                <td className="p-4">{student.accuracy}%</td>
                <td className="p-4">{student.suspicious}</td>
                <td className="p-4">{student.today}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
