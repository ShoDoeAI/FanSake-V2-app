# Security Groups

# ALB Security Group
resource "aws_security_group" "alb" {
  name_prefix = "${var.project_name}-${var.region_alias}-alb-"
  description = "Security group for Application Load Balancer"
  vpc_id      = module.vpc.vpc_id
  
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP from anywhere"
  }
  
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS from anywhere"
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound traffic"
  }
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.region_alias}-alb-sg"
  })
}

# RDS Security Group
resource "aws_security_group" "rds" {
  name_prefix = "${var.project_name}-${var.region_alias}-rds-"
  description = "Security group for RDS database"
  vpc_id      = module.vpc.vpc_id
  
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]
    description     = "PostgreSQL from EKS nodes"
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound traffic"
  }
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.region_alias}-rds-sg"
  })
}

# ElastiCache Security Group
resource "aws_security_group" "redis" {
  name_prefix = "${var.project_name}-${var.region_alias}-redis-"
  description = "Security group for ElastiCache Redis"
  vpc_id      = module.vpc.vpc_id
  
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]
    description     = "Redis from EKS nodes"
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound traffic"
  }
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.region_alias}-redis-sg"
  })
}

# DB Subnet Group
resource "aws_db_subnet_group" "main" {
  name       = "${var.project_name}-${var.region_alias}-db-subnet-group"
  subnet_ids = module.vpc.database_subnets
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.region_alias}-db-subnet-group"
  })
}

# ElastiCache Subnet Group
resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.project_name}-${var.region_alias}-cache-subnet-group"
  subnet_ids = module.vpc.elasticache_subnets
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.region_alias}-cache-subnet-group"
  })
}

# KMS Keys
resource "aws_kms_key" "rds" {
  description             = "KMS key for RDS encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.region_alias}-rds-kms"
  })
}

resource "aws_kms_alias" "rds" {
  name          = "alias/${var.project_name}-${var.region_alias}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

# IAM Roles
resource "aws_iam_role" "rds_monitoring" {
  name = "${var.project_name}-${var.region_alias}-rds-monitoring"
  
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
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "redis_slow_log" {
  name              = "/aws/elasticache/${var.project_name}-${var.region_alias}-redis/slow-log"
  retention_in_days = 7
  
  tags = var.tags
}

# Random passwords
resource "random_password" "db_password" {
  count   = var.region_alias == "primary" ? 1 : 0
  length  = 32
  special = true
}

resource "random_password" "redis_auth_token" {
  length  = 32
  special = false  # Redis auth tokens don't support special characters
}

# Store passwords in Parameter Store
resource "aws_ssm_parameter" "db_password" {
  count = var.region_alias == "primary" ? 1 : 0
  
  name  = "/${var.project_name}/${var.environment}/db/password"
  type  = "SecureString"
  value = random_password.db_password[0].result
  
  tags = var.tags
}

resource "aws_ssm_parameter" "redis_auth_token" {
  name  = "/${var.project_name}/${var.environment}/${var.region_alias}/redis/auth-token"
  type  = "SecureString"
  value = random_password.redis_auth_token.result
  
  tags = var.tags
}