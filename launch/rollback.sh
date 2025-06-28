#!/bin/bash

# MusicConnect Emergency Rollback Script
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${RED}======================================"
echo "MusicConnect EMERGENCY ROLLBACK"
echo "======================================${NC}"
echo ""

# Get rollback confirmation
read -p "Are you sure you want to rollback? This will revert to the previous version. (yes/no): " confirmation
if [ "$confirmation" != "yes" ]; then
    echo "Rollback cancelled."
    exit 0
fi

# Get rollback reason
read -p "Enter rollback reason: " ROLLBACK_REASON
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

echo ""
echo "Starting rollback at $TIMESTAMP"
echo "Reason: $ROLLBACK_REASON"
echo ""

# Step 1: Enable maintenance mode
echo "1. Enabling maintenance mode..."
kubectl set env deployment/frontend-deployment MAINTENANCE_MODE=true --all

# Create maintenance page
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: maintenance-page
  namespace: default
data:
  index.html: |
    <!DOCTYPE html>
    <html>
    <head>
        <title>MusicConnect - Maintenance</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            h1 { color: #333; }
            p { color: #666; }
        </style>
    </head>
    <body>
        <h1>We'll be right back!</h1>
        <p>MusicConnect is undergoing maintenance. We apologize for the inconvenience.</p>
        <p>Expected completion: 30 minutes</p>
    </body>
    </html>
EOF

# Step 2: Scale down current deployment
echo "2. Scaling down current deployment..."
kubectl scale deployment backend-deployment --replicas=0
kubectl scale deployment websocket-deployment --replicas=0

# Step 3: Rollback to previous version
echo "3. Rolling back to previous version..."
kubectl rollout undo deployment/backend-deployment
kubectl rollout undo deployment/frontend-deployment
kubectl rollout undo deployment/websocket-deployment

# Wait for rollback
echo "4. Waiting for rollback to complete..."
kubectl rollout status deployment/backend-deployment
kubectl rollout status deployment/frontend-deployment
kubectl rollout status deployment/websocket-deployment

# Step 4: Database rollback (if needed)
echo "5. Checking if database rollback is needed..."
read -p "Do you need to rollback the database? (yes/no): " db_rollback
if [ "$db_rollback" == "yes" ]; then
    echo "Initiating database rollback..."
    
    # Stop write traffic
    kubectl scale deployment backend-deployment --replicas=0
    
    # Get latest backup
    LATEST_BACKUP=$(aws s3 ls s3://musicconnect-backups/postgres/ --recursive | sort | tail -n 1 | awk '{print $4}')
    echo "Latest backup: $LATEST_BACKUP"
    
    # Restore database
    echo "Restoring database from backup..."
    aws s3 cp s3://musicconnect-backups/$LATEST_BACKUP /tmp/backup.sql.gz
    gunzip /tmp/backup.sql.gz
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d musicconnect_restore < /tmp/backup.sql
    
    # Switch to restored database
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d postgres -c "ALTER DATABASE musicconnect RENAME TO musicconnect_old;"
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d postgres -c "ALTER DATABASE musicconnect_restore RENAME TO musicconnect;"
    
    echo "Database rollback completed"
fi

# Step 5: Clear caches
echo "6. Clearing caches..."
redis-cli -h $REDIS_HOST FLUSHALL

# Clear CDN cache
aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_DISTRIBUTION_ID --paths "/*"

# Step 6: Scale up rolled-back version
echo "7. Scaling up rolled-back version..."
kubectl scale deployment backend-deployment --replicas=3
kubectl scale deployment frontend-deployment --replicas=3
kubectl scale deployment websocket-deployment --replicas=2

# Step 7: Run health checks
echo "8. Running health checks..."
sleep 30  # Wait for services to start

for i in {1..10}; do
    if curl -sf https://api.musicconnect.com/health &>/dev/null; then
        echo -e "${GREEN}API health check passed${NC}"
        break
    else
        echo "Waiting for API to be healthy... ($i/10)"
        sleep 10
    fi
done

# Step 8: Disable maintenance mode
echo "9. Disabling maintenance mode..."
kubectl set env deployment/frontend-deployment MAINTENANCE_MODE=false --all

# Step 9: Verify system stability
echo "10. Verifying system stability..."
echo "Checking error rates..."
ERROR_RATE=$(curl -s http://prometheus.musicconnect.com/api/v1/query?query=rate\(http_requests_total\{status=~\"5..\"\}\[5m\]\) | jq -r '.data.result[0].value[1]' || echo "0")

if (( $(echo "$ERROR_RATE < 0.01" | bc -l) )); then
    echo -e "${GREEN}Error rate is acceptable: $ERROR_RATE${NC}"
else
    echo -e "${YELLOW}Warning: High error rate detected: $ERROR_RATE${NC}"
fi

# Step 10: Send notifications
echo "11. Sending notifications..."

# Slack notification
curl -X POST $SLACK_WEBHOOK_URL \
  -H 'Content-Type: application/json' \
  -d @- <<EOF
{
  "text": "🚨 MusicConnect Rollback Completed",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Rollback completed at $TIMESTAMP*\n*Reason:* $ROLLBACK_REASON\n*Status:* System is operational on previous version"
      }
    }
  ]
}
EOF

# Log rollback event
echo "$TIMESTAMP - Rollback executed. Reason: $ROLLBACK_REASON" >> /var/log/musicconnect/rollbacks.log

# Create incident report template
cat > /tmp/incident-report-$(date +%Y%m%d-%H%M%S).md <<EOF
# Incident Report - MusicConnect Rollback

**Date:** $TIMESTAMP
**Severity:** High
**Duration:** TBD
**Impact:** Service disruption during rollback

## Summary
Emergency rollback was executed due to: $ROLLBACK_REASON

## Timeline
- $TIMESTAMP: Rollback initiated
- TBD: Issue detected
- TBD: Decision to rollback
- TBD: Service restored

## Root Cause
[To be investigated]

## Impact
- Number of users affected: TBD
- Revenue impact: TBD
- Data loss: None expected

## Action Items
- [ ] Investigate root cause
- [ ] Fix issues in current version
- [ ] Plan re-deployment
- [ ] Update monitoring to catch issue earlier

## Lessons Learned
[To be completed after investigation]
EOF

echo ""
echo -e "${GREEN}======================================"
echo "Rollback Completed Successfully!"
echo "======================================${NC}"
echo ""
echo "Next steps:"
echo "1. Monitor system stability"
echo "2. Investigate root cause of issues"
echo "3. Complete incident report at: /tmp/incident-report-*.md"
echo "4. Plan corrective actions"
echo ""
echo "System is now running on the previous stable version."