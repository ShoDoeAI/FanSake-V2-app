variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "primary_cluster" {
  description = "Primary RDS cluster configuration"
  type = object({
    id       = string
    endpoint = string
    reader_endpoint = string
  })
}

variable "secondary_regions" {
  description = "List of secondary regions for read replicas"
  type        = list(string)
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}