# Aurora Global Database Cluster
resource "aws_rds_global_cluster" "main" {
  provider = aws.primary

  global_cluster_identifier = "${var.project_name}-global-cluster"
  engine                    = "aurora-postgresql"
  engine_version           = "15.4"
  database_name            = "${var.project_name}db"
  storage_encrypted        = true
}

# Attach primary cluster to global cluster
resource "aws_rds_cluster_instance" "global_primary" {
  provider = aws.primary

  identifier         = "${var.project_name}-primary-instance"
  cluster_identifier = var.primary_cluster.id
  engine             = "aurora-postgresql"
  instance_class     = "db.r6g.large"
}

# Secondary clusters in other regions
resource "aws_rds_cluster" "secondary" {
  for_each = toset(var.secondary_regions)
  provider = aws[each.key]

  cluster_identifier              = "${var.project_name}-${each.key}-secondary"
  engine                         = "aurora-postgresql"
  engine_version                 = "15.4"
  global_cluster_identifier      = aws_rds_global_cluster.main.id
  skip_final_snapshot           = false
  final_snapshot_identifier     = "${var.project_name}-${each.key}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"
  backup_retention_period       = 7
  preferred_backup_window       = "03:00-04:00"
  preferred_maintenance_window  = "sun:04:00-sun:05:00"
  enabled_cloudwatch_logs_exports = ["postgresql"]
  storage_encrypted             = true

  lifecycle {
    ignore_changes = [replication_source_identifier]
  }

  depends_on = [
    aws_rds_cluster_instance.global_primary
  ]

  tags = var.tags
}

resource "aws_rds_cluster_instance" "secondary" {
  for_each = toset(var.secondary_regions)
  provider = aws[each.key]

  identifier         = "${var.project_name}-${each.key}-secondary-instance"
  cluster_identifier = aws_rds_cluster.secondary[each.key].id
  engine             = "aurora-postgresql"
  instance_class     = "db.r6g.large"
  
  performance_insights_enabled = true
  monitoring_interval         = 60
  monitoring_role_arn        = aws_iam_role.rds_monitoring[each.key].arn

  tags = var.tags
}

# IAM role for enhanced monitoring
resource "aws_iam_role" "rds_monitoring" {
  for_each = toset(var.secondary_regions)
  provider = aws[each.key]

  name = "${var.project_name}-${each.key}-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  for_each = toset(var.secondary_regions)
  provider = aws[each.key]

  role       = aws_iam_role.rds_monitoring[each.key].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# Outputs
output "global_cluster_id" {
  value = aws_rds_global_cluster.main.id
}

output "writer_endpoint" {
  value = var.primary_cluster.endpoint
}

output "reader_endpoints" {
  value = {
    for region in var.secondary_regions :
    region => aws_rds_cluster.secondary[region].reader_endpoint
  }
}