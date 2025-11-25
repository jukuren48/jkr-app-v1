import { supabase } from "../../lib/supabaseClient";

export default function LogoutButton() {
  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    window.location.href = "/login";
  };

  return (
    <button
      onClick={handleLogout}
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
