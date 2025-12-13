// src/admin/DashboardCSR.jsx

import Link from "next/link";

export default function DashboardCSR() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">ダッシュボード</h1>

      <ul className="list-disc pl-5 space-y-2">
        <li>
          <Link
            href="/admin/dashboard/students"
            className="text-blue-600 underline"
          >
            生徒一覧（学習カルテを見る）
          </Link>
        </li>
      </ul>
    </div>
  );
}
