#!/bin/bash

# Setup monitoring stack for MusicConnect
set -e

echo "Setting up MusicConnect monitoring stack..."

# Create namespaces
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

# Add Helm repositories
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo add elastic https://helm.elastic.co
helm repo update

# Install Prometheus Operator
echo "Installing Prometheus Operator..."
helm upgrade --install prometheus-operator prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --set prometheus.prometheusSpec.retention=30d \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.storageClassName=gp3 \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.resources.requests.storage=100Gi \
  --set grafana.persistence.enabled=true \
  --set grafana.persistence.size=10Gi \
  --set grafana.adminPassword="${GRAFANA_ADMIN_PASSWORD:-admin}" \
  --wait

# Install Loki for log aggregation
echo "Installing Loki..."
helm upgrade --install loki grafana/loki-stack \
  --namespace monitoring \
  --set loki.persistence.enabled=true \
  --set loki.persistence.size=50Gi \
  --set promtail.enabled=true \
  --wait

# Install Tempo for distributed tracing
echo "Installing Tempo..."
helm upgrade --install tempo grafana/tempo \
  --namespace monitoring \
  --values monitoring/tempo-values.yaml \
  --wait

# Install Thanos for long-term metrics storage
echo "Installing Thanos..."
helm upgrade --install thanos prometheus-community/thanos \
  --namespace monitoring \
  --values monitoring/thanos-values.yaml \
  --wait

# Install custom exporters
echo "Installing custom exporters..."

# PostgreSQL exporter
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres-exporter
  namespace: monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres-exporter
  template:
    metadata:
      labels:
        app: postgres-exporter
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9187"
    spec:
      containers:
      - name: postgres-exporter
        image: prometheuscommunity/postgres-exporter:latest
        env:
        - name: DATA_SOURCE_NAME
          valueFrom:
            secretKeyRef:
              name: postgres-credentials
              key: connection-string
        ports:
        - containerPort: 9187
EOF

# Redis exporter
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis-exporter
  namespace: monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis-exporter
  template:
    metadata:
      labels:
        app: redis-exporter
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9121"
    spec:
      containers:
      - name: redis-exporter
        image: oliver006/redis_exporter:latest
        env:
        - name: REDIS_ADDR
          value: "redis-service:6379"
        ports:
        - containerPort: 9121
EOF

# Blackbox exporter for endpoint monitoring
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: blackbox-config
  namespace: monitoring
data:
  blackbox.yml: |
    modules:
      http_2xx:
        prober: http
        timeout: 5s
        http:
          preferred_ip_protocol: "ip4"
          valid_status_codes: [200, 201, 202, 204]
      https_post_2xx:
        prober: http
        timeout: 5s
        http:
          method: POST
          preferred_ip_protocol: "ip4"
          valid_status_codes: [200, 201, 202, 204]
      tcp_connect:
        prober: tcp
        timeout: 5s
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: blackbox-exporter
  namespace: monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: blackbox-exporter
  template:
    metadata:
      labels:
        app: blackbox-exporter
    spec:
      containers:
      - name: blackbox-exporter
        image: prom/blackbox-exporter:latest
        args:
        - --config.file=/config/blackbox.yml
        ports:
        - containerPort: 9115
        volumeMounts:
        - name: config
          mountPath: /config
      volumes:
      - name: config
        configMap:
          name: blackbox-config
EOF

# Apply Prometheus configuration
kubectl apply -f monitoring/prometheus/prometheus.yml

# Apply alert rules
kubectl apply -f monitoring/prometheus/rules/

# Apply Grafana dashboards
echo "Importing Grafana dashboards..."
kubectl create configmap grafana-dashboards \
  --from-file=monitoring/grafana/dashboards/ \
  --namespace monitoring \
  --dry-run=client -o yaml | kubectl apply -f -

# Setup ServiceMonitors for application monitoring
kubectl apply -f - <<EOF
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: backend-monitor
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: musicconnect-backend
  endpoints:
  - port: metrics
    interval: 30s
    path: /metrics
---
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: websocket-monitor
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: musicconnect-websocket
  endpoints:
  - port: metrics
    interval: 30s
    path: /metrics
EOF

# Setup PodMonitors for pod-level monitoring
kubectl apply -f - <<EOF
apiVersion: monitoring.coreos.com/v1
kind: PodMonitor
metadata:
  name: application-pods
  namespace: monitoring
spec:
  selector:
    matchLabels:
      monitoring: "true"
  podMetricsEndpoints:
  - port: metrics
    interval: 30s
EOF

# Create monitoring ingress
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: monitoring-ingress
  namespace: monitoring
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - grafana.musicconnect.com
    - prometheus.musicconnect.com
    - alertmanager.musicconnect.com
    secretName: monitoring-tls
  rules:
  - host: grafana.musicconnect.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: prometheus-operator-grafana
            port:
              number: 80
  - host: prometheus.musicconnect.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: prometheus-operator-kube-p-prometheus
            port:
              number: 9090
  - host: alertmanager.musicconnect.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: prometheus-operator-kube-p-alertmanager
            port:
              number: 9093
EOF

echo "Monitoring stack setup complete!"
echo ""
echo "Access points:"
echo "- Grafana: https://grafana.musicconnect.com (admin / ${GRAFANA_ADMIN_PASSWORD:-admin})"
echo "- Prometheus: https://prometheus.musicconnect.com"
echo "- AlertManager: https://alertmanager.musicconnect.com"
echo ""
echo "To view logs:"
echo "kubectl logs -n monitoring -l app.kubernetes.io/name=prometheus"
echo "kubectl logs -n monitoring -l app.kubernetes.io/name=grafana"