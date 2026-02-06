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
    console.error("[stripe] webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      // ✅ 決済成功（Checkout完了）
      case "checkout.session.completed": {
        const session = event.data.object;

        const userId = session.client_reference_id || session.metadata?.user_id;
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        if (userId) {
          await supabaseAdmin
            .from("users_extended")
            .update({
              plan: "standard",
              stripe_customer_id: customerId || null,
              stripe_subscription_id: subscriptionId || null,
            })
            .eq("user_id", userId);
        }
        break;
      }

      // ✅ 支払い成功（継続課金での確定）
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;

        if (subscriptionId) {
          // subscriptionから user_id を引く（metadataに入れておくのが確実）
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const userId = sub.metadata?.user_id;

          if (userId) {
            await supabaseAdmin
              .from("users_extended")
              .update({
                plan: "standard",
                stripe_subscription_id: subscriptionId,
                stripe_customer_id: sub.customer || null,
                stripe_price_id: sub.items?.data?.[0]?.price?.id || null,
              })
              .eq("user_id", userId);
          }
        }
        break;
      }

      // ❌ 支払い失敗
      case "invoice.payment_failed":
      // ❌ 解約/停止
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const userId = sub.metadata?.user_id;

        if (userId) {
          // premium（塾生）は落としたくないので「premiumなら維持」
          const { data: ext } = await supabaseAdmin
            .from("users_extended")
            .select("plan")
            .eq("user_id", userId)
            .single();

          if (ext?.plan !== "premium") {
            await supabaseAdmin
              .from("users_extended")
              .update({
                plan: "free",
                stripe_subscription_id: null,
                stripe_price_id: null,
              })
              .eq("user_id", userId);
          }
        }
        break;
      }

      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (e) {
    console.error("[stripe] webhook handler error:", e);
    return res.status(500).send("Webhook handler failed");
  }
}
