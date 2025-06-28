locals {
  azs = data.aws_availability_zones.available.names
}

data "aws_availability_zones" "available" {
  state = "available"
}

# VPC Module
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.project_name}-${var.region}-vpc"
  cidr = var.vpc_cidr

  azs             = var.availability_zones
  private_subnets = [for k, v in var.availability_zones : cidrsubnet(var.vpc_cidr, 4, k)]
  public_subnets  = [for k, v in var.availability_zones : cidrsubnet(var.vpc_cidr, 8, k + 48)]
  database_subnets = [for k, v in var.availability_zones : cidrsubnet(var.vpc_cidr, 8, k + 64)]

  enable_nat_gateway   = true
  single_nat_gateway   = false
  enable_dns_hostnames = true
  enable_dns_support   = true

  enable_flow_log                      = true
  create_flow_log_cloudwatch_iam_role  = true
  create_flow_log_cloudwatch_log_group = true

  public_subnet_tags = {
    "kubernetes.io/role/elb" = 1
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = 1
  }

  tags = var.tags
}

# EKS Module
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"

  cluster_name    = "${var.project_name}-${var.region}-eks"
  cluster_version = "1.28"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  enable_irsa = true

  cluster_endpoint_public_access  = true
  cluster_endpoint_private_access = true

  cluster_addons = {
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent = true
    }
    aws-ebs-csi-driver = {
      most_recent = true
    }
  }

  eks_managed_node_groups = var.eks_node_groups

  manage_aws_auth_configmap = true

  tags = var.tags
}

# Application Load Balancer
resource "aws_lb" "main" {
  name               = "${var.project_name}-${var.region}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets

  enable_deletion_protection = var.is_primary
  enable_http2              = true
  enable_cross_zone_load_balancing = true

  tags = var.tags
}

# ALB Security Group
resource "aws_security_group" "alb" {
  name_prefix = "${var.project_name}-${var.region}-alb-"
  description = "Security group for ALB"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = var.tags
}

# RDS Aurora Cluster
module "rds_aurora" {
  source  = "terraform-aws-modules/rds-aurora/aws"
  version = "~> 8.0"

  name           = "${var.project_name}-${var.region}-aurora"
  engine         = var.rds_config.engine
  engine_version = var.rds_config.engine_version
  instance_class = var.rds_config.instance_class
  instances      = { for i in range(var.rds_config.instances) : i => {} }

  vpc_id               = module.vpc.vpc_id
  db_subnet_group_name = aws_db_subnet_group.aurora.name
  security_group_rules = {
    eks_ingress = {
      source_security_group_id = module.eks.cluster_primary_security_group_id
    }
  }

  storage_encrypted   = true
  apply_immediately   = true
  monitoring_interval = 60

  enabled_cloudwatch_logs_exports = ["postgresql"]

  backup_retention_period = var.is_primary ? 30 : 7
  preferred_backup_window = "03:00-04:00"
  
  deletion_protection = var.is_primary

  tags = var.tags
}

resource "aws_db_subnet_group" "aurora" {
  name       = "${var.project_name}-${var.region}-aurora-subnet-group"
  subnet_ids = module.vpc.database_subnets

  tags = var.tags
}

# ElastiCache Redis Cluster
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "${var.project_name}-${var.region}-redis"
  description                = "Redis cluster for ${var.project_name}"
  node_type                  = var.elasticache_config.node_type
  num_cache_clusters         = var.elasticache_config.num_cache_nodes
  port                       = 6379
  parameter_group_name       = "default.redis7"
  engine_version            = "7.0"
  subnet_group_name         = aws_elasticache_subnet_group.redis.name
  security_group_ids        = [aws_security_group.redis.id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token_enabled         = true

  automatic_failover_enabled = true
  multi_az_enabled          = true

  snapshot_retention_limit = 5
  snapshot_window         = "03:00-05:00"

  tags = var.tags
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.project_name}-${var.region}-redis-subnet-group"
  subnet_ids = module.vpc.private_subnets

  tags = var.tags
}

resource "aws_security_group" "redis" {
  name_prefix = "${var.project_name}-${var.region}-redis-"
  description = "Security group for Redis"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [module.eks.cluster_primary_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = var.tags
}

# S3 Bucket for media storage
resource "aws_s3_bucket" "media" {
  bucket = "${var.project_name}-${var.region}-media-${var.environment}"

  tags = var.tags
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket = aws_s3_bucket.media.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    allowed_origins = ["https://${var.domain_name}", "https://www.${var.domain_name}"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Auto Scaling for EKS
resource "aws_autoscaling_policy" "eks_cpu" {
  for_each = module.eks.eks_managed_node_groups

  name                   = "${each.key}-cpu-policy"
  autoscaling_group_name = each.value.asg_name
  policy_type           = "TargetTrackingScaling"

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = 70.0
  }
}

# Outputs
output "vpc_id" {
  value = module.vpc.vpc_id
}

output "eks_cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "eks_cluster_name" {
  value = module.eks.cluster_name
}

output "alb_dns_name" {
  value = aws_lb.main.dns_name
}

output "rds_cluster" {
  value = {
    id       = module.rds_aurora.cluster_id
    endpoint = module.rds_aurora.cluster_endpoint
    reader_endpoint = module.rds_aurora.cluster_reader_endpoint
  }
}

output "redis_endpoint" {
  value = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "s3_bucket_name" {
  value = aws_s3_bucket.media.id
}