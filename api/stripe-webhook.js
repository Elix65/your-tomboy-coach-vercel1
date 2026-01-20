import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function readBuffer(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  try {
    const buf = await readBuffer(req);
    const sig = req.headers["stripe-signature"];

    const event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.user_id;
      const pulls = Number(session.metadata?.pulls || 0);

      if (userId && pulls > 0) {
        // sumar saldo premium (server-side)
        const { data: row } = await supabaseAdmin
          .from("user_rolls")
          .select("id,cantidad")
          .eq("user_id", userId)
          .eq("tipo", "premium")
          .maybeSingle();

        if (!row) {
          await supabaseAdmin.from("user_rolls").insert({
            user_id: userId,
            tipo: "premium",
            cantidad: pulls,
            skin_id: null
          });
        } else {
          await supabaseAdmin
            .from("user_rolls")
            .update({ cantidad: (row.cantidad || 0) + pulls })
            .eq("id", row.id);
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
}
