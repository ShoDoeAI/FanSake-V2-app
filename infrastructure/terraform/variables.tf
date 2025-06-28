variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "musicconnect"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "domain_name" {
  description = "Main domain name for the application"
  type        = string
  default     = "musicconnect.com"
}

variable "aws_regions" {
  description = "List of AWS regions to deploy to"
  type        = list(string)
  default     = ["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"]
}

variable "enable_spot_instances" {
  description = "Enable spot instances for cost optimization"
  type        = bool
  default     = true
}

variable "database_backup_retention_days" {
  description = "Number of days to retain database backups"
  type        = number
  default     = 30
}

variable "enable_deletion_protection" {
  description = "Enable deletion protection for critical resources"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default = {
    Project     = "MusicConnect"
    ManagedBy   = "Terraform"
    Environment = "Production"
  }
}