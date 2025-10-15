import sharp from "sharp";

export default async function handler(req, res) {
  // 🧩 CORS対策（iPhone / iPad Safari 用）
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 is required" });
    }

    const apiKey = process.env.GOOGLE_VISION_API_KEY;
    if (!apiKey) {
      console.error("[Vision OCR] Missing GOOGLE_VISION_API_KEY");
      return res.status(500).json({ error: "API key missing" });
    }

    // 🧠 base64 → Buffer
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imgBuffer = Buffer.from(base64Data, "base64");

    // 🎨 Sharp で画像を強調処理（白黒化＋線を太く）
    const processed = await sharp(imgBuffer)
      .grayscale()
      .threshold(150) // ← コントラスト強調
      .normalise() // ← コントラスト全体補正
      .toBuffer();

    const content = processed.toString("base64");

    // 🚀 Vision API 呼び出し
    const gRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content },
              features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
              imageContext: {
                languageHints: ["ja", "en"],
                textDetectionParams: {
                  enableTextDetectionConfidenceScore: true,
                },
              },
            },
          ],
        }),
      }
    );

    const data = await gRes.json();

    // 🧾 結果解析
    const raw =
      data?.responses?.[0]?.fullTextAnnotation?.text ||
      data?.responses?.[0]?.textAnnotations?.[0]?.description ||
      "";

    if (!raw) {
      console.warn("[Vision OCR] empty response:", data);
      return res.status(200).json({ text: "" }); // Vision が空 → fallback先で処理
    }

    const cleaned = raw
      .trim()
      .toLowerCase()
      .replace(/[\u0000-\u001F]/g, "");

    console.log("[Vision OCR] recognized:", cleaned);
    return res.status(200).json({ text: cleaned });
  } catch (e) {
    console.error("[Vision OCR] error:", e);
    return res.status(500).json({ error: "Vision OCR failed" });
  }
}
