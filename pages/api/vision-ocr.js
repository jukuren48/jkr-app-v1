export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 is required" });
    }

    const apiKey = process.env.GOOGLE_VISION_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing GOOGLE_VISION_API_KEY" });
    }

    // 🧹 Base64 ヘッダー除去
    const content = imageBase64.replace(/^data:image\/(png|jpeg);base64,/, "");

    // 🧠 Vision API 呼び出し
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content },
              features: [
                { type: "DOCUMENT_TEXT_DETECTION", model: "builtin/latest" },
              ],
              imageContext: { languageHints: ["en"] },
            },
          ],
        }),
      }
    );

    const data = await response.json();

    // 🧩 responses が無いときの保険
    if (!data.responses || !data.responses[0]) {
      console.error("[Vision OCR] empty response:", data);
      return res.status(200).json({ text: "" });
    }

    // 🧠 テキスト抽出（どちらかあれば拾う）
    const raw =
      data.responses[0].fullTextAnnotation?.text ||
      data.responses[0].textAnnotations?.[0]?.description ||
      "";
    const cleaned = raw.trim().toLowerCase();

    console.log("[Vision OCR recognized]", cleaned || "(none)");

    return res.status(200).json({ text: cleaned });
  } catch (error) {
    console.error("[vision-ocr] error:", error);
    return res.status(500).json({ error: "Vision OCR failed" });
  }
}
