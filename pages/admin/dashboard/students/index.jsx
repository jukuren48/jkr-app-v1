// pages/admin/dashboard/students/index.jsx
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";

export async function getServerSideProps(context) {
  const supabase = createPagesServerClient({
    req: context.req,
    res: context.res,
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  console.log("=== SESSION (LATEST API) ===");
  console.log(session);

  if (!session) {
    return {
      redirect: {
        destination: "/login",
        permanent: false,
      },
    };
  }

  const { data: students } = await supabase
    .from("users_extended")
    .select("*")
    .order("last_login", { ascending: false });

  return {
    props: {
      students: students ?? [],
    },
  };
}

export default function StudentListPage({ students }) {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">生徒一覧</h1>

      <table className="min-w-full bg-white shadow rounded-lg">
        <thead>
          <tr className="bg-gray-100 text-left text-gray-700 text-sm">
            <th className="p-4">名前</th>
            <th className="p-4">最終ログイン</th>
            <th className="p-4">詳細</th>
          </tr>
        </thead>

        <tbody>
          {students.map((s) => (
            <tr key={s.id} className="border-b hover:bg-gray-50">
              <td className="p-4">{s.name || "（未登録）"}</td>
              <td className="p-4">
                {s.last_login
                  ? new Date(s.last_login).toLocaleString("ja-JP")
                  : "-"}
              </td>
              <td className="p-4">
                <Link
                  className="text-blue-600 underline"
                  href={`/admin/dashboard/students/${s.id}`}
                >
                  学習カルテを見る
                </Link>
              </td>
            </tr>
          ))}

          {students.length === 0 && (
            <tr>
              <td className="p-4" colSpan={3}>
                生徒データがまだありません。
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
