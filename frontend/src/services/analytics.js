class AnalyticsService {
  constructor() {
    this.queue = [];
    this.userId = null;
    this.sessionId = this.generateSessionId();
    this.initialized = false;
    
    // Initialize third-party analytics
    this.initializeProviders();
    
    // Batch events every 5 seconds
    setInterval(() => this.flush(), 5000);
    
    // Flush on page unload
    window.addEventListener('beforeunload', () => this.flush());
  }
  
  initializeProviders() {
    // Google Analytics 4
    if (window.gtag && process.env.REACT_APP_GA_MEASUREMENT_ID) {
      window.gtag('config', process.env.REACT_APP_GA_MEASUREMENT_ID, {
        send_page_view: false
      });
      this.initialized = true;
    }
    
    // Segment
    if (window.analytics && process.env.REACT_APP_SEGMENT_WRITE_KEY) {
      window.analytics.load(process.env.REACT_APP_SEGMENT_WRITE_KEY);
      this.initialized = true;
    }
    
    // Mixpanel
    if (window.mixpanel && process.env.REACT_APP_MIXPANEL_TOKEN) {
      window.mixpanel.init(process.env.REACT_APP_MIXPANEL_TOKEN);
      this.initialized = true;
    }
  }
  
  identify(userId, traits = {}) {
    this.userId = userId;
    
    // Google Analytics
    if (window.gtag) {
      window.gtag('set', { user_id: userId });
    }
    
    // Segment
    if (window.analytics) {
      window.analytics.identify(userId, traits);
    }
    
    // Mixpanel
    if (window.mixpanel) {
      window.mixpanel.identify(userId);
      window.mixpanel.people.set(traits);
    }
  }
  
  track(event, properties = {}) {
    const eventData = {
      event,
      properties: {
        ...properties,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        referrer: document.referrer,
        userAgent: navigator.userAgent
      },
      userId: this.userId
    };
    
    // Add to queue for batch processing
    this.queue.push(eventData);
    
    // Send immediately for critical events
    if (this.isCriticalEvent(event)) {
      this.sendEvent(eventData);
    }
  }
  
  page(name, properties = {}) {
    const pageData = {
      name,
      properties: {
        ...properties,
        path: window.location.pathname,
        search: window.location.search,
        title: document.title,
        url: window.location.href
      }
    };
    
    // Google Analytics
    if (window.gtag) {
      window.gtag('event', 'page_view', {
        page_title: name,
        page_location: window.location.href,
        page_path: window.location.pathname,
        ...properties
      });
    }
    
    // Segment
    if (window.analytics) {
      window.analytics.page(name, pageData.properties);
    }
    
    // Mixpanel
    if (window.mixpanel) {
      window.mixpanel.track('Page View', pageData.properties);
    }
  }
  
  // A/B Testing Integration
  experimentViewed(experimentName, variant) {
    this.track('Experiment Viewed', {
      experiment_name: experimentName,
      variant: variant
    });
  }
  
  // E-commerce Events
  productViewed(product) {
    this.track('Product Viewed', {
      product_id: product.id,
      product_name: product.name,
      category: product.category,
      price: product.price,
      currency: 'USD'
    });
  }
  
  subscriptionStarted(subscription) {
    this.track('Subscription Started', {
      subscription_id: subscription.id,
      artist_id: subscription.artistId,
      tier: subscription.tier,
      price: subscription.price,
      currency: 'USD',
      billing_period: 'monthly'
    });
  }
  
  subscriptionCanceled(subscription) {
    this.track('Subscription Canceled', {
      subscription_id: subscription.id,
      artist_id: subscription.artistId,
      tier: subscription.tier,
      cancel_reason: subscription.cancelReason,
      duration_days: this.calculateDuration(subscription.startDate)
    });
  }
  
  paymentCompleted(payment) {
    this.track('Payment Completed', {
      payment_id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      payment_method: payment.method,
      status: payment.status
    });
    
    // Revenue tracking for Google Analytics
    if (window.gtag) {
      window.gtag('event', 'purchase', {
        transaction_id: payment.id,
        value: payment.amount,
        currency: payment.currency,
        items: payment.items
      });
    }
  }
  
  // Content Events
  contentPlayed(content) {
    this.track('Content Played', {
      content_id: content.id,
      content_type: content.type,
      artist_id: content.artistId,
      duration: content.duration,
      tier: content.tier
    });
  }
  
  contentLiked(content) {
    this.track('Content Liked', {
      content_id: content.id,
      content_type: content.type,
      artist_id: content.artistId
    });
  }
  
  contentShared(content, platform) {
    this.track('Content Shared', {
      content_id: content.id,
      content_type: content.type,
      artist_id: content.artistId,
      platform: platform
    });
  }
  
  // User Engagement
  messagesSent(recipient) {
    this.track('Message Sent', {
      recipient_id: recipient.id,
      recipient_type: recipient.type
    });
  }
  
  listeningPartyJoined(party) {
    this.track('Listening Party Joined', {
      party_id: party.id,
      artist_id: party.artistId,
      participant_count: party.participantCount
    });
  }
  
  // Search Events
  searchPerformed(query, results) {
    this.track('Search Performed', {
      query: query,
      results_count: results.length,
      has_results: results.length > 0
    });
  }
  
  // Error Tracking
  errorOccurred(error, context = {}) {
    this.track('Error Occurred', {
      error_message: error.message,
      error_stack: error.stack,
      error_type: error.name,
      ...context
    });
    
    // Send to error tracking service
    if (window.Sentry) {
      window.Sentry.captureException(error, {
        extra: context
      });
    }
  }
  
  // Performance Tracking
  performanceMetric(metric, value, tags = {}) {
    this.track('Performance Metric', {
      metric_name: metric,
      value: value,
      unit: tags.unit || 'ms',
      ...tags
    });
  }
  
  // Utilities
  generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  calculateDuration(startDate) {
    const start = new Date(startDate);
    const now = new Date();
    return Math.floor((now - start) / (1000 * 60 * 60 * 24));
  }
  
  isCriticalEvent(event) {
    const criticalEvents = [
      'Subscription Started',
      'Subscription Canceled',
      'Payment Completed',
      'Error Occurred'
    ];
    return criticalEvents.includes(event);
  }
  
  async sendEvent(eventData) {
    try {
      // Send to internal analytics endpoint
      const response = await fetch('/api/analytics/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(eventData)
      });
      
      if (!response.ok) {
        console.error('Failed to send analytics event:', response.statusText);
      }
    } catch (error) {
      console.error('Analytics error:', error);
    }
  }
  
  async flush() {
    if (this.queue.length === 0) return;
    
    const events = [...this.queue];
    this.queue = [];
    
    try {
      // Batch send to internal endpoint
      await fetch('/api/analytics/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ events })
      });
      
      // Send to third-party providers
      events.forEach(event => {
        // Segment
        if (window.analytics) {
          window.analytics.track(event.event, event.properties);
        }
        
        // Mixpanel
        if (window.mixpanel) {
          window.mixpanel.track(event.event, event.properties);
        }
        
        // Google Analytics
        if (window.gtag) {
          window.gtag('event', event.event.replace(/\s+/g, '_').toLowerCase(), {
            event_category: 'engagement',
            ...event.properties
          });
        }
      });
    } catch (error) {
      console.error('Failed to flush analytics:', error);
      // Re-queue events on failure
      this.queue = [...events, ...this.queue];
    }
  }
  
  // Feature Flag Integration
  trackFeatureFlag(flagName, variant) {
    this.track('Feature Flag Evaluated', {
      flag_name: flagName,
      variant: variant,
      enabled: variant !== 'control'
    });
  }
  
  // User Feedback
  feedbackSubmitted(feedback) {
    this.track('Feedback Submitted', {
      feedback_type: feedback.type,
      rating: feedback.rating,
      has_comment: !!feedback.comment,
      category: feedback.category
    });
  }
}

export default new AnalyticsService();