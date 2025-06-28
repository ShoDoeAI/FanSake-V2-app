#!/bin/bash

# MusicConnect Database Failover Automation Script
# This script handles automated failover between regions

set -euo pipefail

# Configuration
PRIMARY_REGION="us-east-1"
SECONDARY_REGIONS=("us-west-2" "eu-west-1" "ap-southeast-1")
CLUSTER_IDENTIFIER="musicconnect-global-cluster"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
PAGERDUTY_TOKEN="${PAGERDUTY_TOKEN:-}"

# Logging functions
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a /var/log/musicconnect-failover.log
}

error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" | tee -a /var/log/musicconnect-failover.log >&2
}

# Notification functions
send_slack_notification() {
    local message=$1
    if [[ -n "${SLACK_WEBHOOK_URL}" ]]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"Database Failover Alert: ${message}\"}" \
            "${SLACK_WEBHOOK_URL}" || true
    fi
}

send_pagerduty_alert() {
    local severity=$1
    local summary=$2
    local details=$3
    
    if [[ -n "${PAGERDUTY_TOKEN}" ]]; then
        curl -X POST https://events.pagerduty.com/v2/enqueue \
            -H 'Content-Type: application/json' \
            -H "Authorization: Token token=${PAGERDUTY_TOKEN}" \
            -d "{
                \"routing_key\": \"${PAGERDUTY_TOKEN}\",
                \"event_action\": \"trigger\",
                \"payload\": {
                    \"summary\": \"${summary}\",
                    \"severity\": \"${severity}\",
                    \"source\": \"musicconnect-database\",
                    \"custom_details\": {
                        \"details\": \"${details}\"
                    }
                }
            }" || true
    fi
}

# Check database health
check_database_health() {
    local region=$1
    local endpoint=$2
    
    log "Checking health of database in ${region}..."
    
    # Try to connect and run a simple query
    if PGPASSWORD="${DB_PASSWORD}" psql \
        -h "${endpoint}" \
        -U "${DB_USER}" \
        -d musicconnect \
        -c "SELECT 1" \
        -t \
        -A \
        --connect-timeout=5 > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Get cluster information
get_cluster_info() {
    local region=$1
    aws rds describe-db-clusters \
        --region "${region}" \
        --db-cluster-identifier "${CLUSTER_IDENTIFIER}-${region}" \
        --query 'DBClusters[0]' \
        --output json
}

# Check replication lag
check_replication_lag() {
    local region=$1
    local endpoint=$2
    
    local lag_seconds=$(PGPASSWORD="${DB_PASSWORD}" psql \
        -h "${endpoint}" \
        -U "${DB_USER}" \
        -d musicconnect \
        -c "SELECT EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp()))::INT" \
        -t \
        -A 2>/dev/null || echo "999999")
    
    echo "${lag_seconds}"
}

# Promote secondary to primary
promote_secondary() {
    local target_region=$1
    
    log "Promoting ${target_region} to primary..."
    
    # Remove target region from global cluster
    aws rds remove-from-global-cluster \
        --region "${target_region}" \
        --global-cluster-identifier "${CLUSTER_IDENTIFIER}" \
        --db-cluster-identifier "${CLUSTER_IDENTIFIER}-${target_region}" || true
    
    # Wait for removal to complete
    sleep 30
    
    # Create new global cluster with target region as primary
    aws rds create-global-cluster \
        --region "${target_region}" \
        --global-cluster-identifier "${CLUSTER_IDENTIFIER}-new" \
        --source-db-cluster-identifier "${CLUSTER_IDENTIFIER}-${target_region}"
    
    log "Promotion complete. New primary is in ${target_region}"
}

# Update application configuration
update_application_config() {
    local new_primary_region=$1
    local new_primary_endpoint=$2
    
    log "Updating application configuration..."
    
    # Update Kubernetes ConfigMap
    kubectl patch configmap database-config -n musicconnect \
        --type merge \
        -p "{\"data\":{\"PRIMARY_REGION\":\"${new_primary_region}\",\"PRIMARY_ENDPOINT\":\"${new_primary_endpoint}\"}}"
    
    # Restart deployments to pick up new configuration
    kubectl rollout restart deployment -n musicconnect
    
    # Update Route53 records
    update_route53_records "${new_primary_region}" "${new_primary_endpoint}"
}

# Update Route53 DNS records
update_route53_records() {
    local region=$1
    local endpoint=$2
    
    log "Updating Route53 records..."
    
    aws route53 change-resource-record-sets \
        --hosted-zone-id "${HOSTED_ZONE_ID}" \
        --change-batch "{
            \"Changes\": [{
                \"Action\": \"UPSERT\",
                \"ResourceRecordSet\": {
                    \"Name\": \"db-primary.musicconnect.com\",
                    \"Type\": \"CNAME\",
                    \"TTL\": 60,
                    \"ResourceRecords\": [{
                        \"Value\": \"${endpoint}\"
                    }]
                }
            }]
        }"
}

