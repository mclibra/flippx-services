# Banner Management API

REST API endpoints for managing banner images displayed on the mobile app. Admins can create, update, delete, and manage banners, while users can retrieve active banners.

---

## Quick Reference

| Area | What's Covered |
| --- | --- |
| [Admin Endpoints](#admin-endpoints) | All admin-only operations |
| [Public Endpoints](#public-endpoints) | User-facing banner retrieval |
| [Data Models](#data-models) | Banner schema structure |
| [Usage Examples](#usage-examples) | End-to-end workflow examples |

---

## Admin Endpoints

All admin endpoints require:
- **Authentication**: Bearer token in Authorization header
- **Role**: ADMIN role required
- **Headers**: `x-api-key` header required

---

### 1. Get Signed URL for Banner Upload

Get a pre-signed URL for uploading banner images directly to S3.

**Endpoint:** `GET /api/admin/banner-management/signedurl`

**Authentication:** Required (ADMIN role)

**Query Parameters:**
- `fileType` (String, required): File extension (jpg, jpeg, png, gif, webp, bmp, svg, heic, heif)

**Success Response (200):**
```json
{
  "success": true,
  "signedUrl": "https://s3.amazonaws.com/bucket/banners/507f1f77bcf86cd799439011_a1b2c3d4e5f6.jpg?X-Amz-Algorithm=...",
  "fileName": "banners/507f1f77bcf86cd799439011_a1b2c3d4e5f6.jpg"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Unsupported file format. Please upload an image (JPG, PNG, GIF, WebP, BMP, SVG, HEIC, HEIF)."
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Unable to generate file upload URL. Please try again."
}
```

**Example:**
```bash
curl -X GET "https://your-api-domain.com/api/admin/banner-management/signedurl?fileType=jpg" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Usage:**
1. Call this endpoint to get a signed URL
2. Upload the image file directly to S3 using the signed URL (PUT request with file as body)
3. Use the returned `fileName` or construct the full S3 URL to get the `imageUrl`
4. Use the `imageUrl` when creating/updating banners

**Supported File Types:**
- Images: jpg, jpeg, png, gif, webp, bmp, svg, heic, heif

---

### 2. Create Banner

Create a new banner image entry.

**Endpoint:** `POST /api/admin/banner-management`

**Authentication:** Required (ADMIN role)

**Request Body:**
```json
{
  "imageUrl": "https://s3.amazonaws.com/bucket/banners/banner_image.jpg",
  "title": "Summer Sale Banner",
  "description": "Limited time offer",
  "linkUrl": "https://example.com/promotion",
  "order": 1,
  "isActive": true
}
```

**Request Parameters:**
- `imageUrl` (String, required): Full URL of the banner image (must be valid URL)
- `title` (String, optional): Banner title
- `description` (String, optional): Banner description
- `linkUrl` (String, optional): URL to navigate when banner is clicked
- `order` (Number, optional): Display order (default: 0, lower numbers appear first)
- `isActive` (Boolean, optional): Whether banner is active (default: true)

**Success Response (201):**
```json
{
  "success": true,
  "message": "Banner created successfully",
  "banner": {
    "id": "507f1f77bcf86cd799439011",
    "imageUrl": "https://s3.amazonaws.com/bucket/banners/banner_image.jpg",
    "title": "Summer Sale Banner",
    "description": "Limited time offer",
    "linkUrl": "https://example.com/promotion",
    "order": 1,
    "isActive": true,
    "createdBy": {
      "id": "507f191e810c19729de860ea",
      "name": "Admin User",
      "userName": "admin",
      "email": "admin@example.com"
    },
    "updatedBy": null,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Image URL is required"
}
```

```json
{
  "success": false,
  "error": "Invalid image URL format"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to create banner"
}
```

**Example:**
```bash
curl -X POST https://your-api-domain.com/api/admin/banner-management \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "imageUrl": "https://s3.amazonaws.com/bucket/banners/banner_image.jpg",
    "title": "Summer Sale Banner",
    "description": "Limited time offer",
    "linkUrl": "https://example.com/promotion",
    "order": 1,
    "isActive": true
  }'
```

---

### 3. Update Banner

Update an existing banner.

**Endpoint:** `PUT /api/admin/banner-management/:id`

**Authentication:** Required (ADMIN role)

**URL Parameters:**
- `id` (String, required): Banner ID

**Request Body:**
```json
{
  "imageUrl": "https://s3.amazonaws.com/bucket/banners/updated_banner.jpg",
  "title": "Updated Summer Sale Banner",
  "description": "New limited time offer",
  "linkUrl": "https://example.com/new-promotion",
  "order": 2,
  "isActive": true
}
```

**Request Parameters:**
- All fields are optional - only include fields you want to update
- `imageUrl` (String, optional): Full URL of the banner image
- `title` (String, optional): Banner title
- `description` (String, optional): Banner description
- `linkUrl` (String, optional): URL to navigate when banner is clicked
- `order` (Number, optional): Display order
- `isActive` (Boolean, optional): Whether banner is active

**Success Response (200):**
```json
{
  "success": true,
  "message": "Banner updated successfully",
  "banner": {
    "id": "507f1f77bcf86cd799439011",
    "imageUrl": "https://s3.amazonaws.com/bucket/banners/updated_banner.jpg",
    "title": "Updated Summer Sale Banner",
    "description": "New limited time offer",
    "linkUrl": "https://example.com/new-promotion",
    "order": 2,
    "isActive": true,
    "createdBy": {
      "id": "507f191e810c19729de860ea",
      "name": "Admin User",
      "userName": "admin",
      "email": "admin@example.com"
    },
    "updatedBy": {
      "id": "507f191e810c19729de860ea",
      "name": "Admin User",
      "userName": "admin",
      "email": "admin@example.com"
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T11:45:00.000Z"
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Banner not found"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Invalid image URL format"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to update banner"
}
```

**Example:**
```bash
curl -X PUT https://your-api-domain.com/api/admin/banner-management/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "title": "Updated Summer Sale Banner",
    "order": 2
  }'
```

---

### 4. Delete Banner

Delete a banner permanently.

**Endpoint:** `DELETE /api/admin/banner-management/:id`

**Authentication:** Required (ADMIN role)

**URL Parameters:**
- `id` (String, required): Banner ID

**Success Response (200):**
```json
{
  "success": true,
  "message": "Banner deleted successfully"
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Banner not found"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to delete banner"
}
```

**Example:**
```bash
curl -X DELETE https://your-api-domain.com/api/admin/banner-management/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Notes:**
- This operation is permanent and cannot be undone
- The image file in S3 is not automatically deleted - you may want to clean it up separately

---

### 5. List Banners (Admin)

Get a paginated list of all banners with filtering and sorting options.

**Endpoint:** `GET /api/admin/banner-management`

**Authentication:** Required (ADMIN role)

**Query Parameters:**
- `page` (Number, optional): Page number (default: 1)
- `limit` (Number, optional): Items per page (default: 20)
- `isActive` (Boolean/String, optional): Filter by active status (true/false)
- `sortBy` (String, optional): Sort field (default: "order")
- `sortOrder` (String, optional): Sort order - "asc" or "desc" (default: "asc")

**Success Response (200):**
```json
{
  "success": true,
  "banners": [
    {
      "id": "507f1f77bcf86cd799439011",
      "imageUrl": "https://s3.amazonaws.com/bucket/banners/banner1.jpg",
      "title": "Summer Sale Banner",
      "description": "Limited time offer",
      "linkUrl": "https://example.com/promotion",
      "order": 1,
      "isActive": true,
      "createdBy": {
        "id": "507f191e810c19729de860ea",
        "name": "Admin User",
        "userName": "admin",
        "email": "admin@example.com"
      },
      "updatedBy": null,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "id": "507f1f77bcf86cd799439012",
      "imageUrl": "https://s3.amazonaws.com/bucket/banners/banner2.jpg",
      "title": "Winter Collection",
      "description": "New arrivals",
      "linkUrl": "https://example.com/winter",
      "order": 2,
      "isActive": true,
      "createdBy": {
        "id": "507f191e810c19729de860ea",
        "name": "Admin User",
        "userName": "admin",
        "email": "admin@example.com"
      },
      "updatedBy": null,
      "createdAt": "2024-01-16T09:15:00.000Z",
      "updatedAt": "2024-01-16T09:15:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 2,
    "pages": 1,
    "hasMore": false
  }
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to fetch banners"
}
```

**Example:**
```bash
# Get all banners
curl -X GET "https://your-api-domain.com/api/admin/banner-management" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Get only active banners, sorted by order descending
curl -X GET "https://your-api-domain.com/api/admin/banner-management?isActive=true&sortBy=order&sortOrder=desc&page=1&limit=10" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### 6. Get Banner Details

Get detailed information about a specific banner.

**Endpoint:** `GET /api/admin/banner-management/:id`

**Authentication:** Required (ADMIN role)

**URL Parameters:**
- `id` (String, required): Banner ID

**Success Response (200):**
```json
{
  "success": true,
  "banner": {
    "id": "507f1f77bcf86cd799439011",
    "imageUrl": "https://s3.amazonaws.com/bucket/banners/banner_image.jpg",
    "title": "Summer Sale Banner",
    "description": "Limited time offer",
    "linkUrl": "https://example.com/promotion",
    "order": 1,
    "isActive": true,
    "createdBy": {
      "id": "507f191e810c19729de860ea",
      "name": "Admin User",
      "userName": "admin",
      "email": "admin@example.com"
    },
    "updatedBy": {
      "id": "507f191e810c19729de860ea",
      "name": "Admin User",
      "userName": "admin",
      "email": "admin@example.com"
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T11:45:00.000Z"
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Banner not found"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to fetch banner details"
}
```

**Example:**
```bash
curl -X GET https://your-api-domain.com/api/admin/banner-management/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Public Endpoints

---

### 7. Get Active Banners (Public)

Get a list of all active banner images for display on the mobile app. This endpoint does not require authentication.

**Endpoint:** `GET /api/banner`

**Authentication:** Not required

**Query Parameters:** None

**Success Response (200):**
```json
{
  "success": true,
  "banners": [
    {
      "id": "507f1f77bcf86cd799439011",
      "imageUrl": "https://s3.amazonaws.com/bucket/banners/banner1.jpg",
      "title": "Summer Sale Banner",
      "description": "Limited time offer",
      "linkUrl": "https://example.com/promotion",
      "order": 1
    },
    {
      "id": "507f1f77bcf86cd799439012",
      "imageUrl": "https://s3.amazonaws.com/bucket/banners/banner2.jpg",
      "title": "Winter Collection",
      "description": "New arrivals",
      "linkUrl": "https://example.com/winter",
      "order": 2
    }
  ]
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to fetch banners"
}
```

**Example:**
```bash
curl -X GET https://your-api-domain.com/api/banner \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY"
```

**Notes:**
- Only returns banners where `isActive` is `true`
- Banners are sorted by `order` (ascending), then by `createdAt` (descending)
- Returns only essential fields: `imageUrl`, `title`, `description`, `linkUrl`, `order`
- Does not include audit fields (`createdBy`, `updatedBy`, `createdAt`, `updatedAt`)

---

## Data Models

### Banner Model

```typescript
{
  _id: ObjectId,
  imageUrl: String, // Required - Full URL of the banner image
  title: String, // Optional - Banner title
  description: String, // Optional - Banner description
  linkUrl: String, // Optional - URL to navigate when banner is clicked
  order: Number, // Default: 0 - Display order (lower numbers appear first)
  isActive: Boolean, // Default: true - Whether banner is active
  createdBy: String (ref: 'User'), // Required - Admin user who created the banner
  updatedBy: String (ref: 'User'), // Optional - Admin user who last updated the banner
  createdAt: Date, // Auto-generated timestamp
  updatedAt: Date // Auto-generated timestamp
}
```

**Indexes:**
- `{ isActive: 1, order: 1 }` - For efficient querying of active banners sorted by order
- `{ createdAt: -1 }` - For sorting by creation date

---

## Usage Examples

### Complete Workflow: Creating a Banner

1. **Get Signed URL:**
```bash
curl -X GET "https://your-api-domain.com/api/admin/banner-management/signedurl?fileType=jpg" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Response:
```json
{
  "success": true,
  "signedUrl": "https://s3.amazonaws.com/bucket/banners/admin123_abc123.jpg?X-Amz-Algorithm=...",
  "fileName": "banners/admin123_abc123.jpg"
}
```

2. **Upload Image to S3:**
```bash
curl -X PUT "https://s3.amazonaws.com/bucket/banners/admin123_abc123.jpg?X-Amz-Algorithm=..." \
  -H "Content-Type: image/jpeg" \
  --data-binary @banner_image.jpg
```

3. **Construct Image URL:**
The image URL will be: `https://s3.amazonaws.com/bucket/banners/admin123_abc123.jpg`
(Or use your S3 bucket's public URL format)

4. **Create Banner:**
```bash
curl -X POST https://your-api-domain.com/api/admin/banner-management \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "imageUrl": "https://s3.amazonaws.com/bucket/banners/admin123_abc123.jpg",
    "title": "New Year Sale",
    "description": "50% off on all items",
    "linkUrl": "https://example.com/new-year-sale",
    "order": 1,
    "isActive": true
  }'
```

### Updating Banner Order

To reorder banners, update the `order` field:

```bash
curl -X PUT https://your-api-domain.com/api/admin/banner-management/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "order": 3
  }'
```

### Deactivating a Banner

To hide a banner from the public endpoint without deleting it:

```bash
curl -X PUT https://your-api-domain.com/api/admin/banner-management/507f1f77bcf86cd799439011 \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "isActive": false
  }'
```

---

## Error Handling

All endpoints follow a consistent error response format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `201` - Created successfully
- `400` - Bad Request (validation errors, invalid input)
- `404` - Not Found (resource doesn't exist)
- `500` - Internal Server Error

---

## Notes

- **Image Storage**: Images are stored in S3 with the path prefix `banners/` for organization
- **Signed URLs**: Signed URLs expire after 60 seconds - upload must be completed within this time
- **Image URLs**: After uploading to S3, construct the full public URL using your S3 bucket configuration
- **Order Field**: Lower order values appear first in the list
- **Soft Delete**: Use `isActive: false` to hide banners without deleting them
- **Audit Trail**: All banners track who created and last updated them
- **Public Endpoint**: Only returns active banners, sorted by order

---

## Testing Checklist

- [ ] Get signed URL with valid file type
- [ ] Get signed URL with invalid file type (should fail)
- [ ] Upload image to S3 using signed URL
- [ ] Create banner with valid image URL
- [ ] Create banner with invalid image URL (should fail)
- [ ] Update banner with partial data
- [ ] Update non-existent banner (should return 404)
- [ ] Delete banner
- [ ] List all banners (admin)
- [ ] List active banners only (admin)
- [ ] Get banner details
- [ ] Get active banners (public endpoint, no auth)
- [ ] Verify inactive banners don't appear in public endpoint
- [ ] Verify banner ordering works correctly
