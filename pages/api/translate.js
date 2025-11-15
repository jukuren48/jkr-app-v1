import { TranslationServiceClient } from "@google-cloud/translate";

export default async function handler(req, res) {
  const { word } = req.query;

  if (!word) {
    return res.status(400).json({ error: "No word provided" });
  }

  try {
    const credentialsBase64 =
      process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64;
    if (!credentialsBase64) {
      throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64 is not set");
    }

    const credentialsJson = JSON.parse(
      Buffer.from(credentialsBase64, "base64").toString("utf8")
    );

    const client = new TranslationServiceClient({
      credentials: credentialsJson,
    });

    const projectId = credentialsJson.project_id;

    const request = {
      parent: `projects/${projectId}/locations/global`,
      contents: [word],
      mimeType: "text/plain",
      sourceLanguageCode: "en",
      targetLanguageCode: "ja",
    };

    const [response] = await client.translateText(request);
    const translation =
      response.translations?.[0]?.translatedText ?? "(翻訳できませんでした)";

    return res.status(200).json({ translation });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Translation failed." });
  }
}
