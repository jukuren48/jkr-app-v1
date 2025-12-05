// app/admin/page.jsx
import { redirect } from "next/navigation";

export default function AdminIndex() {
  redirect("/admin/dashboard");
}
