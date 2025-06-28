terraform {
  required_version = ">= 1.5.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }

  backend "s3" {
    bucket         = "musicconnect-terraform-state"
    key            = "global/s3/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "musicconnect-terraform-locks"
    encrypt        = true
  }
}

# Primary region configuration
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

provider "aws" {
  alias  = "us_west_2"
  region = "us-west-2"
}

provider "aws" {
  alias  = "eu_west_1"
  region = "eu-west-1"
}

provider "aws" {
  alias  = "ap_southeast_1"
  region = "ap-southeast-1"
}

# Global resources
module "global" {
  source = "./modules/global"
  
  project_name = var.project_name
  environment  = var.environment
  domain_name  = var.domain_name
}

# Regional deployments
module "us_east_1" {
  source = "./modules/region"
  
  providers = {
    aws = aws.us_east_1
  }
  
  region       = "us-east-1"
  project_name = var.project_name
  environment  = var.environment
  
  vpc_cidr           = "10.0.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]
  
  eks_node_groups = {
    general = {
      min_size     = 3
      max_size     = 15
      desired_size = 5
      instance_types = ["t3.large", "t3.xlarge"]
    }
    spot = {
      min_size     = 2
      max_size     = 20
      desired_size = 5
      instance_types = ["t3.large", "t3.xlarge", "t3a.large", "t3a.xlarge"]
      capacity_type = "SPOT"
    }
  }
  
  rds_config = {
    engine         = "aurora-postgresql"
    engine_version = "15.4"
    instance_class = "db.r6g.large"
    instances      = 2
  }
  
  elasticache_config = {
    node_type       = "cache.r6g.large"
    num_cache_nodes = 3
  }
  
  is_primary = true
}

module "us_west_2" {
  source = "./modules/region"
  
  providers = {
    aws = aws.us_west_2
  }
  
  region       = "us-west-2"
  project_name = var.project_name
  environment  = var.environment
  
  vpc_cidr           = "10.1.0.0/16"
  availability_zones = ["us-west-2a", "us-west-2b", "us-west-2c"]
  
  eks_node_groups = {
    general = {
      min_size     = 2
      max_size     = 10
      desired_size = 3
      instance_types = ["t3.large", "t3.xlarge"]
    }
    spot = {
      min_size     = 1
      max_size     = 15
      desired_size = 3
      instance_types = ["t3.large", "t3.xlarge", "t3a.large", "t3a.xlarge"]
      capacity_type = "SPOT"
    }
  }
  
  rds_config = {
    engine         = "aurora-postgresql"
    engine_version = "15.4"
    instance_class = "db.r6g.large"
    instances      = 2
  }
  
  elasticache_config = {
    node_type       = "cache.r6g.large"
    num_cache_nodes = 2
  }
  
  is_primary = false
}

module "eu_west_1" {
  source = "./modules/region"
  
  providers = {
    aws = aws.eu_west_1
  }
  
  region       = "eu-west-1"
  project_name = var.project_name
  environment  = var.environment
  
  vpc_cidr           = "10.2.0.0/16"
  availability_zones = ["eu-west-1a", "eu-west-1b", "eu-west-1c"]
  
  eks_node_groups = {
    general = {
      min_size     = 2
      max_size     = 10
      desired_size = 3
      instance_types = ["t3.large", "t3.xlarge"]
    }
    spot = {
      min_size     = 1
      max_size     = 15
      desired_size = 3
      instance_types = ["t3.large", "t3.xlarge", "t3a.large", "t3a.xlarge"]
      capacity_type = "SPOT"
    }
  }
  
  rds_config = {
    engine         = "aurora-postgresql"
    engine_version = "15.4"
    instance_class = "db.r6g.large"
    instances      = 2
  }
  
  elasticache_config = {
    node_type       = "cache.r6g.large"
    num_cache_nodes = 2
  }
  
  is_primary = false
}

module "ap_southeast_1" {
  source = "./modules/region"
  
  providers = {
    aws = aws.ap_southeast_1
  }
  
  region       = "ap-southeast-1"
  project_name = var.project_name
  environment  = var.environment
  
  vpc_cidr           = "10.3.0.0/16"
  availability_zones = ["ap-southeast-1a", "ap-southeast-1b", "ap-southeast-1c"]
  
  eks_node_groups = {
    general = {
      min_size     = 2
      max_size     = 10
      desired_size = 3
      instance_types = ["t3.large", "t3.xlarge"]
    }
    spot = {
      min_size     = 1
      max_size     = 15
      desired_size = 3
      instance_types = ["t3.large", "t3.xlarge", "t3a.large", "t3a.xlarge"]
      capacity_type = "SPOT"
    }
  }
  
  rds_config = {
    engine         = "aurora-postgresql"
    engine_version = "15.4"
    instance_class = "db.r6g.large"
    instances      = 2
  }
  
  elasticache_config = {
    node_type       = "cache.r6g.large"
    num_cache_nodes = 2
  }
  
  is_primary = false
}

# Global CloudFront distribution
module "cloudfront" {
  source = "./modules/cloudfront"
  
  providers = {
    aws = aws.us_east_1
  }
  
  project_name = var.project_name
  environment  = var.environment
  domain_name  = var.domain_name
  
  origins = {
    us_east_1 = {
      domain_name = module.us_east_1.alb_dns_name
      origin_id   = "us-east-1-alb"
    }
    us_west_2 = {
      domain_name = module.us_west_2.alb_dns_name
      origin_id   = "us-west-2-alb"
    }
    eu_west_1 = {
      domain_name = module.eu_west_1.alb_dns_name
      origin_id   = "eu-west-1-alb"
    }
    ap_southeast_1 = {
      domain_name = module.ap_southeast_1.alb_dns_name
      origin_id   = "ap-southeast-1-alb"
    }
  }
  
  certificate_arn = module.global.certificate_arn
}

# Global database replication
module "aurora_global" {
  source = "./modules/aurora_global"
  
  providers = {
    aws.primary   = aws.us_east_1
    aws.secondary = aws.us_west_2
    aws.tertiary  = aws.eu_west_1
    aws.quaternary = aws.ap_southeast_1
  }
  
  project_name = var.project_name
  environment  = var.environment
  
  primary_cluster   = module.us_east_1.rds_cluster
  secondary_regions = ["us-west-2", "eu-west-1", "ap-southeast-1"]
}

# Route53 health checks and failover
module "route53_failover" {
  source = "./modules/route53_failover"
  
  providers = {
    aws = aws.us_east_1
  }
  
  project_name = var.project_name
  environment  = var.environment
  domain_name  = var.domain_name
  hosted_zone_id = module.global.hosted_zone_id
  
  endpoints = {
    us_east_1 = {
      dns_name = module.cloudfront.distribution_domain_name
      type     = "cloudfront"
      primary  = true
    }
  }
}

# Outputs
output "cloudfront_distribution_domain" {
  value = module.cloudfront.distribution_domain_name
}

output "eks_cluster_endpoints" {
  value = {
    us_east_1      = module.us_east_1.eks_cluster_endpoint
    us_west_2      = module.us_west_2.eks_cluster_endpoint
    eu_west_1      = module.eu_west_1.eks_cluster_endpoint
    ap_southeast_1 = module.ap_southeast_1.eks_cluster_endpoint
  }
}

output "rds_endpoints" {
  value = {
    writer = module.aurora_global.writer_endpoint
    readers = module.aurora_global.reader_endpoints
  }
}