import { getUncachableStripeClient } from '../server/stripeClient';

async function createAiProProduct() {
  try {
    const stripe = await getUncachableStripeClient();

    console.log('Checking for existing AI Pro product...');
    const existing = await stripe.products.search({
      query: "name:'AI Pro — Player' AND active:'true'",
    });

    if (existing.data.length > 0) {
      console.log('AI Pro product already exists:', existing.data[0].id);
      const prices = await stripe.prices.list({ product: existing.data[0].id, active: true });
      prices.data.forEach(p => console.log(`  Price: ${p.id} — ${p.unit_amount} ${p.currency}/${(p.recurring as any)?.interval}`));
      return;
    }

    console.log('Creating AI Pro — Player product...');
    const product = await stripe.products.create({
      name: 'AI Pro — Player',
      description: 'Unlimited AI interactions per month — session digests, AI coaching chat, quest guidance, and match prep.',
      metadata: {
        type: 'ai_pro_player',
      },
    });
    console.log('Created product:', product.id);

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: 499, // €4.99
      currency: 'eur',
      recurring: { interval: 'month' },
    });
    console.log('Created monthly price:', price.id, '— €4.99/month');

    console.log('\nAI Pro product setup complete!');
    console.log('Product ID:', product.id);
    console.log('Price ID:', price.id);
  } catch (error: any) {
    console.error('Error creating AI Pro product:', error.message);
    process.exit(1);
  }
}

createAiProProduct();
