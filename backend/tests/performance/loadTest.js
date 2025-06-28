const autocannon = require('autocannon');
const axios = require('axios');

const BASE_URL = process.env.TEST_URL || 'http://localhost:5000';
const TEST_DURATION = process.env.TEST_DURATION || 60; // seconds
const CONNECTIONS = process.env.TEST_CONNECTIONS || 100;
const PIPELINING = process.env.TEST_PIPELINING || 10;

// Test scenarios
const scenarios = {
  homepage: {
    title: 'Homepage Load Test',
    url: `${BASE_URL}/`,
    method: 'GET',
    expectedLatency: 100,
    expectedThroughput: 1000
  },
  
  discovery: {
    title: 'Discovery API Load Test',
    url: `${BASE_URL}/api/discovery`,
    method: 'GET',
    headers: {
      'Authorization': 'Bearer test-token'
    },
    expectedLatency: 200,
    expectedThroughput: 500
  },
  
  streaming: {
    title: 'Audio Streaming Load Test',
    url: `${BASE_URL}/api/stream/test-audio`,
    method: 'GET',
    headers: {
      'Authorization': 'Bearer test-token',
      'Range': 'bytes=0-1048576'
    },
    expectedLatency: 500,
    expectedThroughput: 100
  },
  
  authentication: {
    title: 'Authentication Load Test',
    url: `${BASE_URL}/api/auth/login`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'TestPass123!'
    }),
    expectedLatency: 300,
    expectedThroughput: 200
  },
  
  contentUpload: {
    title: 'Content Upload Load Test',
    url: `${BASE_URL}/api/uploads/content`,
    method: 'POST',
    headers: {
      'Authorization': 'Bearer test-token',
      'Content-Type': 'multipart/form-data'
    },
    expectedLatency: 2000,
    expectedThroughput: 50
  }
};

// Performance thresholds
const THRESHOLDS = {
  p99Latency: 1000, // 99th percentile should be under 1 second
  p95Latency: 500,  // 95th percentile should be under 500ms
  p50Latency: 100,  // Median should be under 100ms
  errorRate: 0.01,  // Less than 1% error rate
  throughput: 100   // At least 100 req/sec
};

async function runLoadTest(scenario) {
  console.log(`\n=== Running ${scenario.title} ===`);
  
  const instance = autocannon({
    url: scenario.url,
    method: scenario.method,
    headers: scenario.headers,
    body: scenario.body,
    connections: CONNECTIONS,
    pipelining: PIPELINING,
    duration: TEST_DURATION,
    overallRate: scenario.expectedThroughput
  });
  
  instance.on('response', (client, statusCode, resBytes, responseTime) => {
    if (statusCode >= 400) {
      console.error(`Error ${statusCode} - Response time: ${responseTime}ms`);
    }
  });
  
  return new Promise((resolve) => {
    instance.on('done', (results) => {
      const report = {
        scenario: scenario.title,
        url: scenario.url,
        duration: results.duration,
        requests: {
          total: results.requests.sent,
          average: results.requests.average,
          mean: results.requests.mean,
          stddev: results.requests.stddev,
          min: results.requests.min,
          max: results.requests.max
        },
        latency: {
          average: results.latency.average,
          mean: results.latency.mean,
          stddev: results.latency.stddev,
          min: results.latency.min,
          max: results.latency.max,
          p50: results.latency.p50,
          p90: results.latency.p90,
          p95: results.latency.p95,
          p99: results.latency.p99
        },
        throughput: {
          average: results.throughput.average,
          mean: results.throughput.mean,
          stddev: results.throughput.stddev,
          min: results.throughput.min,
          max: results.throughput.max
        },
        errors: results.errors,
        timeouts: results.timeouts,
        mismatches: results.mismatches,
        non2xx: results.non2xx
      };
      
      // Check against thresholds
      const passed = checkThresholds(report);
      report.passed = passed;
      
      resolve(report);
    });
  });
}

