// pages/api/stripe/create-checkout-session.js
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20", // ここは固定でOK（Stripe推奨の指定）
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { plan } = req.body;
    const PRICE_BY_PLAN = {
      standard: process.env.STRIPE_PRICE_ID_STANDARD,
      premium: process.env.STRIPE_PRICE_ID_PREMIUM,
    };
    const priceId = PRICE_BY_PLAN[plan];
    if (!priceId) return res.status(400).json({ error: "Invalid plan" });

    // ✅ Supabase JWTで本人確認（フロントから Authorization: Bearer <access_token> を送る）
    const authHeader = req.headers.authorization || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) return res.status(401).json({ error: "Missing access token" });

    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userData?.user?.id)
      return res.status(401).json({ error: "Invalid token" });

    const userId = userData.user.id;

    // users_extended を取得（customerが既にあれば再利用）
    const { data: ext, error: extErr } = await supabaseAdmin
      .from("users_extended")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl)
      return res.status(500).json({ error: "Missing NEXT_PUBLIC_APP_URL" });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/billing/cancel`,
      client_reference_id: userId, // ✅ これが後で効く（誰の決済か）
      customer: ext?.stripe_customer_id || undefined,
      customer_email: ext?.stripe_customer_id
        ? undefined
        : userData.user.email || undefined,
      subscription_data: {
        metadata: { user_id: userId, plan: "standard" },
      },
      metadata: { user_id: userId, plan: "standard", price_id: priceId },
      allow_promotion_codes: true,
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error("[stripe] create-checkout-session error:", e);
    return res.status(500).json({
      error: "Failed to create checkout session",
      code: e?.code || null,
      type: e?.type || null,
      message: e?.message || null, // 本番は必要なら削る
    });
  }
}
