# MusicConnect Troubleshooting Guide

## Common Issues and Solutions

### Authentication Issues

#### "Invalid token" error
**Symptoms**: API returns 401 Unauthorized

**Solutions**:
1. Check token expiration:
   ```javascript
   const payload = JSON.parse(atob(token.split('.')[1]));
   console.log(new Date(payload.exp * 1000));
   ```
2. Refresh token:
   ```bash
   curl -X POST https://api.musicconnect.com/api/auth/refresh \
     -H "Content-Type: application/json" \
     -d '{"refreshToken": "YOUR_REFRESH_TOKEN"}'
   ```
3. Clear browser cache and re-login

#### Account locked
**Symptoms**: "Account locked" message

**Solutions**:
1. Wait 30 minutes (auto-unlock)
2. Reset password via email
3. Contact support for immediate unlock

### Payment Issues

#### Payment declined
**Symptoms**: Subscription creation fails

**Solutions**:
1. Verify card details
2. Check with bank for:
   - International transaction blocks
   - Insufficient funds
   - Expired card
3. Try alternative payment method
4. Check Stripe logs:
   ```bash
   stripe logs tail --filter-request-path="/v1/payment_intents"
   ```

#### Subscription not active
**Symptoms**: Can't access subscribed content

**Solutions**:
1. Check subscription status:
   ```bash
   curl https://api.musicconnect.com/api/subscriptions/active \
     -H "Authorization: Bearer TOKEN"
   ```
2. Verify payment processed
3. Force sync:
   ```sql
   UPDATE subscriptions 
   SET status = 'active' 
   WHERE stripe_subscription_id = 'sub_xxx' 
   AND status = 'pending';
   ```

### Content Issues

#### Upload failures
**Symptoms**: "Upload failed" error

**Solutions**:
1. Check file size (max: 500MB audio, 2GB video)
2. Verify file format
3. Check S3 bucket permissions:
   ```bash
   aws s3 ls s3://musicconnect-content/
   ```
4. Monitor upload progress:
   ```javascript
   const upload = new Upload({
     client: s3Client,
     params: uploadParams,
     onProgress: (progress) => {
       console.log(progress.loaded / progress.total);
     }
   });
   ```

#### Playback issues
**Symptoms**: Audio/video won't play

**Solutions**:
1. Check CDN status:
   ```bash
   curl -I https://cdn.musicconnect.com/health
   ```
2. Verify content URL:
   ```bash
   curl -I "CONTENT_URL"
   ```
3. Clear CloudFront cache:
   ```bash
   aws cloudfront create-invalidation \
     --distribution-id E1234567890ABC \
     --paths "/content/*"
   ```
4. Check CORS headers

### Performance Issues

#### Slow page loads
**Symptoms**: Pages take >3 seconds to load

**Solutions**:
1. Check server response time:
   ```bash
   curl -w "@curl-format.txt" -o /dev/null -s https://api.musicconnect.com/health
   ```
2. Analyze bundle size:
   ```bash
   npm run build -- --analyze
   ```
3. Enable compression:
   ```nginx
   gzip on;
   gzip_types text/plain application/json application/javascript;
   ```
4. Check database queries:
   ```sql
   SELECT query, mean_time, calls 
   FROM pg_stat_statements 
   WHERE mean_time > 100 
   ORDER BY mean_time DESC;
   ```

#### High memory usage
**Symptoms**: Server crashes, OOM errors

**Solutions**:
1. Check memory leaks:
   ```bash
   node --inspect server.js
   # Use Chrome DevTools Memory Profiler
   ```
2. Increase heap size:
   ```bash
   node --max-old-space-size=4096 server.js
   ```
3. Implement pagination:
   ```javascript
   const results = await Content.find()
     .limit(20)
     .skip(page * 20);
   ```

### Database Issues

#### Connection pool exhausted
**Symptoms**: "Too many connections" error

**Solutions**:
1. Check active connections:
   ```sql
   SELECT count(*) FROM pg_stat_activity;
   ```
2. Kill idle connections:
   ```sql
   SELECT pg_terminate_backend(pid) 
   FROM pg_stat_activity 
   WHERE state = 'idle' 
   AND state_change < current_timestamp - interval '10 minutes';
   ```
3. Increase pool size:
   ```javascript
   const pool = new Pool({
     max: 50, // Increase from default 10
     idleTimeoutMillis: 30000
   });
   ```

#### Slow queries
**Symptoms**: API timeouts

**Solutions**:
1. Add indexes:
   ```sql
   CREATE INDEX idx_content_artist_created 
   ON content(artist_id, created_at DESC);
   ```
2. Analyze query plan:
   ```sql
   EXPLAIN ANALYZE SELECT * FROM your_query;
   ```
