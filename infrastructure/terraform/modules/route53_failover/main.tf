# Health checks for each endpoint
resource "aws_route53_health_check" "endpoints" {
  for_each = var.endpoints

  fqdn              = each.value.dns_name
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  failure_threshold = "3"
  request_interval  = "30"

  tags = merge(var.tags, {
    Name = "${var.project_name}-${each.key}-health-check"
  })
}

# Primary record with failover
resource "aws_route53_record" "primary" {
  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = var.endpoints["us_east_1"].dns_name
    zone_id                = data.aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = true
  }

  set_identifier = "primary"
  failover_routing_policy {
    type = "PRIMARY"
  }

  health_check_id = aws_route53_health_check.endpoints["us_east_1"].id
}

# WWW record
resource "aws_route53_record" "www" {
  zone_id = var.hosted_zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.endpoints["us_east_1"].dns_name
    zone_id                = data.aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = true
  }
}

# API subdomain with geolocation routing
resource "aws_route53_record" "api_us" {
  zone_id = var.hosted_zone_id
  name    = "api.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.endpoints["us_east_1"].dns_name
    zone_id                = data.aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = true
  }

  set_identifier = "api-us"
  geolocation_routing_policy {
    continent = "NA"
  }
}

resource "aws_route53_record" "api_eu" {
  count   = contains(keys(var.endpoints), "eu_west_1") ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = "api.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.endpoints["eu_west_1"].dns_name
    zone_id                = data.aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = true
  }

  set_identifier = "api-eu"
  geolocation_routing_policy {
    continent = "EU"
  }
}

resource "aws_route53_record" "api_asia" {
  count   = contains(keys(var.endpoints), "ap_southeast_1") ? 1 : 0
  zone_id = var.hosted_zone_id
  name    = "api.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.endpoints["ap_southeast_1"].dns_name
    zone_id                = data.aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = true
  }

  set_identifier = "api-asia"
  geolocation_routing_policy {
    continent = "AS"
  }
}

# Default API record
resource "aws_route53_record" "api_default" {
  zone_id = var.hosted_zone_id
  name    = "api.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.endpoints["us_east_1"].dns_name
    zone_id                = data.aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = true
  }

  set_identifier = "api-default"
  geolocation_routing_policy {
    country = "*"
  }
}

# Data source for CloudFront distribution
data "aws_cloudfront_distribution" "main" {
  id = split("/", var.endpoints["us_east_1"].dns_name)[0]
}

# Outputs
output "health_check_ids" {
  value = {
    for k, v in aws_route53_health_check.endpoints : k => v.id
  }
}

output "dns_records" {
  value = {
    primary = aws_route53_record.primary.fqdn
    www     = aws_route53_record.www.fqdn
    api     = aws_route53_record.api_default.fqdn
  }
}