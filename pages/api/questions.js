import path from "path";
import { promises as fs } from "fs";

export default async function handler(req, res) {
  const filePath = path.join(process.cwd(), "data", "questions.json");
  try {
    const fileContents = await fs.readFile(filePath, "utf8");
    const questions = JSON.parse(fileContents);
    res.status(200).json(questions);
  } catch (error) {
    console.error("Failed to load questions:", error);
    res.status(500).json({ error: "Failed to load questions data." });
  }
}
