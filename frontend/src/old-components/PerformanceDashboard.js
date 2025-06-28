import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';

const PerformanceDashboard = () => {
  const [metrics, setMetrics] = useState({
    loading: {
      ttfb: 0,
      fcp: 0,
      lcp: 0,
      fid: 0,
      cls: 0,
      tti: 0,
    },
    api: {
      avgResponseTime: 0,
      cacheHitRate: 0,
      errorRate: 0,
      requestsPerMinute: 0,
    },
    resources: {
      totalSize: 0,
      cachedSize: 0,
      imageOptimization: 0,
      cdnHitRate: 0,
    },
    user: {
      bounceRate: 0,
      avgSessionDuration: 0,
      pageViewsPerSession: 0,
    },
  });

  const [realTimeData, setRealTimeData] = useState([]);

  useEffect(() => {
    // Collect Web Vitals
    if ('PerformanceObserver' in window) {
      try {
        // First Contentful Paint
        const fcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const fcp = entries.find(entry => entry.name === 'first-contentful-paint');
          if (fcp) {
            setMetrics(prev => ({
              ...prev,
              loading: { ...prev.loading, fcp: Math.round(fcp.startTime) }
            }));
          }
        });
        fcpObserver.observe({ entryTypes: ['paint'] });

        // Largest Contentful Paint
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          setMetrics(prev => ({
            ...prev,
            loading: { ...prev.loading, lcp: Math.round(lastEntry.startTime) }
          }));
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

        // First Input Delay
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const firstInput = entries[0];
          if (firstInput) {
            const fid = firstInput.processingStart - firstInput.startTime;
            setMetrics(prev => ({
              ...prev,
              loading: { ...prev.loading, fid: Math.round(fid) }
            }));
          }
        });
        fidObserver.observe({ entryTypes: ['first-input'] });

        // Cumulative Layout Shift
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
              setMetrics(prev => ({
                ...prev,
                loading: { ...prev.loading, cls: clsValue.toFixed(3) }
              }));
            }
          }
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });

      } catch (e) {
        console.error('Performance Observer error:', e);
      }
    }

    // Collect navigation timing
    if (window.performance && window.performance.timing) {
      const timing = window.performance.timing;
      const ttfb = timing.responseStart - timing.navigationStart;
      const tti = timing.domInteractive - timing.navigationStart;
      
      setMetrics(prev => ({
        ...prev,
        loading: {
          ...prev.loading,
          ttfb: Math.round(ttfb),
          tti: Math.round(tti),
        }
      }));
    }

    // Fetch API metrics
    fetchAPIMetrics();
    const interval = setInterval(fetchAPIMetrics, 5000);

    // Real-time monitoring
    startRealTimeMonitoring();

    return () => {
      clearInterval(interval);
    };
  }, []);

  const fetchAPIMetrics = async () => {
    try {
      const response = await fetch('/api/metrics');
      const data = await response.json();
      
      setMetrics(prev => ({
        ...prev,
        api: {
          avgResponseTime: data.avgResponseTime || 0,
          cacheHitRate: data.cacheHitRate || 0,
          errorRate: data.errorRate || 0,
          requestsPerMinute: data.requestsPerMinute || 0,
        },
        resources: {
          ...prev.resources,
          cdnHitRate: data.cdnHitRate || 0,
        }
      }));
    } catch (error) {
      console.error('Failed to fetch API metrics:', error);
    }
  };

  const startRealTimeMonitoring = () => {
    // Monitor resource loading
    if ('PerformanceObserver' in window) {
      const resourceObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const newData = entries.map(entry => ({
          name: entry.name.split('/').pop(),
          type: entry.initiatorType,
          duration: Math.round(entry.duration),
          size: Math.round(entry.transferSize / 1024),
          cached: entry.transferSize === 0,
          timestamp: Date.now(),
        }));
        
        setRealTimeData(prev => [...prev.slice(-20), ...newData]);
      });
      
      resourceObserver.observe({ entryTypes: ['resource'] });
    }
  };

  const getScoreColor = (value, thresholds) => {
    if (value <= thresholds.good) return 'text-green-500';
    if (value <= thresholds.moderate) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getPerformanceScore = () => {
    const { fcp, lcp, fid, cls, ttfb } = metrics.loading;
    
    let score = 100;
    
    // Deduct points based on Web Vitals thresholds
    if (fcp > 1800) score -= 10;
    else if (fcp > 3000) score -= 20;
    
    if (lcp > 2500) score -= 15;
    else if (lcp > 4000) score -= 30;
    
    if (fid > 100) score -= 10;
    else if (fid > 300) score -= 20;
    
    if (cls > 0.1) score -= 10;
    else if (cls > 0.25) score -= 15;
    
    if (ttfb > 800) score -= 10;
    else if (ttfb > 1800) score -= 20;
    
    return Math.max(0, score);
  };

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Performance Dashboard</h1>
        
        {/* Overall Score */}
        <Card className="mb-8">
          <div className="p-6">
            <h2 className="text-xl font-semibold mb-4">Overall Performance Score</h2>
            <div className="flex items-center justify-center">
              <div className="relative w-48 h-48">
                <svg className="transform -rotate-90 w-48 h-48">
                  <circle
                    cx="96"
                    cy="96"
                    r="88"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="none"
                    className="text-gray-700"
                  />
                  <circle
                    cx="96"
                    cy="96"
                    r="88"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="none"
                    strokeDasharray={`${getPerformanceScore() * 5.52} 552`}
                    className={getPerformanceScore() > 89 ? 'text-green-500' : getPerformanceScore() > 49 ? 'text-yellow-500' : 'text-red-500'}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-4xl font-bold">{getPerformanceScore()}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Web Vitals */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-2">First Contentful Paint</h3>
              <p className={`text-3xl font-bold ${getScoreColor(metrics.loading.fcp, { good: 1800, moderate: 3000 })}`}>
                {metrics.loading.fcp}ms
              </p>
              <p className="text-sm text-gray-400 mt-1">Target: &lt; 1.8s</p>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-2">Largest Contentful Paint</h3>
              <p className={`text-3xl font-bold ${getScoreColor(metrics.loading.lcp, { good: 2500, moderate: 4000 })}`}>
                {metrics.loading.lcp}ms
              </p>
              <p className="text-sm text-gray-400 mt-1">Target: &lt; 2.5s</p>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-2">First Input Delay</h3>
              <p className={`text-3xl font-bold ${getScoreColor(metrics.loading.fid, { good: 100, moderate: 300 })}`}>
                {metrics.loading.fid}ms
              </p>
              <p className="text-sm text-gray-400 mt-1">Target: &lt; 100ms</p>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-2">Cumulative Layout Shift</h3>
              <p className={`text-3xl font-bold ${getScoreColor(parseFloat(metrics.loading.cls), { good: 0.1, moderate: 0.25 })}`}>
                {metrics.loading.cls}
              </p>
              <p className="text-sm text-gray-400 mt-1">Target: &lt; 0.1</p>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-2">Time to First Byte</h3>
              <p className={`text-3xl font-bold ${getScoreColor(metrics.loading.ttfb, { good: 800, moderate: 1800 })}`}>
                {metrics.loading.ttfb}ms
              </p>
              <p className="text-sm text-gray-400 mt-1">Target: &lt; 800ms</p>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-2">Time to Interactive</h3>
              <p className={`text-3xl font-bold ${getScoreColor(metrics.loading.tti, { good: 3800, moderate: 7300 })}`}>
                {metrics.loading.tti}ms
              </p>
              <p className="text-sm text-gray-400 mt-1">Target: &lt; 3.8s</p>
            </div>
          </Card>
        </div>

        {/* API Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-2">Avg API Response</h3>
              <p className="text-3xl font-bold">{metrics.api.avgResponseTime}ms</p>
              <p className="text-sm text-gray-400 mt-1">Target: &lt; 100ms</p>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-2">Cache Hit Rate</h3>
              <p className="text-3xl font-bold">{metrics.api.cacheHitRate}%</p>
              <p className="text-sm text-gray-400 mt-1">Target: &gt; 80%</p>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-2">Error Rate</h3>
              <p className="text-3xl font-bold">{metrics.api.errorRate}%</p>
              <p className="text-sm text-gray-400 mt-1">Target: &lt; 1%</p>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-2">Requests/Min</h3>
              <p className="text-3xl font-bold">{metrics.api.requestsPerMinute}</p>
            </div>
          </Card>
        </div>

        {/* Real-time Resource Monitoring */}
        <Card>
          <div className="p-6">
            <h2 className="text-xl font-semibold mb-4">Real-time Resource Loading</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b border-gray-700">
                    <th className="pb-2">Resource</th>
                    <th className="pb-2">Type</th>
                    <th className="pb-2">Duration</th>
                    <th className="pb-2">Size</th>
                    <th className="pb-2">Cached</th>
                  </tr>
                </thead>
                <tbody>
                  {realTimeData.slice(-10).reverse().map((resource, index) => (
                    <tr key={index} className="border-b border-gray-700">
                      <td className="py-2 truncate max-w-xs">{resource.name}</td>
                      <td className="py-2">{resource.type}</td>
                      <td className={`py-2 ${resource.duration > 1000 ? 'text-red-500' : resource.duration > 500 ? 'text-yellow-500' : 'text-green-500'}`}>
                        {resource.duration}ms
                      </td>
                      <td className="py-2">{resource.size}KB</td>
                      <td className="py-2">
                        {resource.cached ? (
                          <span className="text-green-500">✓</span>
                        ) : (
                          <span className="text-gray-500">✗</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default PerformanceDashboard;