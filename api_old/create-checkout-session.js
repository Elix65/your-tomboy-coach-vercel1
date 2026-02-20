import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PACKS = {
  "55":  { pulls: 55,  unit_amount: 499 },  // $4.99 (cambiá si querés)
  "111": { pulls: 111, unit_amount: 899 },  // $8.99
  "333": { pulls: 333, unit_amount: 1999 }, // $19.99
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const { user_id, pack } = req.body || {};
    const key = String(pack);

    if (!user_id) return res.status(400).json({ error: "Missing user_id" });
    if (!PACKS[key]) return res.status(400).json({ error: "Invalid pack" });

    const { pulls, unit_amount } = PACKS[key];

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount,
          product_data: { name: `Yumiko Coins • ${pulls} tiradas premium` },
        },
        quantity: 1,
      }],
      success_url: `${process.env.SITE_URL}/gacha.html?paid=1`,
      cancel_url: `${process.env.SITE_URL}/gacha.html?paid=0`,
      metadata: {
        user_id,
        tipo: "premium",
        pulls: String(pulls),
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Internal error" });
  }
}
