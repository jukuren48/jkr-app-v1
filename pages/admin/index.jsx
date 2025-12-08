export async function getServerSideProps() {
  return { props: {} };
}

// pages/admin/index.jsx
import Link from "next/link";

export default function AdminHomePage() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">管理画面トップ</h1>

      <p className="text-gray-700 mb-4">
        ここから生徒の学習状況やログを確認できます。
      </p>

      <ul className="list-disc pl-5 space-y-2">
        <li>
          <Link
            href="/admin/dashboard/students"
            className="text-blue-600 underline"
          >
            生徒一覧（学習カルテ）
          </Link>
        </li>
      </ul>
    </div>
  );
}
