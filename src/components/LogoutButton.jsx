import { logout } from "../../lib/logout";

export default function LogoutButton() {
  return (
    <button
      onClick={logout}
      className="
        fixed bottom-4 right-4 
        bg-red-500 text-white px-4 py-2
        rounded-xl shadow-lg hover:bg-red-600
        z-[50]
      "
    >
      ログアウト
    </button>
  );
}
