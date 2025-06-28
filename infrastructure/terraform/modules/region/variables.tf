variable "region" {
  description = "AWS region"
  type        = string
}

variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
}

variable "eks_node_groups" {
  description = "Configuration for EKS node groups"
  type = map(object({
    min_size       = number
    max_size       = number
    desired_size   = number
    instance_types = list(string)
    capacity_type  = optional(string, "ON_DEMAND")
  }))
}

variable "rds_config" {
  description = "Configuration for RDS Aurora cluster"
  type = object({
    engine         = string
    engine_version = string
    instance_class = string
    instances      = number
  })
}

variable "elasticache_config" {
  description = "Configuration for ElastiCache Redis"
  type = object({
    node_type       = string
    num_cache_nodes = number
  })
}

variable "is_primary" {
  description = "Is this the primary region?"
  type        = bool
  default     = false
}

variable "domain_name" {
  description = "Main domain name for the application"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}