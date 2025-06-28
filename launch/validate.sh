#!/bin/bash

# MusicConnect Pre-Launch Validation Script
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================"
echo "MusicConnect Pre-Launch Validation"
echo "======================================"
echo ""

ERRORS=0
WARNINGS=0

# Function to check status
check() {
    local name=$1
    local command=$2
    local expected=$3
    
    echo -n "Checking $name... "
    
    if eval "$command"; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
        ERRORS=$((ERRORS + 1))
    fi
}

warn() {
    local name=$1
    local command=$2
    
    echo -n "Checking $name... "
    
    if eval "$command"; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}⚠${NC}"
        WARNINGS=$((WARNINGS + 1))
    fi
}

# Infrastructure Checks
echo "=== Infrastructure Checks ==="

# Kubernetes clusters
check "US-East-1 Cluster" "kubectl --context us-east-1 get nodes &>/dev/null"
check "US-West-2 Cluster" "kubectl --context us-west-2 get nodes &>/dev/null"
check "EU-West-1 Cluster" "kubectl --context eu-west-1 get nodes &>/dev/null"
check "AP-Southeast-1 Cluster" "kubectl --context ap-southeast-1 get nodes &>/dev/null"

# Database connectivity
check "Primary Database" "PGPASSWORD=\$DB_PASSWORD psql -h \$DB_HOST -U \$DB_USER -d musicconnect -c 'SELECT 1' &>/dev/null"
check "Read Replica US-West" "PGPASSWORD=\$DB_PASSWORD psql -h \$DB_REPLICA_US_WEST -U \$DB_USER -d musicconnect -c 'SELECT 1' &>/dev/null"

# Redis connectivity
check "Redis Cache" "redis-cli -h \$REDIS_HOST ping | grep -q PONG"

# CDN health
check "CDN Distribution" "curl -sI https://cdn.musicconnect.com/health | grep -q '200 OK'"

echo ""
echo "=== SSL Certificate Checks ==="

# Check SSL certificates
for domain in musicconnect.com api.musicconnect.com cdn.musicconnect.com; do
    expiry=$(echo | openssl s_client -servername $domain -connect $domain:443 2>/dev/null | openssl x509 -noout -dates 2>/dev/null | grep notAfter | cut -d= -f2)
    if [ ! -z "$expiry" ]; then
        expiry_epoch=$(date -d "$expiry" +%s)
        current_epoch=$(date +%s)
        days_left=$(( ($expiry_epoch - $current_epoch) / 86400 ))
        
        if [ $days_left -gt 30 ]; then
            echo -e "SSL cert for $domain: ${GREEN}✓${NC} (expires in $days_left days)"
        elif [ $days_left -gt 7 ]; then
            echo -e "SSL cert for $domain: ${YELLOW}⚠${NC} (expires in $days_left days)"
            WARNINGS=$((WARNINGS + 1))
        else
            echo -e "SSL cert for $domain: ${RED}✗${NC} (expires in $days_left days)"
            ERRORS=$((ERRORS + 1))
        fi
    else
        echo -e "SSL cert for $domain: ${RED}✗${NC} (could not check)"
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""
echo "=== Application Checks ==="

# Run tests
check "Unit Tests" "cd backend && npm test -- --passWithNoTests &>/dev/null"
check "Integration Tests" "cd backend && npm run test:integration -- --passWithNoTests &>/dev/null"
warn "E2E Tests" "cd backend && npm run test:e2e -- --passWithNoTests &>/dev/null"

# API health checks
check "API Health" "curl -sf https://api.musicconnect.com/health &>/dev/null"
check "WebSocket Health" "curl -sf https://ws.musicconnect.com/health &>/dev/null"

# Payment gateway
check "Stripe Webhook" "curl -sf -X POST https://api.musicconnect.com/api/webhooks/stripe -H 'stripe-signature: test' -d '{}' | grep -q 'Invalid signature' &>/dev/null"

echo ""
echo "=== Security Checks ==="

# Security headers
check "Security Headers" "curl -sI https://musicconnect.com | grep -q 'X-Frame-Options'"
check "HSTS Header" "curl -sI https://musicconnect.com | grep -q 'Strict-Transport-Security'"
check "CSP Header" "curl -sI https://musicconnect.com | grep -q 'Content-Security-Policy'"

# Rate limiting
warn "Rate Limiting" "for i in {1..20}; do curl -sf https://api.musicconnect.com/api/discovery &>/dev/null; done && [ \$? -eq 0 ]"

echo ""
echo "=== Monitoring Checks ==="

# Prometheus
check "Prometheus" "curl -sf https://prometheus.musicconnect.com/-/healthy &>/dev/null"
check "Grafana" "curl -sf https://grafana.musicconnect.com/api/health &>/dev/null"
check "AlertManager" "curl -sf https://alertmanager.musicconnect.com/-/healthy &>/dev/null"

# Metrics collection
check "Backend Metrics" "curl -sf https://api.musicconnect.com/metrics | grep -q 'http_requests_total'"
check "Database Metrics" "curl -sf http://localhost:9187/metrics | grep -q 'pg_up'"

echo ""
echo "=== Data Checks ==="

# Database migrations
check "Database Migrations" "cd backend && npx sequelize db:migrate:status | grep -q 'up' &>/dev/null"

# Backup verification
warn "Backup Recent" "aws s3 ls s3://musicconnect-backups/postgres/ --recursive | grep -q \"$(date +%Y-%m-%d)\""

# Cache status
check "Redis Memory" "redis-cli -h \$REDIS_HOST info memory | grep -q 'used_memory_human' &>/dev/null"

echo ""
echo "=== Performance Checks ==="

# Load test results
if [ -f "./performance-report-latest.json" ]; then
    p95_latency=$(jq '.scenarios[0].latency.p95' ./performance-report-latest.json)
    if (( $(echo "$p95_latency < 500" | bc -l) )); then
        echo -e "P95 Latency: ${GREEN}✓${NC} (${p95_latency}ms)"
    else
        echo -e "P95 Latency: ${YELLOW}⚠${NC} (${p95_latency}ms)"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo -e "Load Test Results: ${YELLOW}⚠${NC} (not found)"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo "======================================"
echo "Validation Summary"
echo "======================================"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}All checks passed!${NC}"
    echo "System is ready for launch! 🚀"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}Validation completed with $WARNINGS warnings${NC}"
    echo "Review warnings before proceeding with launch"
    exit 0
else
    echo -e "${RED}Validation failed with $ERRORS errors and $WARNINGS warnings${NC}"
    echo "Critical issues must be resolved before launch!"
    exit 1
fi