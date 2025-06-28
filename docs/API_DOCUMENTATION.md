# MusicConnect API Documentation

## Base URL
Production: `https://api.musicconnect.com`

## Authentication
All API requests require authentication using JWT tokens. Include the token in the Authorization header:
```
Authorization: Bearer <token>
```

## Rate Limiting
- Authenticated requests: 1000/hour
- Unauthenticated requests: 100/hour
- Upload endpoints: 100/hour

## API Endpoints

### Authentication

#### POST /api/auth/register
Register a new user.

**Request Body:**
```json
{
  "username": "string",
  "email": "string",
  "password": "string",
  "role": "fan|artist",
  "artistName": "string (required for artists)",
  "genre": "string (optional for artists)"
}
```

**Response:**
```json
{
  "token": "string",
  "user": {
    "id": "string",
    "username": "string",
    "email": "string",
    "role": "string"
  }
}
```

#### POST /api/auth/login
Login existing user.

**Request Body:**
```json
{
  "email": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "token": "string",
  "user": {
    "id": "string",
    "username": "string",
    "email": "string",
    "role": "string"
  }
}
```

#### POST /api/auth/refresh
Refresh authentication token.

**Request Body:**
```json
{
  "refreshToken": "string"
}
```

**Response:**
```json
{
  "token": "string",
  "refreshToken": "string"
}
```

### Artists

#### GET /api/artists
Get list of artists.

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20, max: 100)
- `genre` (string): Filter by genre
- `search` (string): Search by name

**Response:**
```json
{
  "artists": [
    {
      "id": "string",
      "username": "string",
      "artistName": "string",
      "genre": "string",
      "bio": "string",
      "profileImage": "string",
      "subscriberCount": "number"
    }
  ],
  "pagination": {
    "page": "number",
    "limit": "number",
    "total": "number",
    "pages": "number"
  }
}
```

#### GET /api/artists/:id
Get artist details.

**Response:**
```json
{
  "artist": {
    "id": "string",
    "username": "string",
    "artistName": "string",
    "genre": "string",
    "bio": "string",
    "profileImage": "string",
    "bannerImage": "string",
    "subscriberCount": "number",
    "contentCount": "number",
    "subscriptionTiers": [
      {
        "tier": "bronze|silver|gold|platinum",
        "price": "number",
        "benefits": ["string"]
      }
    ]
  }
}
```

#### PUT /api/artists/profile
Update artist profile (artists only).

**Request Body:**
```json
{
  "artistName": "string",
  "bio": "string",
  "genre": "string",
  "socialLinks": {
    "twitter": "string",
    "instagram": "string",
    "youtube": "string"
  }
}
```

### Content

#### POST /api/uploads/content
Upload new content (artists only).

**Request Type:** multipart/form-data

**Fields:**
- `file` (file): Audio, video, or image file
- `title` (string): Content title
- `description` (string): Content description
- `tier` (string): Access tier (free|bronze|silver|gold|platinum)
- `releaseDate` (string): ISO date (optional, for scheduled release)

**Response:**
```json
{
  "content": {
    "id": "string",
    "title": "string",
    "description": "string",
    "type": "audio|video|image",
    "url": "string",
    "tier": "string",
    "createdAt": "string"
  }
}
```

#### GET /api/artists/:artistId/content
Get artist's content.

**Query Parameters:**
- `tier` (string): Filter by tier
- `type` (string): Filter by type (audio|video|image)
- `page` (number): Page number
- `limit` (number): Items per page

**Response:**
```json
{
  "content": [
    {
      "id": "string",
      "title": "string",
      "description": "string",
      "type": "string",
      "thumbnailUrl": "string",
      "duration": "number (seconds)",
      "tier": "string",
      "accessible": "boolean",
      "createdAt": "string"
    }
  ],
  "pagination": {}
}
```

#### GET /api/content/:id
Get content details.

**Response:**
```json
{
  "content": {
    "id": "string",
    "title": "string",
    "description": "string",
    "type": "string",
    "url": "string (if accessible)",
    "thumbnailUrl": "string",
    "duration": "number",
    "tier": "string",
    "artist": {
      "id": "string",
      "artistName": "string"
    },
    "stats": {
      "plays": "number",
      "likes": "number",
      "comments": "number"
    }
  }
}
```

