// pages/api/stripe/webhook.js
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = {
  api: { bodyParser: false },
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable)
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const sig = req.headers["stripe-signature"];
  const buf = await buffer(req);

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    console.error("❌ Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      // ============================
      // 初回決済
      // ============================
      case "checkout.session.completed": {
        const session = event.data.object;

        const userId = session.client_reference_id || session.metadata?.user_id;

        const customerId = session.customer;
        const subscriptionId = session.subscription;

        if (!userId) break;

        await supabaseAdmin
          .from("users_extended")
          .update({
            plan: "standard",
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            billing_email: session.customer_details?.email ?? null,
          })
          .eq("user_id", userId);

        break;
      }

      // ============================
      // サブスク状態更新
      // ============================
      case "customer.subscription.updated": {
        const sub = event.data.object;

        const subscriptionId = sub.id;
        const status = sub.status;

        const priceId = sub.items?.data?.[0]?.price?.id ?? null;

        const currentPeriodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000)
          : null;

        const cancelAtPeriodEnd = sub.cancel_at_period_end;

        const userId = sub.metadata?.user_id;

        if (!userId) break;

        await supabaseAdmin
          .from("users_extended")
          .update({
            subscription_status: status,
            cancel_at_period_end: cancelAtPeriodEnd,
            current_period_end: currentPeriodEnd,
            stripe_price_id: priceId,
          })
          .eq("user_id", userId);

        break;
      }

      // ============================
      // 支払い失敗
      // ============================
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;

        if (!subscriptionId) break;

        const sub = await stripe.subscriptions.retrieve(subscriptionId);

        const userId = sub.metadata?.user_id;

        if (!userId) break;

        await supabaseAdmin
          .from("users_extended")
          .update({
            subscription_status: "past_due",
          })
          .eq("user_id", userId);

        break;
      }

      // ============================
      // 解約
      // ============================
      case "customer.subscription.deleted": {
        const sub = event.data.object;

        const userId = sub.metadata?.user_id;

        if (!userId) break;

        const { data } = await supabaseAdmin
          .from("users_extended")
          .select("plan")
          .eq("user_id", userId)
          .single();

        if (data?.plan !== "premium") {
          await supabaseAdmin
            .from("users_extended")
            .update({
              plan: "free",
              subscription_status: "canceled",
              stripe_subscription_id: null,
              stripe_price_id: null,
            })
            .eq("user_id", userId);
        }

        break;
      }

      default:
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error("❌ webhook error:", err);
    res.status(500).send("Webhook handler failed");
  }
}
