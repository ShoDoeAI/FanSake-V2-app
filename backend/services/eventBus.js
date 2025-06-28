const EventEmitter = require('events');

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // Increase max listeners for scalability
  }

  // Emit an event with optional metadata
  publish(eventName, data, metadata = {}) {
    const event = {
      name: eventName,
      data,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
        id: this.generateEventId()
      }
    };

    this.emit(eventName, event);
    this.emit('*', event); // Wildcard listener for all events
    
    // Log event for debugging in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[EventBus] Published: ${eventName}`, { data: event.data });
    }
  }

  // Subscribe to an event
  subscribe(eventName, handler) {
    this.on(eventName, handler);
    
    // Return unsubscribe function
    return () => {
      this.off(eventName, handler);
    };
  }

  // Subscribe to an event once
  subscribeOnce(eventName, handler) {
    this.once(eventName, handler);
  }

  // Generate unique event ID
  generateEventId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  // Clear all listeners for an event
  clearListeners(eventName) {
    if (eventName) {
      this.removeAllListeners(eventName);
    } else {
      this.removeAllListeners();
    }
  }

  // Get listener count for debugging
  getListenerCount(eventName) {
    return this.listenerCount(eventName);
  }
}

// Export singleton instance
module.exports = new EventBus();