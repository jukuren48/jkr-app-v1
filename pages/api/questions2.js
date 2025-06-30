import path from "path";
import { promises as fs } from "fs";

export default async function handler(req, res) {
  console.log("📥 API /api/questions 呼び出されました");

  const filePath = path.join(process.cwd(), "data", "questions.json");
  console.log("📍 JSONファイルのパス:", filePath);

  try {
    const fileContents = await fs.readFile(filePath, "utf8");
    console.log("✅ JSONファイル読み込み成功");

    const questions = JSON.parse(fileContents);
    console.log("✅ JSONパース成功: 件数 =", questions.length);

    res.status(200).json(questions);
  } catch (error) {
    console.error("❌ エラー:", error);
    res.status(500).json({ error: "Failed to load questions data." });
  }
}
