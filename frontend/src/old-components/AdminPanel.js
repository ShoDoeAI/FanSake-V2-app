import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './AdminPanel.css';

const AdminPanel = () => {
  const [activeTab, setActiveTab] = useState('flags');
  const [flags, setFlags] = useState({});
  const [rollouts, setRollouts] = useState([]);
  const [newRollout, setNewRollout] = useState({
    name: '',
    feature: '',
    stages: [
      { percentage: 5, duration: 30 },
      { percentage: 25, duration: 60 },
      { percentage: 50, duration: 120 },
      { percentage: 100, duration: 0 }
    ]
  });
  const [abTestResults, setAbTestResults] = useState(null);

  useEffect(() => {
    loadFeatureFlags();
    loadRollouts();
  }, []);

  const loadFeatureFlags = async () => {
    try {
      const response = await api.get('/api/features/admin/flags');
      setFlags(response.data);
    } catch (error) {
      console.error('Failed to load flags:', error);
    }
  };

  const loadRollouts = async () => {
    try {
      const response = await api.get('/api/features/admin/rollouts');
      setRollouts(response.data);
    } catch (error) {
      console.error('Failed to load rollouts:', error);
    }
  };

  const updateFlag = async (flagName, updates) => {
    try {
      await api.put(`/api/features/admin/flags/${flagName}`, updates);
      loadFeatureFlags();
    } catch (error) {
      console.error('Failed to update flag:', error);
    }
  };

  const toggleFlag = async (flagName, enabled) => {
    try {
      await api.post(`/api/features/admin/flags/${flagName}/toggle`, { enabled });
      loadFeatureFlags();
    } catch (error) {
      console.error('Failed to toggle flag:', error);
    }
  };

  const updateRollout = async (flagName, percentage) => {
    try {
      await api.post(`/api/features/admin/flags/${flagName}/rollout`, { percentage });
      loadFeatureFlags();
    } catch (error) {
      console.error('Failed to update rollout:', error);
    }
  };

  const createRollout = async () => {
    try {
      await api.post('/api/features/admin/rollouts', newRollout);
      loadRollouts();
      setNewRollout({
        name: '',
        feature: '',
        stages: [
          { percentage: 5, duration: 30 },
          { percentage: 25, duration: 60 },
          { percentage: 50, duration: 120 },
          { percentage: 100, duration: 0 }
        ]
      });
    } catch (error) {
      console.error('Failed to create rollout:', error);
    }
  };

  const startRollout = async (rolloutId) => {
    try {
      await api.post(`/api/features/admin/rollouts/${rolloutId}/start`);
      loadRollouts();
    } catch (error) {
      console.error('Failed to start rollout:', error);
    }
  };

  const pauseRollout = async (rolloutId) => {
    try {
      await api.post(`/api/features/admin/rollouts/${rolloutId}/pause`);
      loadRollouts();
    } catch (error) {
      console.error('Failed to pause rollout:', error);
    }
  };

  const rollbackRollout = async (rolloutId, reason) => {
    try {
      await api.post(`/api/features/admin/rollouts/${rolloutId}/rollback`, { reason });
      loadRollouts();
    } catch (error) {
      console.error('Failed to rollback:', error);
    }
  };

  const loadABTestResults = async (flagName, metric) => {
    try {
      const response = await api.get(`/api/features/admin/flags/${flagName}/ab-test/results`, {
        params: { metric }
      });
      setAbTestResults(response.data);
    } catch (error) {
      console.error('Failed to load A/B test results:', error);
    }
  };

  const renderFeatureFlags = () => (
    <div className="feature-flags">
      <h2>Feature Flags</h2>
      <div className="flags-grid">
        {Object.entries(flags).map(([flagName, flag]) => (
          <div key={flagName} className="flag-card">
            <div className="flag-header">
              <h3>{flagName}</h3>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={flag.enabled}
                  onChange={(e) => toggleFlag(flagName, e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>
            <div className="flag-body">
              <div className="rollout-control">
                <label>Rollout: {flag.rollout}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={flag.rollout}
                  onChange={(e) => updateRollout(flagName, parseInt(e.target.value))}
                  disabled={!flag.enabled}
                />
              </div>
              {flag.abTest && (
                <div className="ab-test-info">
                  <p>A/B Test Active</p>
                  <button onClick={() => loadABTestResults(flagName, 'conversion')}>
                    View Results
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderRollouts = () => (
    <div className="rollouts">
      <h2>Progressive Rollouts</h2>
      
      <div className="new-rollout">
        <h3>Create New Rollout</h3>
        <input
          type="text"
          placeholder="Rollout Name"
          value={newRollout.name}
          onChange={(e) => setNewRollout({ ...newRollout, name: e.target.value })}
        />
        <select
          value={newRollout.feature}
          onChange={(e) => setNewRollout({ ...newRollout, feature: e.target.value })}
        >
          <option value="">Select Feature</option>
          {Object.keys(flags).map(flag => (
            <option key={flag} value={flag}>{flag}</option>
          ))}
        </select>
        <button onClick={createRollout}>Create Rollout</button>
      </div>

      <div className="rollouts-list">
        {rollouts.map(rollout => (
          <div key={rollout.id} className={`rollout-card ${rollout.status}`}>
            <div className="rollout-header">
              <h3>{rollout.name}</h3>
              <span className={`status-badge ${rollout.status}`}>{rollout.status}</span>
            </div>
            <div className="rollout-body">
              <p>Feature: {rollout.feature}</p>
              <p>Progress: Stage {rollout.currentStage + 1} of {rollout.stages.length}</p>
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${(rollout.currentStage / rollout.stages.length) * 100}%` }}
                />
              </div>
              <div className="rollout-metrics">
                <p>Error Rate: {(rollout.metrics.errorRate * 100).toFixed(2)}%</p>
                <p>Latency: {rollout.metrics.latency.toFixed(0)}ms</p>
                <p>Success Rate: {rollout.metrics.successRate.toFixed(1)}%</p>
              </div>
              <div className="rollout-actions">
                {rollout.status === 'pending' && (
                  <button onClick={() => startRollout(rollout.id)}>Start</button>
                )}
                {rollout.status === 'active' && (
                  <>
                    <button onClick={() => pauseRollout(rollout.id)}>Pause</button>
                    <button 
                      className="danger" 
                      onClick={() => {
                        const reason = prompt('Rollback reason:');
                        if (reason) rollbackRollout(rollout.id, reason);
                      }}
                    >
                      Rollback
                    </button>
                  </>
                )}
                {rollout.status === 'paused' && (
                  <button onClick={() => api.post(`/api/features/admin/rollouts/${rollout.id}/resume`)}>
                    Resume
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderABTestResults = () => (
    <div className="ab-test-results">
      <h2>A/B Test Results</h2>
      {abTestResults ? (
        <div className="results-container">
          <h3>{abTestResults.flagName}</h3>
          <p>Metric: {abTestResults.metric}</p>
          <p>Started: {new Date(abTestResults.startDate).toLocaleDateString()}</p>
          
          <div className="variants-comparison">
            <div className="variant control">
              <h4>Control</h4>
              <p>Users: {abTestResults.results.control.users}</p>
              <p>Conversions: {abTestResults.results.control.conversions}</p>
              <p>Rate: {(abTestResults.results.control.conversionRate * 100).toFixed(2)}%</p>
            </div>
            <div className="variant treatment">
              <h4>Treatment</h4>
              <p>Users: {abTestResults.results.treatment.users}</p>
              <p>Conversions: {abTestResults.results.treatment.conversions}</p>
              <p>Rate: {(abTestResults.results.treatment.conversionRate * 100).toFixed(2)}%</p>
            </div>
          </div>
          
          <div className="test-summary">
            <p>Improvement: {(abTestResults.results.improvement * 100).toFixed(1)}%</p>
            <p>P-Value: {abTestResults.results.pValue.toFixed(3)}</p>
            <p className={abTestResults.results.significant ? 'significant' : 'not-significant'}>
              {abTestResults.results.significant ? 'Statistically Significant' : 'Not Statistically Significant'}
            </p>
          </div>
        </div>
      ) : (
        <p>Select a feature flag with an active A/B test to view results.</p>
      )}
    </div>
  );

  return (
    <div className="admin-panel">
      <h1>MusicConnect Admin Panel</h1>
      
      <div className="admin-tabs">
        <button 
          className={activeTab === 'flags' ? 'active' : ''}
          onClick={() => setActiveTab('flags')}
        >
          Feature Flags
        </button>
        <button 
          className={activeTab === 'rollouts' ? 'active' : ''}
          onClick={() => setActiveTab('rollouts')}
        >
          Rollouts
        </button>
        <button 
          className={activeTab === 'ab-tests' ? 'active' : ''}
          onClick={() => setActiveTab('ab-tests')}
        >
          A/B Tests
        </button>
      </div>
      
      <div className="admin-content">
        {activeTab === 'flags' && renderFeatureFlags()}
        {activeTab === 'rollouts' && renderRollouts()}
        {activeTab === 'ab-tests' && renderABTestResults()}
      </div>
    </div>
  );
};

export default AdminPanel;