function checkThresholds(report) {
  const checks = [
    {
      name: 'P99 Latency',
      actual: report.latency.p99,
      threshold: THRESHOLDS.p99Latency,
      passed: report.latency.p99 <= THRESHOLDS.p99Latency
    },
    {
      name: 'P95 Latency',
      actual: report.latency.p95,
      threshold: THRESHOLDS.p95Latency,
      passed: report.latency.p95 <= THRESHOLDS.p95Latency
    },
    {
      name: 'P50 Latency',
      actual: report.latency.p50,
      threshold: THRESHOLDS.p50Latency,
      passed: report.latency.p50 <= THRESHOLDS.p50Latency
    },
    {
      name: 'Error Rate',
      actual: (report.errors + report.timeouts) / report.requests.total,
      threshold: THRESHOLDS.errorRate,
      passed: ((report.errors + report.timeouts) / report.requests.total) <= THRESHOLDS.errorRate
    },
    {
      name: 'Throughput',
      actual: report.throughput.average,
      threshold: THRESHOLDS.throughput,
      passed: report.throughput.average >= THRESHOLDS.throughput
    }
  ];
  
  console.log('\nThreshold Checks:');
  checks.forEach(check => {
    const status = check.passed ? '✓' : '✗';
    console.log(`${status} ${check.name}: ${check.actual.toFixed(2)} (threshold: ${check.threshold})`);
  });
  
  return checks.every(check => check.passed);
}

async function generateReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    baseUrl: BASE_URL,
    configuration: {
      duration: TEST_DURATION,
      connections: CONNECTIONS,
      pipelining: PIPELINING
    },
    scenarios: results,
    summary: {
      totalScenarios: results.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
      overallStatus: results.every(r => r.passed) ? 'PASSED' : 'FAILED'
    }
  };
  
  // Save report
  const fs = require('fs');
  const reportPath = `./performance-report-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`\n=== Performance Test Summary ===`);
  console.log(`Total Scenarios: ${report.summary.totalScenarios}`);
  console.log(`Passed: ${report.summary.passed}`);
  console.log(`Failed: ${report.summary.failed}`);
  console.log(`Overall Status: ${report.summary.overallStatus}`);
  console.log(`Report saved to: ${reportPath}`);
  
  return report;
}

// Stress test function
async function runStressTest() {
  console.log('Starting stress test...');
  
  const stressLevels = [100, 500, 1000, 2000, 5000];
  const results = [];
  
  for (const connections of stressLevels) {
    console.log(`\nTesting with ${connections} concurrent connections...`);
    
    const instance = autocannon({
      url: `${BASE_URL}/api/discovery`,
      connections: connections,
      duration: 30,
      headers: {
        'Authorization': 'Bearer test-token'
      }
    });
    
    const result = await new Promise((resolve) => {
      instance.on('done', (results) => {
        resolve({
          connections,
          latency: results.latency,
          throughput: results.throughput,
          errors: results.errors,
          timeouts: results.timeouts
        });
      });
    });
    
    results.push(result);
    
    // Stop if error rate exceeds 10%
    const errorRate = (result.errors + result.timeouts) / result.requests.total;
    if (errorRate > 0.1) {
      console.log(`Stopping stress test - error rate exceeded 10% at ${connections} connections`);
      break;
    }
  }
  
  return results;
}

// Main execution
async function main() {
  try {
    // Wait for server to be ready
    console.log('Checking server availability...');
    await axios.get(`${BASE_URL}/api/health`);
    console.log('Server is ready!');
    
    // Run load tests
    const results = [];
    for (const [key, scenario] of Object.entries(scenarios)) {
      const result = await runLoadTest(scenario);
      results.push(result);
      
      // Cool down between tests
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Generate report
    const report = await generateReport(results);
    
    // Run stress test if all scenarios passed
    if (report.summary.overallStatus === 'PASSED') {
      console.log('\n=== Running Stress Test ===');
      const stressResults = await runStressTest();
      console.log('Stress test results:', stressResults);
    }
    
    // Exit with appropriate code
    process.exit(report.summary.overallStatus === 'PASSED' ? 0 : 1);
    
  } catch (error) {
    console.error('Load test failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { runLoadTest, checkThresholds, scenarios };