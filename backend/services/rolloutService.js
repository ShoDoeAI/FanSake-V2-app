const EventEmitter = require('events');
const featureFlags = require('./featureFlags');

class RolloutService extends EventEmitter {
  constructor() {
    super();
    this.activeRollouts = new Map();
    this.healthChecks = new Map();
  }
  
  async createRollout(config) {
    const rollout = {
      id: `rollout-${Date.now()}`,
      name: config.name,
      feature: config.feature,
      startTime: new Date(),
      status: 'pending',
      stages: config.stages || this.getDefaultStages(),
      currentStage: 0,
      metrics: {
        errorRate: 0,
        latency: 0,
        successRate: 100
      },
      healthChecks: config.healthChecks || this.getDefaultHealthChecks(),
      rollbackTriggers: config.rollbackTriggers || this.getDefaultRollbackTriggers()
    };
    
    this.activeRollouts.set(rollout.id, rollout);
    return rollout;
  }
  
  async startRollout(rolloutId) {
    const rollout = this.activeRollouts.get(rolloutId);
    if (!rollout) throw new Error('Rollout not found');
    
    rollout.status = 'active';
    this.emit('rollout:started', rollout);
    
    // Start the rollout process
    await this.executeStage(rollout, 0);
    
    // Start health monitoring
    this.startHealthMonitoring(rollout);
    
    return rollout;
  }
  
  async executeStage(rollout, stageIndex) {
    if (stageIndex >= rollout.stages.length) {
      rollout.status = 'completed';
      this.emit('rollout:completed', rollout);
      return;
    }
    
    const stage = rollout.stages[stageIndex];
    rollout.currentStage = stageIndex;
    
    console.log(`Executing rollout stage ${stageIndex + 1}/${rollout.stages.length}: ${stage.percentage}%`);
    
    // Update feature flag rollout percentage
    await featureFlags.updateRollout(rollout.feature, stage.percentage);
    
    // Wait for validation period
    setTimeout(async () => {
      const validation = await this.validateStage(rollout, stage);
      
      if (validation.passed) {
        console.log(`Stage ${stageIndex + 1} validation passed`);
        
        // Proceed to next stage
        await this.executeStage(rollout, stageIndex + 1);
      } else {
        console.error(`Stage ${stageIndex + 1} validation failed:`, validation.reason);
        
        // Trigger rollback
        await this.rollback(rollout, validation.reason);
      }
    }, stage.duration * 60 * 1000); // Convert minutes to milliseconds
  }
  
  async validateStage(rollout, stage) {
    const metrics = await this.collectMetrics(rollout);
    rollout.metrics = metrics;
    
    // Check against thresholds
    for (const check of rollout.healthChecks) {
      const value = metrics[check.metric];
      
      switch (check.operator) {
        case 'lt':
          if (value >= check.threshold) {
            return {
              passed: false,
              reason: `${check.metric} (${value}) exceeded threshold (${check.threshold})`
            };
          }
          break;
        
        case 'gt':
          if (value <= check.threshold) {
            return {
              passed: false,
              reason: `${check.metric} (${value}) below threshold (${check.threshold})`
            };
          }
          break;
      }
    }
    
    // Check for manual hold
    if (stage.requiresApproval && !stage.approved) {
      return {
        passed: false,
        reason: 'Stage requires manual approval'
      };
    }
    
    return { passed: true };
  }
  
  async collectMetrics(rollout) {
    // In production, these would come from Prometheus/monitoring
    return {
      errorRate: Math.random() * 0.05, // 0-5% error rate
      latency: 100 + Math.random() * 100, // 100-200ms
      successRate: 95 + Math.random() * 5, // 95-100%
      cpu: Math.random() * 80, // 0-80%
      memory: Math.random() * 90, // 0-90%
      throughput: 1000 + Math.random() * 500 // 1000-1500 req/s
    };
  }
  
