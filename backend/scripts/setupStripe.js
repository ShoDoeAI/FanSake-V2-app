require('dotenv').config();
const stripeService = require('../services/stripeService');

async function setupStripeProducts() {
  console.log('🎯 Setting up Stripe products and prices...\n');

  try {
    // 1. Create products and prices
    console.log('1. Creating subscription products...');
    const priceIds = await stripeService.setupStripeProducts();
    
    console.log('\n✅ Products created successfully!');
    console.log('================================');
    console.log('Add these to your .env file:');
    console.log(`STRIPE_PRICE_SUPPORTER=${priceIds.supporter}`);
    console.log(`STRIPE_PRICE_SUPERFAN=${priceIds.superfan}`);
    console.log('================================\n');

    // 2. Configure webhook endpoint
    console.log('2. Webhook endpoint configuration...');
    console.log('Add this webhook endpoint in your Stripe Dashboard:');
    console.log(`${process.env.FRONTEND_URL || 'https://your-domain.com'}/api/webhooks/stripe`);
    console.log('\nSelect these events:');
    console.log('- customer.subscription.created');
    console.log('- customer.subscription.updated');
    console.log('- customer.subscription.deleted');
    console.log('- invoice.payment_succeeded');
    console.log('- invoice.payment_failed');
    console.log('- customer.subscription.trial_will_end');
    console.log('- payout.created');
    console.log('- payout.updated');
    console.log('- payout.failed');
    console.log('- payout.paid\n');

    // 3. Configure Customer Portal
    console.log('3. Customer Portal configuration...');
    console.log('Enable the Customer Portal in Stripe Dashboard:');
    console.log('https://dashboard.stripe.com/settings/billing/portal');
    console.log('\nRecommended settings:');
    console.log('- Allow customers to update payment methods');
    console.log('- Allow customers to cancel subscriptions');
    console.log('- Allow customers to switch plans');
    console.log('- Show invoice history\n');

    // 4. Test mode reminder
    console.log('⚠️  Important reminders:');
    console.log('- Currently in TEST mode (using test API keys)');
    console.log('- Use test cards: 4242 4242 4242 4242');
    console.log('- Switch to live keys when ready for production');
    console.log('- Set up separate webhook endpoints for live mode\n');

    // 5. Revenue split summary
    console.log('💰 Revenue Split Configuration:');
    console.log('- Stripe fees: 2.9% + $0.30');
    console.log('- Platform fee: 10% (after Stripe fees)');
    console.log('- Artist receives: ~87% of gross revenue');
    console.log('\nExample: $10 subscription');
    console.log('- Stripe fee: $0.59');
    console.log('- Platform fee: $0.94');
    console.log('- Artist payout: $8.47\n');

    console.log('✅ Stripe setup complete!');

  } catch (error) {
    console.error('❌ Stripe setup failed:', error);
    process.exit(1);
  }
}

// Run setup if called directly
if (require.main === module) {
  setupStripeProducts();
}

module.exports = setupStripeProducts;