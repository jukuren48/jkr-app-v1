export default async function handler(req, res) {
  const { word } = req.query;
  if (!word) {
    return res.status(400).json({ error: "No word provided" });
  }

  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${word}`
    );
    const data = await response.json();

    // 英語の定義を抽出
    const definition =
      data[0]?.meanings?.[0]?.definitions?.[0]?.definition ||
      "No definition found.";

    res.status(200).json({ meaning: definition });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch definition." });
  }
}
