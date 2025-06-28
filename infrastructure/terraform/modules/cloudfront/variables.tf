variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "domain_name" {
  description = "Main domain name for the application"
  type        = string
}

variable "origins" {
  description = "Map of origins for CloudFront"
  type = map(object({
    domain_name = string
    origin_id   = string
  }))
}

variable "certificate_arn" {
  description = "ARN of the ACM certificate"
  type        = string
}

variable "web_acl_id" {
  description = "WAF Web ACL ID"
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}