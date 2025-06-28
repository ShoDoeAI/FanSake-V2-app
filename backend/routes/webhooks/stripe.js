const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const stripeService = require('../../services/stripeService');
const WebhookLog = require('../../models/WebhookLog');

// Stripe webhook handler
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return res.status(400).send('Webhook Error: Missing signature or secret');
  }

  let event;

  try {
    // Construct event with signature verification
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Log webhook event
  const webhookLog = {
    eventId: event.id,
    type: event.type,
    status: 'received',
    receivedAt: new Date()
  };

  try {
    // Process webhook event
    await stripeService.handleWebhookEvent(event);
    
    webhookLog.status = 'processed';
    webhookLog.processedAt = new Date();
    
    console.log(`✅ Webhook ${event.type} processed successfully`);
  } catch (error) {
    console.error(`❌ Error processing webhook ${event.type}:`, error);
    
    webhookLog.status = 'failed';
    webhookLog.error = error.message;
    webhookLog.failedAt = new Date();
    
    // Don't return error to Stripe - acknowledge receipt
    // We'll retry processing later if needed
  }

  // Save webhook log (if model exists)
  try {
    if (WebhookLog) {
      await WebhookLog.create(webhookLog);
    }
  } catch (logError) {
    console.error('Error logging webhook:', logError);
  }

  // Acknowledge receipt of the event
  res.json({ received: true });
});

module.exports = router;