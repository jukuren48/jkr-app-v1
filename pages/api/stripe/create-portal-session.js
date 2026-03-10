// pages/api/stripe/create-portal-session.js
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authHeader = req.headers.authorization || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!jwt) {
      return res.status(401).json({ error: "Missing access token" });
    }

    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(jwt);

    if (userErr || !userData?.user?.id) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const userId = userData.user.id;

    const { data: ext, error: extErr } = await supabaseAdmin
      .from("users_extended")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (extErr) {
      return res
        .status(500)
        .json({ error: "Failed to load user billing info" });
    }

    if (!ext?.stripe_customer_id) {
      return res.status(400).json({ error: "No Stripe customer found" });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const session = await stripe.billingPortal.sessions.create({
      customer: ext.stripe_customer_id,
      return_url: `${appUrl}/HomeCSR`,
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error("[stripe] create-portal-session error:", e);
    return res.status(500).json({
      error: "Failed to create portal session",
      message: e?.message || null,
    });
  }
}