  startHealthMonitoring(rollout) {
    const interval = setInterval(async () => {
      if (rollout.status !== 'active') {
        clearInterval(interval);
        return;
      }
      
      const metrics = await this.collectMetrics(rollout);
      
      // Check rollback triggers
      for (const trigger of rollout.rollbackTriggers) {
        const value = metrics[trigger.metric];
        
        if (trigger.condition === 'gt' && value > trigger.threshold) {
          console.error(`Rollback triggered: ${trigger.metric} = ${value} > ${trigger.threshold}`);
          await this.rollback(rollout, `Auto-rollback: ${trigger.metric} exceeded threshold`);
          clearInterval(interval);
          return;
        }
      }
    }, 30000); // Check every 30 seconds
    
    this.healthChecks.set(rollout.id, interval);
  }
  
  async rollback(rollout, reason) {
    console.log(`Rolling back ${rollout.name}: ${reason}`);
    
    rollout.status = 'rolled_back';
    rollout.rollbackReason = reason;
    rollout.rollbackTime = new Date();
    
    // Disable feature
    await featureFlags.updateRollout(rollout.feature, 0);
    await featureFlags.disableFlag(rollout.feature);
    
    // Stop health monitoring
    const interval = this.healthChecks.get(rollout.id);
    if (interval) {
      clearInterval(interval);
      this.healthChecks.delete(rollout.id);
    }
    
    this.emit('rollout:rollback', { rollout, reason });
    
    // Send notifications
    await this.notifyRollback(rollout, reason);
  }
  
  async pauseRollout(rolloutId) {
    const rollout = this.activeRollouts.get(rolloutId);
    if (!rollout) throw new Error('Rollout not found');
    
    rollout.status = 'paused';
    rollout.pausedAt = new Date();
    
    this.emit('rollout:paused', rollout);
  }
  
  async resumeRollout(rolloutId) {
    const rollout = this.activeRollouts.get(rolloutId);
    if (!rollout || rollout.status !== 'paused') {
      throw new Error('Rollout not found or not paused');
    }
    
    rollout.status = 'active';
    delete rollout.pausedAt;
    
    // Resume from current stage
    await this.executeStage(rollout, rollout.currentStage);
    
    this.emit('rollout:resumed', rollout);
  }
  
  async approveStage(rolloutId, stageIndex) {
    const rollout = this.activeRollouts.get(rolloutId);
    if (!rollout) throw new Error('Rollout not found');
    
    if (stageIndex < rollout.stages.length) {
      rollout.stages[stageIndex].approved = true;
      rollout.stages[stageIndex].approvedBy = 'admin'; // Track actual user
      rollout.stages[stageIndex].approvedAt = new Date();
    }
  }
  
  getRolloutStatus(rolloutId) {
    const rollout = this.activeRollouts.get(rolloutId);
    if (!rollout) return null;
    
    return {
      ...rollout,
      progress: (rollout.currentStage / rollout.stages.length) * 100,
      currentPercentage: rollout.stages[rollout.currentStage]?.percentage || 0
    };
  }
  
  getAllRollouts() {
    return Array.from(this.activeRollouts.values());
  }
  
  // Default configurations
  getDefaultStages() {
    return [
      { percentage: 5, duration: 30 }, // 5% for 30 minutes
      { percentage: 25, duration: 60 }, // 25% for 1 hour
      { percentage: 50, duration: 120 }, // 50% for 2 hours
      { percentage: 100, duration: 0 } // 100% (complete)
    ];
  }
  
  getDefaultHealthChecks() {
    return [
      { metric: 'errorRate', operator: 'lt', threshold: 0.05 },
      { metric: 'latency', operator: 'lt', threshold: 500 },
      { metric: 'successRate', operator: 'gt', threshold: 95 }
    ];
  }
  
  getDefaultRollbackTriggers() {
    return [
      { metric: 'errorRate', condition: 'gt', threshold: 0.1 },
      { metric: 'latency', condition: 'gt', threshold: 1000 },
      { metric: 'cpu', condition: 'gt', threshold: 90 }
    ];
  }
  
  async notifyRollback(rollout, reason) {
    // Send Slack notification
    const message = {
      text: `🚨 Rollout Rollback Alert`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Rollout:* ${rollout.name}\n*Feature:* ${rollout.feature}\n*Reason:* ${reason}\n*Stage:* ${rollout.currentStage + 1}/${rollout.stages.length}`
          }
        }
      ]
    };
    
    // In production, send to Slack webhook
    console.log('Rollback notification:', message);
  }
}

module.exports = new RolloutService();