3. Enable query optimization:
   ```javascript
   const content = await Content.find({ artistId })
     .select('title thumbnailUrl createdAt')
     .lean()
     .limit(20);
   ```

### Real-time Issues

#### WebSocket disconnections
**Symptoms**: Messages not received in real-time

**Solutions**:
1. Check WebSocket health:
   ```javascript
   ws.on('error', (error) => {
     console.error('WebSocket error:', error);
     reconnect();
   });
   ```
2. Implement reconnection:
   ```javascript
   function reconnect() {
     setTimeout(() => {
       ws = new WebSocket(wsUrl);
       setupEventHandlers();
     }, 5000);
   }
   ```
3. Monitor connections:
   ```bash
   netstat -an | grep :5001 | wc -l
   ```

#### Notification delays
**Symptoms**: Push notifications arrive late

**Solutions**:
1. Check queue depth:
   ```bash
   aws sqs get-queue-attributes \
     --queue-url QUEUE_URL \
     --attribute-names ApproximateNumberOfMessages
   ```
2. Scale workers:
   ```bash
   kubectl scale deployment notification-worker --replicas=5
   ```
3. Optimize processing:
   ```javascript
   await Promise.all(
     notifications.map(n => sendNotification(n))
   );
   ```

### Security Issues

#### CORS errors
**Symptoms**: "CORS policy" browser errors

**Solutions**:
1. Update CORS configuration:
   ```javascript
   app.use(cors({
     origin: [
       'https://musicconnect.com',
       'https://www.musicconnect.com'
     ],
     credentials: true
   }));
   ```
2. Check preflight requests:
   ```bash
   curl -X OPTIONS https://api.musicconnect.com/api/content \
     -H "Origin: https://musicconnect.com" \
     -H "Access-Control-Request-Method: GET"
   ```

#### Rate limiting
**Symptoms**: 429 Too Many Requests

**Solutions**:
1. Check rate limit headers:
   ```
   X-RateLimit-Limit: 1000
   X-RateLimit-Remaining: 0
   X-RateLimit-Reset: 1635360000
   ```
2. Implement exponential backoff:
   ```javascript
   async function retryWithBackoff(fn, retries = 3) {
     for (let i = 0; i < retries; i++) {
       try {
         return await fn();
       } catch (error) {
         if (error.status === 429 && i < retries - 1) {
           await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
         } else {
           throw error;
         }
       }
     }
   }
   ```

## Debugging Tools

### Log Analysis

**Application logs**:
```bash
# Recent errors
kubectl logs -l app=backend --since=1h | grep ERROR

# Specific request trace
kubectl logs -l app=backend | grep "request-id: abc123"
```

**Database logs**:
```sql
-- Slow query log
SELECT * FROM postgres_log 
WHERE duration > 1000 
ORDER BY timestamp DESC 
LIMIT 10;
```

### Monitoring Queries

**Prometheus queries**:
```promql
# Error rate by endpoint
sum(rate(http_requests_total{status=~"5.."}[5m])) by (path)

# P95 latency
histogram_quantile(0.95, 
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
)

# Memory usage
process_resident_memory_bytes / 1024 / 1024
```

### Health Checks

**System health script**:
```bash
#!/bin/bash
# health-check.sh

echo "Checking API health..."
curl -f https://api.musicconnect.com/health || exit 1

echo "Checking database..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d musicconnect -c "SELECT 1" || exit 1

echo "Checking Redis..."
redis-cli -h $REDIS_HOST ping || exit 1

echo "Checking S3..."
aws s3 ls s3://musicconnect-content/ || exit 1

echo "All systems operational!"
```

## Emergency Procedures

### Service Outage

1. **Immediate Response**:
   ```bash
   # Check service status
   kubectl get pods -l app=backend
   kubectl describe pod <failing-pod>
   
   # Quick restart
   kubectl rollout restart deployment/backend-deployment
   ```

2. **Failover to backup region**:
   ```bash
   # Update Route53 weights
   aws route53 change-resource-record-sets \
     --hosted-zone-id Z123456 \
     --change-batch file://failover.json
   ```

### Data Recovery

1. **Recent backup restore**:
   ```bash
   # List backups
   aws s3 ls s3://musicconnect-backups/postgres/
   
   # Restore
   pg_restore -h $DB_HOST -U $DB_USER -d musicconnect_restore backup.dump
   ```

2. **Point-in-time recovery**:
   ```sql
   -- Restore to specific timestamp
   SELECT pg_create_restore_point('before_incident');
   ```

## Contact Support

**For unresolved issues**:
- Email: support@musicconnect.com
- Slack: #help-engineering
- On-call: PagerDuty escalation

**Include in support request**:
- User ID or email
- Timestamp of issue
- Error messages
- Steps to reproduce
- Browser/device info