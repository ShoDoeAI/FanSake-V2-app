# MusicConnect Multi-Region Deployment Guide

## Overview

This guide covers the deployment of MusicConnect across multiple AWS regions with auto-scaling, high availability, and 99.99% uptime SLA.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CloudFront CDN                             │
│              (Global Edge Locations with Lambda@Edge)             │
└─────────────────┬───────────────────────┬─────────────────────────┘
                  │                       │
┌─────────────────▼───────┐     ┌────────▼────────────┐
│    US-EAST-1 (Primary)  │     │  US-WEST-2         │
│  ┌─────────────────┐    │     │  ┌──────────────┐  │
│  │   EKS Cluster   │    │     │  │ EKS Cluster  │  │
│  │  - Backend API  │    │     │  │ - Backend    │  │
│  │  - Frontend     │    │     │  │ - Frontend   │  │
│  │  - WebSocket    │    │     │  │ - WebSocket  │  │
│  └─────────────────┘    │     │  └──────────────┘  │
│  ┌─────────────────┐    │     │  ┌──────────────┐  │
│  │ Aurora Primary  │◄───┼─────┼──┤Aurora Reader │  │
│  └─────────────────┘    │     │  └──────────────┘  │
│  ┌─────────────────┐    │     │  ┌──────────────┐  │
│  │ ElastiCache     │    │     │  │ ElastiCache  │  │
│  └─────────────────┘    │     │  └──────────────┘  │
└─────────────────────────┘     └─────────────────────┘
                  │                       │
┌─────────────────▼───────┐     ┌────────▼────────────┐
│      EU-WEST-1          │     │  AP-SOUTHEAST-1     │
│  ┌─────────────────┐    │     │  ┌──────────────┐  │
│  │   EKS Cluster   │    │     │  │ EKS Cluster  │  │
│  └─────────────────┘    │     │  └──────────────┘  │
│  ┌─────────────────┐    │     │  ┌──────────────┐  │
│  │ Aurora Reader   │    │     │  │Aurora Reader │  │
│  └─────────────────┘    │     │  └──────────────┘  │
└─────────────────────────┘     └─────────────────────┘
```

## Prerequisites

1. **AWS Account Setup**
   - Multi-region enabled AWS account
   - IAM roles with appropriate permissions
   - Service quotas increased for production workloads

2. **Tools Required**
   - Terraform >= 1.5.0
   - kubectl >= 1.28
   - AWS CLI >= 2.0
   - Docker >= 24.0
   - Helm >= 3.12

3. **Domain Configuration**
   - Domain registered and transferred to Route53
   - SSL certificates requested in ACM (us-east-1 for CloudFront)

## Step-by-Step Deployment

### 1. Infrastructure Provisioning

```bash
# Clone the repository
git clone https://github.com/musicconnect/infrastructure.git
cd infrastructure

# Initialize Terraform
cd terraform
terraform init

# Create terraform.tfvars
cat > terraform.tfvars <<EOF
project_name = "musicconnect"
environment = "production"
domain_name = "musicconnect.com"
aws_regions = ["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"]
EOF

# Plan the deployment
terraform plan -out=tfplan

# Apply infrastructure
terraform apply tfplan
```

### 2. Database Setup

```bash
# Connect to primary database
export PRIMARY_ENDPOINT=$(terraform output -json rds_endpoints | jq -r '.writer')
psql -h $PRIMARY_ENDPOINT -U musicconnect -d musicconnect

# Run setup script
psql -f infrastructure/database/aurora-global-setup.sql

# Verify replication
SELECT * FROM monitoring.get_replication_lag();
```

### 3. Kubernetes Cluster Configuration

```bash
# Update kubeconfig for all regions
for region in us-east-1 us-west-2 eu-west-1 ap-southeast-1; do
  aws eks update-kubeconfig --name musicconnect-${region}-eks --region ${region} --alias musicconnect-${region}
done

# Install core components in each cluster
for context in musicconnect-us-east-1 musicconnect-us-west-2 musicconnect-eu-west-1 musicconnect-ap-southeast-1; do
  kubectl --context=${context} apply -f infrastructure/kubernetes/namespace.yaml
  
  # Install NGINX Ingress Controller
  helm --kube-context=${context} upgrade --install ingress-nginx ingress-nginx \
    --repo https://kubernetes.github.io/ingress-nginx \
    --namespace ingress-nginx --create-namespace \
    --set controller.service.type=LoadBalancer \
    --set controller.metrics.enabled=true
  
  # Install cert-manager
  helm --kube-context=${context} upgrade --install cert-manager cert-manager \
    --repo https://charts.jetstack.io \
    --namespace cert-manager --create-namespace \
    --set installCRDs=true
done
```

### 4. Application Deployment

```bash
# Build and push Docker images
export ECR_REGISTRY=$(aws sts get-caller-identity --query Account --output text).dkr.ecr.us-east-1.amazonaws.com

# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ECR_REGISTRY

# Build images
docker build -f infrastructure/docker/Dockerfile.backend -t $ECR_REGISTRY/musicconnect-backend:latest .
docker build -f infrastructure/docker/Dockerfile.frontend -t $ECR_REGISTRY/musicconnect-frontend:latest .
docker build -f infrastructure/docker/Dockerfile.websocket -t $ECR_REGISTRY/musicconnect-websocket:latest .

# Push images
docker push $ECR_REGISTRY/musicconnect-backend:latest
docker push $ECR_REGISTRY/musicconnect-frontend:latest
docker push $ECR_REGISTRY/musicconnect-websocket:latest

# Deploy to each region
for region in us-east-1 us-west-2 eu-west-1 ap-southeast-1; do
  kubectl --context=musicconnect-${region} apply -k infrastructure/kubernetes/overlays/${region}
