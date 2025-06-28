# Lambda@Edge function for request routing
resource "aws_iam_role" "lambda_edge" {
  name = "${var.project_name}-lambda-edge-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = [
            "lambda.amazonaws.com",
            "edgelambda.amazonaws.com"
          ]
        }
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "lambda_edge_basic" {
  role       = aws_iam_role.lambda_edge.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Lambda function for origin request
resource "aws_lambda_function" "origin_request" {
  filename         = "${path.module}/lambda/origin-request.zip"
  function_name    = "${var.project_name}-origin-request"
  role            = aws_iam_role.lambda_edge.arn
  handler         = "index.handler"
  source_code_hash = filebase64sha256("${path.module}/lambda/origin-request.zip")
  runtime         = "nodejs18.x"
  publish         = true

  tags = var.tags
}

# Lambda function code
resource "local_file" "origin_request_code" {
  filename = "${path.module}/lambda/origin-request.js"
  content  = <<-EOT
'use strict';

exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;
    
    // Get CloudFront viewer country
    const country = headers['cloudfront-viewer-country'] ? headers['cloudfront-viewer-country'][0].value : 'US';
    
    // Route to nearest origin based on country
    const originMappings = {
        // North America
        'US': 'us-east-1-alb.musicconnect.com',
        'CA': 'us-east-1-alb.musicconnect.com',
        'MX': 'us-east-1-alb.musicconnect.com',
        
        // Europe
        'GB': 'eu-west-1-alb.musicconnect.com',
        'FR': 'eu-west-1-alb.musicconnect.com',
        'DE': 'eu-west-1-alb.musicconnect.com',
        'IT': 'eu-west-1-alb.musicconnect.com',
        'ES': 'eu-west-1-alb.musicconnect.com',
        
        // Asia Pacific
        'JP': 'ap-southeast-1-alb.musicconnect.com',
        'SG': 'ap-southeast-1-alb.musicconnect.com',
        'AU': 'ap-southeast-1-alb.musicconnect.com',
        'IN': 'ap-southeast-1-alb.musicconnect.com',
        'CN': 'ap-southeast-1-alb.musicconnect.com',
        
        // Default
        'DEFAULT': 'us-east-1-alb.musicconnect.com'
    };
    
    const origin = originMappings[country] || originMappings['DEFAULT'];
    
    // Update origin
    request.origin = {
        custom: {
            domainName: origin,
            port: 443,
            protocol: 'https',
            sslProtocols: ['TLSv1.2'],
            path: '/api',
            customHeaders: {}
        }
    };
    
    // Add custom headers
    request.headers['x-forwarded-country'] = [{key: 'X-Forwarded-Country', value: country}];
    request.headers['x-origin-region'] = [{key: 'X-Origin-Region', value: origin.split('-')[0] + '-' + origin.split('-')[1]}];
    
    return request;
};
EOT
}

# Create zip file for Lambda
data "archive_file" "origin_request" {
  type        = "zip"
  source_file = local_file.origin_request_code.filename
  output_path = "${path.module}/lambda/origin-request.zip"
}

# Lambda function for viewer response (security headers)
resource "aws_lambda_function" "viewer_response" {
  filename         = "${path.module}/lambda/viewer-response.zip"
  function_name    = "${var.project_name}-viewer-response"
  role            = aws_iam_role.lambda_edge.arn
  handler         = "index.handler"
  source_code_hash = filebase64sha256("${path.module}/lambda/viewer-response.zip")
  runtime         = "nodejs18.x"
  publish         = true

  tags = var.tags
}

resource "local_file" "viewer_response_code" {
  filename = "${path.module}/lambda/viewer-response.js"
  content  = <<-EOT
'use strict';

exports.handler = async (event) => {
    const response = event.Records[0].cf.response;
    const headers = response.headers;
    
    // Security headers
    headers['strict-transport-security'] = [{
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload'
    }];
    
    headers['x-content-type-options'] = [{
        key: 'X-Content-Type-Options',
        value: 'nosniff'
    }];
    
    headers['x-frame-options'] = [{
        key: 'X-Frame-Options',
        value: 'DENY'
    }];
    
    headers['x-xss-protection'] = [{
        key: 'X-XSS-Protection',
        value: '1; mode=block'
    }];
    
    headers['referrer-policy'] = [{
        key: 'Referrer-Policy',
        value: 'strict-origin-when-cross-origin'
    }];
    
    headers['content-security-policy'] = [{
        key: 'Content-Security-Policy',
        value: "default-src 'self' https://*.musicconnect.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.stripe.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.musicconnect.com https://*.stripe.com; connect-src 'self' https://*.musicconnect.com https://*.stripe.com wss://*.musicconnect.com; frame-src https://*.stripe.com; object-src 'none'; base-uri 'self'; form-action 'self';"
    }];
    
    // Add cache control for static assets
    if (response.status === '200') {
        const uri = event.Records[0].cf.request.uri;
        
        if (uri.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
            headers['cache-control'] = [{
                key: 'Cache-Control',
                value: 'public, max-age=31536000, immutable'
            }];
        } else if (uri.endsWith('.html') || uri === '/') {
            headers['cache-control'] = [{
                key: 'Cache-Control',
                value: 'public, max-age=300, must-revalidate'
            }];
        }
    }
    
    return response;
};
EOT
}

data "archive_file" "viewer_response" {
  type        = "zip"
  source_file = local_file.viewer_response_code.filename
  output_path = "${path.module}/lambda/viewer-response.zip"
}