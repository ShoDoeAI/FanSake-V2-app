const autocannon = require('autocannon');
const { performance } = require('perf_hooks');
const app = require('../../server');

describe('FanSake Performance Benchmarks', () => {
  const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
  const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN || 'test-token';

  describe('API Endpoint Performance', () => {
    test('Discovery endpoint handles 1000 RPS', async () => {
      const result = await autocannon({
        url: `${BASE_URL}/api/discovery/artists`,
        connections: 100,
        duration: 30,
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`
        }
      });

      expect(result.requests.average).toBeGreaterThan(1000);
      expect(result.latency.p99).toBeLessThan(500); // 99th percentile under 500ms
      expect(result.errors).toBe(0);
    });

    test('Content streaming maintains low latency', async () => {
      const result = await autocannon({
        url: `${BASE_URL}/api/content/stream/test-content-id`,
        connections: 50,
        duration: 30,
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`
        }
      });

      expect(result.latency.p95).toBeLessThan(100); // 95th percentile under 100ms
      expect(result.throughput.average).toBeGreaterThan(100 * 1024 * 1024); // 100MB/s
    });

    test('Authentication endpoints handle burst traffic', async () => {
      const result = await autocannon({
        url: `${BASE_URL}/api/auth/login`,
        method: 'POST',
        body: JSON.stringify({
          email: 'test@fansake.com',
          password: 'testpass123'
        }),
        headers: {
          'Content-Type': 'application/json'
        },
        connections: 200,
        amount: 10000,
        bailout: 1000 // Stop if 1000 errors
      });

      expect(result.errors).toBeLessThan(100); // Less than 1% error rate
      expect(result.latency.mean).toBeLessThan(1000);
    });
  });

  describe('Database Performance', () => {
    test('Complex queries execute within SLA', async () => {
      const queries = [
        {
          name: 'Artist feed generation',
          query: async () => {
            const start = performance.now();
            await db.collection('content')
              .aggregate([
                { $match: { artistId: { $in: ['artist1', 'artist2', 'artist3'] } } },
                { $sort: { createdAt: -1 } },
                { $limit: 50 },
                { $lookup: {
                  from: 'artists',
                  localField: 'artistId',
                  foreignField: '_id',
                  as: 'artist'
                }},
                { $unwind: '$artist' }
              ]).toArray();
            return performance.now() - start;
          },
          maxTime: 50
        },
        {
          name: 'Analytics aggregation',
          query: async () => {
            const start = performance.now();
            await db.collection('analytics_events')
              .aggregate([
                { $match: { 
                  timestamp: { 
                    $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) 
                  }
                }},
                { $group: {
                  _id: { 
                    type: '$type',
                    hour: { $hour: '$timestamp' }
                  },
                  count: { $sum: 1 }
                }},
                { $sort: { '_id.hour': 1 } }
              ]).toArray();
            return performance.now() - start;
          },
          maxTime: 100
        }
      ];

      for (const { name, query, maxTime } of queries) {
        const times = [];
        for (let i = 0; i < 10; i++) {
          times.push(await query());
        }
        const avgTime = times.reduce((a, b) => a + b) / times.length;
        expect(avgTime).toBeLessThan(maxTime);
      }
    });

    test('Connection pool handles concurrent load', async () => {
      const concurrentQueries = 500;
      const queries = [];

      for (let i = 0; i < concurrentQueries; i++) {
        queries.push(
          db.collection('users').findOne({ _id: `user${i}` })
        );
      }

      const start = performance.now();
      await Promise.all(queries);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(5000); // All queries complete within 5 seconds
    });
  });

  describe('Media Processing Performance', () => {
    test('Image optimization meets targets', async () => {
      const testImages = [
        { size: 5 * 1024 * 1024, format: 'jpeg' }, // 5MB JPEG
        { size: 10 * 1024 * 1024, format: 'png' }, // 10MB PNG
        { size: 2 * 1024 * 1024, format: 'webp' } // 2MB WebP
      ];

      for (const image of testImages) {
        const start = performance.now();
        // Simulate image processing
        await processImage(image);
        const duration = performance.now() - start;

        expect(duration).toBeLessThan(1000); // Process within 1 second
      }
    });

    test('Audio transcoding maintains quality', async () => {
      const testAudio = {
        format: 'wav',
        duration: 300, // 5 minutes
        bitrate: 1411 // CD quality
      };

      const start = performance.now();
      const result = await transcodeAudio(testAudio, {
        format: 'mp3',
        bitrate: 320
      });
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(testAudio.duration * 100); // 10% of real-time
      expect(result.quality).toBeGreaterThan(0.95); // 95% quality retention
    });
  });

  describe('WebSocket Performance', () => {
    test('Handles 10,000 concurrent connections', async () => {
      const io = require('socket.io-client');
      const connections = [];
      const messageLatencies = [];

      // Create connections
      for (let i = 0; i < 10000; i++) {
        const socket = io(BASE_URL, {
          auth: { token: `user${i}-token` }
        });
        connections.push(socket);
      }

      // Wait for all connections
      await Promise.all(
        connections.map(socket => 
          new Promise(resolve => socket.on('connect', resolve))
        )
      );

      // Test message broadcast latency
      const testMessage = { type: 'test', timestamp: Date.now() };
      connections[0].emit('broadcast', testMessage);

      await new Promise(resolve => {
        let receivedCount = 0;
        connections.forEach((socket, i) => {
          if (i === 0) return; // Skip sender
          socket.on('broadcast', (msg) => {
            messageLatencies.push(Date.now() - msg.timestamp);
            receivedCount++;
            if (receivedCount === connections.length - 1) resolve();
          });
        });
      });

      const avgLatency = messageLatencies.reduce((a, b) => a + b) / messageLatencies.length;
      expect(avgLatency).toBeLessThan(100); // Average latency under 100ms

      // Cleanup
      connections.forEach(s => s.disconnect());
    });

    test('Listening party sync maintains real-time performance', async () => {
      const partySize = 100;
      const syncEvents = [];
      
      // Simulate listening party with sync events
      for (let i = 0; i < 60; i++) { // 1 minute of playback
        const start = performance.now();
        await broadcastSyncEvent({
          position: i,
          timestamp: Date.now()
        }, partySize);
        const latency = performance.now() - start;
        syncEvents.push(latency);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const avgSyncLatency = syncEvents.reduce((a, b) => a + b) / syncEvents.length;
      expect(avgSyncLatency).toBeLessThan(50); // Sync within 50ms
    });
  });

  describe('CDN Performance', () => {
    test('Global content delivery meets latency targets', async () => {
      const regions = [
        { name: 'US East', endpoint: 'us-east-1.cdn.fansake.com' },
        { name: 'EU West', endpoint: 'eu-west-1.cdn.fansake.com' },
        { name: 'Asia Pacific', endpoint: 'ap-southeast-1.cdn.fansake.com' }
      ];

      for (const region of regions) {
        const result = await autocannon({
          url: `https://${region.endpoint}/content/test-file.mp3`,
          connections: 50,
          duration: 10
        });

        expect(result.latency.p95).toBeLessThan(100); // 95th percentile under 100ms
        expect(result.throughput.average).toBeGreaterThan(50 * 1024 * 1024); // 50MB/s
      }
    });
  });

  describe('Memory and Resource Usage', () => {
    test('Memory usage remains stable under load', async () => {
      const initialMemory = process.memoryUsage();
      
      // Generate load
      await autocannon({
        url: `${BASE_URL}/api/discovery/feed`,
        connections: 200,
        duration: 60,
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`
        }
      });

      // Force garbage collection
      global.gc();
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;
      
      expect(memoryIncrease).toBeLessThan(100); // Less than 100MB increase
    });

    test('CPU usage scales linearly with load', async () => {
      const cpuMetrics = [];
      
      for (const connections of [10, 50, 100, 200]) {
        const startCpu = process.cpuUsage();
        
        await autocannon({
          url: `${BASE_URL}/api/content/feed`,
          connections,
          duration: 10,
          headers: {
            'Authorization': `Bearer ${AUTH_TOKEN}`
          }
        });
        
        const cpuUsage = process.cpuUsage(startCpu);
        cpuMetrics.push({
          connections,
          cpu: (cpuUsage.user + cpuUsage.system) / 1000000 // Convert to seconds
        });
      }

      // Verify linear scaling
      const scalingRatio = cpuMetrics[3].cpu / cpuMetrics[0].cpu;
      const connectionRatio = cpuMetrics[3].connections / cpuMetrics[0].connections;
      
      expect(scalingRatio).toBeLessThan(connectionRatio * 1.2); // Max 20% overhead
    });
  });
});