# Validate failover
validate_failover() {
    local region=$1
    local endpoint=$2
    
    log "Validating failover to ${region}..."
    
    # Check if we can write to the new primary
    if PGPASSWORD="${DB_PASSWORD}" psql \
        -h "${endpoint}" \
        -U "${DB_USER}" \
        -d musicconnect \
        -c "INSERT INTO failover_validation (validated_at, region) VALUES (NOW(), '${region}')" \
        > /dev/null 2>&1; then
        log "Failover validation successful"
        return 0
    else
        error "Failover validation failed"
        return 1
    fi
}

# Main failover function
perform_failover() {
    local reason=$1
    
    log "Starting failover process. Reason: ${reason}"
    send_slack_notification "Database failover initiated. Reason: ${reason}"
    send_pagerduty_alert "warning" "Database Failover Started" "${reason}"
    
    # Check health of all regions
    local healthy_regions=()
    for region in "${SECONDARY_REGIONS[@]}"; do
        local cluster_info=$(get_cluster_info "${region}")
        local endpoint=$(echo "${cluster_info}" | jq -r '.Endpoint')
        
        if check_database_health "${region}" "${endpoint}"; then
            local lag=$(check_replication_lag "${region}" "${endpoint}")
            if [[ ${lag} -lt 300 ]]; then  # Less than 5 minutes lag
                healthy_regions+=("${region}:${endpoint}:${lag}")
            else
                log "Region ${region} has high replication lag: ${lag} seconds"
            fi
        else
            log "Region ${region} is unhealthy"
        fi
    done
    
    # Select the best healthy region (lowest lag)
    if [[ ${#healthy_regions[@]} -eq 0 ]]; then
        error "No healthy secondary regions available for failover"
        send_pagerduty_alert "critical" "Failover Failed" "No healthy secondary regions available"
        return 1
    fi
    
    # Sort by lag and pick the best
    local best_region=$(printf '%s\n' "${healthy_regions[@]}" | sort -t: -k3 -n | head -1)
    local target_region=$(echo "${best_region}" | cut -d: -f1)
    local target_endpoint=$(echo "${best_region}" | cut -d: -f2)
    
    log "Selected ${target_region} as new primary (lag: $(echo "${best_region}" | cut -d: -f3)s)"
    
    # Perform the failover
    promote_secondary "${target_region}"
    
    # Update application configuration
    update_application_config "${target_region}" "${target_endpoint}"
    
    # Validate the failover
    if validate_failover "${target_region}" "${target_endpoint}"; then
        log "Failover completed successfully"
        send_slack_notification "Database failover completed. New primary: ${target_region}"
        send_pagerduty_alert "info" "Failover Completed" "New primary region: ${target_region}"
    else
        error "Failover validation failed"
        send_pagerduty_alert "critical" "Failover Validation Failed" "Manual intervention required"
        return 1
    fi
}

# Health check loop
health_check_loop() {
    local failure_count=0
    local max_failures=3
    
    while true; do
        local primary_cluster=$(get_cluster_info "${PRIMARY_REGION}")
        local primary_endpoint=$(echo "${primary_cluster}" | jq -r '.Endpoint')
        
        if check_database_health "${PRIMARY_REGION}" "${primary_endpoint}"; then
            failure_count=0
        else
            ((failure_count++))
            log "Primary database health check failed (${failure_count}/${max_failures})"
            
            if [[ ${failure_count} -ge ${max_failures} ]]; then
                perform_failover "Primary database health check failed ${max_failures} times"
                failure_count=0
                # Update PRIMARY_REGION for next iteration
                PRIMARY_REGION="${target_region}"
            fi
        fi
        
        sleep 30
    done
}

# Main execution
main() {
    log "Starting MusicConnect database failover automation"
    
    # Validate environment
    for cmd in aws psql jq kubectl curl; do
        if ! command -v ${cmd} &> /dev/null; then
            error "${cmd} is required but not installed"
            exit 1
        fi
    done
    
    # Check required environment variables
    : "${DB_USER:?DB_USER environment variable is required}"
    : "${DB_PASSWORD:?DB_PASSWORD environment variable is required}"
    : "${HOSTED_ZONE_ID:?HOSTED_ZONE_ID environment variable is required}"
    
    # Start health check loop
    health_check_loop
}

# Handle script termination
trap 'log "Failover automation stopped"; exit 0' SIGINT SIGTERM

# Run main function
main "$@"