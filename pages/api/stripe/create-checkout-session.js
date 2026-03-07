// pages/api/stripe/create-checkout-session.js
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const PRICE_BY_PLAN = {
  standard: process.env.STRIPE_PRICE_ID_STANDARD,
  // premium: process.env.STRIPE_PRICE_ID_PREMIUM,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // ✅ planで受ける（フロントと統一）
    const { plan } = req.body ?? {};
    const priceId = PRICE_BY_PLAN[plan];

    console.log("priceId =", priceId);

    if (!plan) return res.status(400).json({ error: "Missing plan" });
    if (!priceId) return res.status(400).json({ error: "Invalid plan" });

    // ✅ envチェック（原因特定が一瞬でできる）
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl)
      return res.status(500).json({ error: "Missing NEXT_PUBLIC_APP_URL" });
    if (!process.env.STRIPE_SECRET_KEY)
      return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });

    // ✅ Supabase JWTで本人確認
    const authHeader = req.headers.authorization || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) return res.status(401).json({ error: "Missing access token" });

    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userData?.user?.id) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const userId = userData.user.id;

    // ✅ users_extended を取得（初回でも落ちない）
    const { data: ext } = await supabaseAdmin
      .from("users_extended")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/billing/cancel`,
      client_reference_id: userId,
      customer: ext?.stripe_customer_id || undefined,
      customer_email: ext?.stripe_customer_id
        ? undefined
        : userData.user.email || undefined,
      subscription_data: {
        metadata: { user_id: userId, plan },
      },
      metadata: { user_id: userId, plan, price_id: priceId },
      allow_promotion_codes: true,
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error("[stripe] create-checkout-session error:", e);
    return res.status(500).json({
      error: "Failed to create checkout session",
      type: e?.type || null,
      code: e?.code || null,
      message: e?.message || null,
    });
  }
}