done
```

### 5. Monitoring Stack Deployment

```bash
# Deploy Prometheus + Thanos
helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace musicconnect-monitoring --create-namespace \
  -f infrastructure/monitoring/prometheus-values.yaml

# Deploy Thanos for multi-region federation
helm upgrade --install thanos bitnami/thanos \
  --namespace musicconnect-monitoring \
  -f infrastructure/monitoring/thanos-values.yaml

# Deploy Loki for log aggregation
helm upgrade --install loki grafana/loki-stack \
  --namespace musicconnect-monitoring \
  -f infrastructure/monitoring/loki-values.yaml

# Deploy Tempo for distributed tracing
helm upgrade --install tempo grafana/tempo \
  --namespace musicconnect-monitoring \
  -f infrastructure/monitoring/tempo-values.yaml
```

### 6. CDN Configuration

```bash
# Update CloudFront distribution
aws cloudfront create-invalidation \
  --distribution-id $(terraform output -raw cloudfront_distribution_id) \
  --paths "/*"

# Deploy Lambda@Edge functions
cd infrastructure/terraform/modules/cloudfront/lambda
zip -r origin-request.zip origin-request.js
zip -r viewer-response.zip viewer-response.js
```

### 7. CI/CD Pipeline Setup

```bash
# Configure GitHub Actions secrets
gh secret set AWS_ACCESS_KEY_ID --body "$AWS_ACCESS_KEY_ID"
gh secret set AWS_SECRET_ACCESS_KEY --body "$AWS_SECRET_ACCESS_KEY"
gh secret set SLACK_WEBHOOK_URL --body "$SLACK_WEBHOOK_URL"
gh secret set STRIPE_SECRET_KEY --body "$STRIPE_SECRET_KEY"

# Setup ArgoCD for GitOps
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl apply -f infrastructure/ci-cd/argocd/application.yaml
```

## Operational Procedures

### Health Checks

```bash
# Check cluster health
for region in us-east-1 us-west-2 eu-west-1 ap-southeast-1; do
  echo "Checking $region..."
  kubectl --context=musicconnect-${region} get nodes
  kubectl --context=musicconnect-${region} get pods -n musicconnect
done

# Check database replication lag
psql -h $PRIMARY_ENDPOINT -U musicconnect -d musicconnect \
  -c "SELECT * FROM monitoring.get_replication_lag();"

# Check CDN health
curl -I https://musicconnect.com/health
```

### Scaling Operations

```bash
# Scale horizontally
kubectl --context=musicconnect-us-east-1 scale deployment musicconnect-backend --replicas=10 -n musicconnect

# Update HPA limits
kubectl --context=musicconnect-us-east-1 patch hpa musicconnect-backend-hpa -n musicconnect \
  --patch '{"spec":{"maxReplicas":100}}'
```

### Failover Procedures

```bash
# Manual database failover
./infrastructure/database/failover-automation.sh "Manual failover initiated"

# Region evacuation
kubectl --context=musicconnect-us-east-1 cordon --all
kubectl --context=musicconnect-us-east-1 drain --all --ignore-daemonsets
```

### Monitoring Access

- **Grafana**: https://grafana.musicconnect.com
  - Username: admin
  - Password: (retrieve from secrets)

- **Prometheus**: https://prometheus.musicconnect.com

- **Thanos Query**: https://thanos.musicconnect.com

## Security Considerations

1. **Network Security**
   - All traffic encrypted with TLS 1.2+
   - WAF rules applied at CloudFront
   - Network policies enforced in Kubernetes

2. **Access Control**
   - RBAC configured for Kubernetes
   - IAM roles for service accounts
   - Secrets managed via AWS Secrets Manager

3. **Compliance**
   - GDPR compliant data handling
   - SOC2 audit logging enabled
   - PCI DSS for payment processing

## Cost Optimization

1. **Spot Instances**
   - 50% of compute on spot instances
   - Automated failover for spot terminations

2. **Reserved Instances**
   - 3-year RIs for baseline capacity
   - Savings Plans for consistent usage

3. **Data Transfer**
   - CloudFront for egress optimization
   - VPC endpoints for AWS services

## Disaster Recovery

1. **RTO/RPO Targets**
   - RTO: 15 minutes
   - RPO: 5 minutes

2. **Backup Strategy**
   - Automated Aurora snapshots every hour
   - Cross-region snapshot replication
   - S3 versioning for all media

3. **Runbooks**
   - Detailed runbooks in `infrastructure/runbooks/`
   - Automated testing of DR procedures

## Support Contacts

- **On-Call**: pagerduty-musicconnect@company.com
- **Slack**: #musicconnect-ops
- **Escalation**: CTO / VP Engineering

## Appendix

### Environment Variables

```bash
# Backend
NODE_ENV=production
PORT=8080
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=...
STRIPE_SECRET_KEY=...

# Frontend
REACT_APP_API_URL=https://api.musicconnect.com
REACT_APP_STRIPE_PUBLIC_KEY=pk_live_...
REACT_APP_CLOUDFRONT_URL=https://cdn.musicconnect.com
```

### Useful Commands

```bash
# View logs across regions
for region in us-east-1 us-west-2 eu-west-1 ap-southeast-1; do
  kubectl --context=musicconnect-${region} logs -n musicconnect -l app=musicconnect-backend --tail=100
done

# Database connections
psql -h $PRIMARY_ENDPOINT -U musicconnect -d musicconnect -c "\
  SELECT datname, usename, application_name, client_addr, state \
  FROM pg_stat_activity WHERE datname = 'musicconnect';"

# Cache statistics
redis-cli -h cache.musicconnect.com INFO stats
```

### Troubleshooting

See `TROUBLESHOOTING.md` for common issues and solutions.