// scripts/import-questions.mjs

import path from "path";
import fs from "fs/promises";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// =======================================
// 🔥 dotenv を確実に読み込む（最重要）
// =======================================
dotenv.config({
  path: path.resolve(process.cwd(), ".env.local"),
});

// 動作確認
console.log("Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);

// =======================================
// 🔧 Supabase クライアント設定
// =======================================
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "❌ 環境変数エラー: Supabase URL または Service Role Key が読み込まれていません。"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// =======================================
// 🚀 メイン処理
// =======================================

async function main() {
  try {
    console.log("📥 questions.json を読み込み中…");

    const filePath = path.join(process.cwd(), "data", "questions.json");
    const jsonText = await fs.readFile(filePath, "utf8");
    const questions = JSON.parse(jsonText);

    console.log(`📄 読み込み完了：${questions.length}件`);

    for (const q of questions) {
      const payload = {
        id: q.id,
        unit: q.unit ?? "",
        question: q.question ?? "",
        choices: q.choices ?? [],
        correct: q.correct ?? "",
        explanation: q.explanation ?? "",
        incorrect_explanations: q.incorrectExplanations ?? {},
        level: q.level ?? "",
      };

      const { error } = await supabase.from("questions").insert(payload);

      if (error) {
        console.error("❌ INSERT エラー:", error);
        process.exit(1);
      }
    }

    console.log("🎉 全データの Supabase インポート完了！！");
  } catch (err) {
    console.error("❌ 予期せぬエラー:", err);
    process.exit(1);
  }
}

main();
