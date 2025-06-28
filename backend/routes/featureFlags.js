const express = require('express');
const router = express.Router();
const featureFlags = require('../services/featureFlags');
const rolloutService = require('../services/rolloutService');
const { authenticateToken, isAdmin } = require('../middleware/auth');

// Public endpoint to check feature flags
router.get('/check/:flagName', authenticateToken, async (req, res) => {
  try {
    const { flagName } = req.params;
    const userId = req.user?.id;
    const attributes = {
      role: req.user?.role,
      subscriptionTier: req.user?.subscriptionTier,
      region: req.headers['cf-ipcountry'] || 'US'
    };
    
    const enabled = await featureFlags.isEnabled(flagName, userId, attributes);
    
    res.json({
      flag: flagName,
      enabled,
      userId,
      variant: enabled ? featureFlags.getABTestVariant(flagName, userId) : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Track feature flag events
router.post('/track', authenticateToken, async (req, res) => {
  try {
    const { flagName, event, properties } = req.body;
    const userId = req.user.id;
    
    await featureFlags.trackEvent(flagName, userId, event, properties);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin endpoints
router.use('/admin', authenticateToken, isAdmin);

// Get all feature flags
router.get('/admin/flags', async (req, res) => {
  try {
    const flags = await featureFlags.getAllFlags();
    res.json(flags);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update feature flag
router.put('/admin/flags/:flagName', async (req, res) => {
  try {
    const { flagName } = req.params;
    const config = req.body;
    
    await featureFlags.setFlag(flagName, config);
    
    res.json({ success: true, flag: flagName, config });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update rollout percentage
router.post('/admin/flags/:flagName/rollout', async (req, res) => {
  try {
    const { flagName } = req.params;
    const { percentage } = req.body;
    
    await featureFlags.updateRollout(flagName, percentage);
    
    res.json({ success: true, flag: flagName, rollout: percentage });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Enable/disable flag
router.post('/admin/flags/:flagName/toggle', async (req, res) => {
  try {
    const { flagName } = req.params;
    const { enabled } = req.body;
    
    if (enabled) {
      await featureFlags.enableFlag(flagName);
    } else {
      await featureFlags.disableFlag(flagName);
    }
    
    res.json({ success: true, flag: flagName, enabled });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create A/B test
router.post('/admin/flags/:flagName/ab-test', async (req, res) => {
  try {
    const { flagName } = req.params;
    const config = req.body;
    
    await featureFlags.createABTest(flagName, config);
    
    res.json({ success: true, flag: flagName, abTest: config });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get A/B test results
router.get('/admin/flags/:flagName/ab-test/results', async (req, res) => {
  try {
    const { flagName } = req.params;
    const { metric } = req.query;
    
    const results = await featureFlags.getABTestResults(flagName, metric);
    
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rollout Management

// Create new rollout
router.post('/admin/rollouts', async (req, res) => {
  try {
    const rollout = await rolloutService.createRollout(req.body);
    res.json(rollout);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start rollout
router.post('/admin/rollouts/:rolloutId/start', async (req, res) => {
  try {
    const { rolloutId } = req.params;
    const rollout = await rolloutService.startRollout(rolloutId);
    res.json(rollout);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pause rollout
router.post('/admin/rollouts/:rolloutId/pause', async (req, res) => {
  try {
    const { rolloutId } = req.params;
    await rolloutService.pauseRollout(rolloutId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resume rollout
router.post('/admin/rollouts/:rolloutId/resume', async (req, res) => {
  try {
    const { rolloutId } = req.params;
    await rolloutService.resumeRollout(rolloutId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Rollback
router.post('/admin/rollouts/:rolloutId/rollback', async (req, res) => {
  try {
    const { rolloutId } = req.params;
    const { reason } = req.body;
    
    const rollout = rolloutService.getRolloutStatus(rolloutId);
    await rolloutService.rollback(rollout, reason);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve stage
router.post('/admin/rollouts/:rolloutId/approve', async (req, res) => {
  try {
    const { rolloutId } = req.params;
    const { stageIndex } = req.body;
    
    await rolloutService.approveStage(rolloutId, stageIndex);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get rollout status
router.get('/admin/rollouts/:rolloutId', async (req, res) => {
  try {
    const { rolloutId } = req.params;
    const status = rolloutService.getRolloutStatus(rolloutId);
    
    if (!status) {
      return res.status(404).json({ error: 'Rollout not found' });
    }
    
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all rollouts
router.get('/admin/rollouts', async (req, res) => {
  try {
    const rollouts = rolloutService.getAllRollouts();
    res.json(rollouts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;