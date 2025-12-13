import path from "path";
import dotenv from "dotenv";

dotenv.config({
  path: path.resolve(process.cwd(), ".env.local"),
});

console.log("URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log("SERVICE KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log("ANON KEY:", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