### Subscriptions

#### POST /api/subscriptions/create
Create a new subscription.

**Request Body:**
```json
{
  "artistId": "string",
  "tier": "bronze|silver|gold|platinum",
  "paymentMethodId": "string (Stripe payment method)"
}
```

**Response:**
```json
{
  "subscription": {
    "id": "string",
    "artistId": "string",
    "tier": "string",
    "status": "active",
    "currentPeriodEnd": "string",
    "cancelAtPeriodEnd": "boolean"
  }
}
```

#### GET /api/subscriptions/active
Get user's active subscriptions.

**Response:**
```json
{
  "subscriptions": [
    {
      "id": "string",
      "artist": {
        "id": "string",
        "artistName": "string",
        "profileImage": "string"
      },
      "tier": "string",
      "status": "string",
      "currentPeriodEnd": "string",
      "cancelAtPeriodEnd": "boolean"
    }
  ]
}
```

#### POST /api/subscriptions/:id/cancel
Cancel a subscription.

**Response:**
```json
{
  "subscription": {
    "id": "string",
    "status": "canceled",
    "canceledAt": "string"
  }
}
```

### Messaging

#### POST /api/messaging/send
Send a direct message.

**Request Body:**
```json
{
  "recipientId": "string",
  "content": "string",
  "attachmentUrl": "string (optional)"
}
```

**Response:**
```json
{
  "message": {
    "id": "string",
    "content": "string",
    "sentAt": "string",
    "read": "boolean"
  }
}
```

#### GET /api/messaging/conversations
Get user's conversations.

**Response:**
```json
{
  "conversations": [
    {
      "id": "string",
      "participant": {
        "id": "string",
        "username": "string",
        "profileImage": "string"
      },
      "lastMessage": {
        "content": "string",
        "sentAt": "string",
        "read": "boolean"
      },
      "unreadCount": "number"
    }
  ]
}
```

### Discovery

#### GET /api/discovery
Get personalized recommendations.

**Query Parameters:**
- `type` (string): trending|new|recommended
- `limit` (number): Number of results

**Response:**
```json
{
  "artists": [],
  "content": [],
  "playlists": []
}
```

### Analytics (Artists Only)

#### GET /api/artists/analytics
Get artist analytics.

**Query Parameters:**
- `period` (string): 7d|30d|90d|1y
- `metric` (string): plays|subscribers|revenue

**Response:**
```json
{
  "analytics": {
    "summary": {
      "totalPlays": "number",
      "totalSubscribers": "number",
      "totalRevenue": "number",
      "averageEngagement": "number"
    },
    "timeSeries": [
      {
        "date": "string",
        "plays": "number",
        "subscribers": "number",
        "revenue": "number"
      }
    ],
    "topContent": [],
    "demographics": {}
  }
}
```

## WebSocket Events

Connect to `wss://ws.musicconnect.com` with authentication token.

### Events

#### message
New direct message received.
```json
{
  "type": "message",
  "data": {
    "id": "string",
    "senderId": "string",
    "content": "string",
    "sentAt": "string"
  }
}
```

#### notification
New notification.
```json
{
  "type": "notification",
  "data": {
    "id": "string",
    "title": "string",
    "body": "string",
    "actionUrl": "string"
  }
}
```

#### listeningParty
Listening party events.
```json
{
  "type": "listeningParty",
  "data": {
    "event": "start|songChange|end",
    "partyId": "string",
    "currentSong": {},
    "participants": "number"
  }
}
```

## Error Responses

All errors follow this format:
```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {}
  }
}
```

Common error codes:
- `UNAUTHORIZED`: Invalid or missing token
- `FORBIDDEN`: Insufficient permissions
- `NOT_FOUND`: Resource not found
- `VALIDATION_ERROR`: Invalid request data
- `RATE_LIMITED`: Rate limit exceeded
- `PAYMENT_REQUIRED`: Subscription required
- `SERVER_ERROR`: Internal server error