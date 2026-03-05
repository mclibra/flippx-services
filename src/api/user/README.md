# User API Documentation

Complete API documentation for user management, authentication, profile management, and related operations.

## Table of Contents

1. [Base URL](#base-url)
2. [Authentication](#authentication)
3. [Registration & Authentication](#registration--authentication)
4. [User Profile Management](#user-profile-management)
5. [Password Management](#password-management)
6. [Media & Document Upload](#media--document-upload)
7. [User Information](#user-information)
8. [Data Models](#data-models)
9. [Error Handling](#error-handling)

---

## Base URL

All endpoints are prefixed with `/api/user`

```
Base URL: https://your-api-domain.com/api/user
```

---

## Authentication

Most endpoints require authentication using a Bearer token in the Authorization header.

### Headers Required

```
Content-Type: application/json
x-api-key: YOUR_API_KEY
Authorization: Bearer YOUR_ACCESS_TOKEN (for authenticated endpoints)
```

---

## Registration & Authentication

### 1. Send OTP

Send OTP to user's phone number for registration.

**Endpoint:** `POST /api/user/send-otp`

**Authentication:** Not required

**Request Body:**
```json
{
  "countryCode": "+1",
  "phone": "1234567890"
}
```

**Request Parameters:**
- `countryCode` (String, required): Country code (e.g., "+1", "+91")
- `phone` (String, required): Phone number (7-10 digits)

**Success Response (200):**
```json
{
  "verificationToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Response (500):**
```json
{
  "error": "Invalid phone number."
}
```

**Example:**
```bash
curl -X POST https://your-api-domain.com/api/user/send-otp \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "countryCode": "+1",
    "phone": "1234567890"
  }'
```

---

### 2. Verify OTP

Verify the OTP sent to user's phone number.

**Endpoint:** `POST /api/user/verify-otp`

**Authentication:** Not required

**Request Body:**
```json
{
  "countryCode": "+1",
  "phone": "1234567890",
  "verificationCode": "1234",
  "verificationToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Request Parameters:**
- `countryCode` (String, required): Country code
- `phone` (String, required): Phone number
- `verificationCode` (String, required): OTP code received
- `verificationToken` (String, required): Token from send-otp response

**Success Response (200):**
```json
{
  "signUpToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Response (500):**
```json
{
  "error": "Invalid verification code."
}
```

**Example:**
```bash
curl -X POST https://your-api-domain.com/api/user/verify-otp \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "countryCode": "+1",
    "phone": "1234567890",
    "verificationCode": "1234",
    "verificationToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

---

### 3. Create User Account

Create a new user account after OTP verification.

**Endpoint:** `POST /api/user/`

**Authentication:** Not required

**Request Body:**
```json
{
  "countryCode": "+1",
  "phone": "1234567890",
  "name": {
    "firstName": "John",
    "lastName": "Doe"
  },
  "password": "password123",
  "dob": "1990-01-01",
  "countryName": "United States",
  "countryISO": "US",
  "refferalCode": "REF123" // optional
}
```

**Request Parameters:**
- `countryCode` (String, required): Country dial code (e.g., "+1", "+91")
- `phone` (String, required): Phone number (unique)
- `name` (Object, required): User name
  - `firstName` (String, required): First name
  - `lastName` (String, required): Last name
- `password` (String, required): Password (minimum 6 characters)
- `dob` (String, required): Date of birth
- `countryName` (String, optional): Full country name (e.g., "United States", "India")
- `countryISO` (String, optional): 2-digit ISO 3166-1 ALPHA-2 country code (e.g., "US", "IN")
- `refferalCode` (String, optional): Referral code

**Success Response (200):**
```json
{
  "success": true,
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "name": {
      "firstName": "John",
      "lastName": "Doe"
    },
    "picture": null,
    "dob": "1990-01-01",
    "userName": "johndoe123",
    "role": "USER",
    "countryCode": "+1",
    "countryName": "United States",
    "countryISO": "US",
    "phone": "1234567890",
    "email": null,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "address": null,
    "sim_nif": null,
    "bankAccount": [],
    "idProof": {
      "documentUrl": null,
      "uploadDate": null,
      "verificationStatus": "NOT_UPLOADED",
      "rejectionReason": null
    },
    "addressProof": {
      "documentUrl": null,
      "uploadDate": null,
      "verificationStatus": "NOT_UPLOADED",
      "rejectionReason": null
    },
    "isActive": true,
    "isInfluencer": false,
    "sessionTracking": {
      "lastLoginDate": null,
      "lastActivityDate": null,
      "currentSessionStartTime": null,
      "dailyLoginStreak": 0,
      "lastDailyLoginDate": null,
      "totalSessionTimeToday": 0,
      "sessionTimeUpdatedDate": null
    }
  },
  "refreshToken": "refresh_token_string",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Responses:**

**409 Conflict - Phone already registered:**
```json
{
  "success": false,
  "error": "Phone number already registered."
}
```

**500 - Invalid parameters:**
```json
{
  "success": false,
  "error": "Invalid parameters passed."
}
```

**Example:**
```bash
curl -X POST https://your-api-domain.com/api/user/ \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "countryCode": "+1",
    "phone": "1234567890",
    "name": {
      "firstName": "John",
      "lastName": "Doe"
    },
    "password": "password123",
    "dob": "1990-01-01"
  }'
```

**Notes:**
- Automatically creates a wallet for the user
- Initializes loyalty profile for the user
- Processes referral qualification if referral code is provided
- Password is automatically hashed
- Returns access token and refresh token for immediate authentication

---

## User Profile Management

### 4. Get Current User Profile

Get the current authenticated user's profile.

**Endpoint:** `GET /api/user/me`

**Authentication:** Required

**Request Parameters:** None

**Success Response (200):**
```json
{
  "success": true,
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "name": {
      "firstName": "John",
      "lastName": "Doe"
    },
    "picture": "https://s3.amazonaws.com/bucket/user_profile.jpg",
    "dob": "1990-01-01",
    "userName": "johndoe123",
    "role": "USER",
    "securePin": "hashed_pin",
    "countryCode": "+1",
    "phone": "1234567890",
    "email": "john.doe@example.com",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T00:00:00.000Z",
    "address": {
      "address1": "123 Main Street",
      "address2": "Apt 4B",
      "city": "New York",
    "state": "NY",
    "country": "United States",
      "pincode": "10001"
    },
    "sim_nif": "NIF123456",
    "bankAccount": [
      {
        "bank": "Chase Bank",
        "accountNumber": "1234567890",
        "ifsc": "CHASUS33"
      }
    ],
    "idProof": {
      "documentUrl": "https://s3.amazonaws.com/bucket/id_proof.jpg",
      "uploadDate": "2024-01-10T00:00:00.000Z",
      "verificationStatus": "VERIFIED",
      "rejectionReason": null
    },
    "addressProof": {
      "documentUrl": "https://s3.amazonaws.com/bucket/address_proof.jpg",
      "uploadDate": "2024-01-10T00:00:00.000Z",
      "verificationStatus": "PENDING",
      "rejectionReason": null
    },
    "isActive": true,
    "isInfluencer": false,
    "sessionTracking": {
      "lastLoginDate": "2024-01-15T10:00:00.000Z",
      "lastActivityDate": "2024-01-15T12:00:00.000Z",
      "currentSessionStartTime": "2024-01-15T10:00:00.000Z",
      "dailyLoginStreak": 5,
      "lastDailyLoginDate": "2024-01-15T00:00:00.000Z",
      "totalSessionTimeToday": 7200,
      "sessionTimeUpdatedDate": "2024-01-15T12:00:00.000Z"
    }
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "User not found"
}
```

**Example:**
```bash
curl -X GET https://your-api-domain.com/api/user/me \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

### 5. Update User Profile

Update the current authenticated user's profile. Supports partial updates.

**Endpoint:** `PUT /api/user/`

**Authentication:** Required

**Request Body:**

#### Update Basic Information
```json
{
  "name": {
    "firstName": "Jane",
    "lastName": "Doe"
  },
  "email": "jane.doe@example.com",
  "countryName": "United States",
  "countryISO": "US",
  "dob": "1992-05-15"
}
```

#### Update Address (Partial Update)
```json
{
  "address": {
    "address1": "456 Oak Avenue",
    "city": "Los Angeles",
    "state": "CA",
    "country": "United States",
    "pincode": "90001"
  }
}
```

#### Update Bank Accounts
```json
{
  "bankAccount": [
    {
      "bank": "Chase Bank",
      "accountNumber": "1234567890",
      "ifsc": "CHASUS33"
    },
    {
      "bank": "Bank of America",
      "accountNumber": "9876543210",
      "ifsc": "BOFAUS3N"
    }
  ]
}
```

#### Combined Update
```json
{
  "name": {
    "firstName": "Jane"
  },
  "email": "jane.doe@example.com",
  "address": {
    "city": "San Francisco",
    "state": "CA"
  },
  "bankAccount": [
    {
      "bank": "Wells Fargo",
      "accountNumber": "5555555555",
      "ifsc": "WFBIUS6S"
    }
  ],
  "sim_nif": "NIF789012",
  "picture": "https://s3.amazonaws.com/bucket/new_profile.jpg"
}
```

**Request Parameters:**

All fields are optional. Only include fields you want to update.

- `name` (Object, optional): User name
  - `firstName` (String, optional): First name
  - `lastName` (String, optional): Last name
- `email` (String, optional): Email address (must be unique if provided)
- `phone` (String, optional): Phone number (must be unique if provided)
- `countryCode` (String, optional): Country dial code
- `countryName` (String, optional): Full country name (e.g., "United States", "India")
- `countryISO` (String, optional): 2-digit ISO 3166-1 ALPHA-2 country code (e.g., "US", "IN")
- `dob` (String, optional): Date of birth
- `address` (Object, optional): Address (merges with existing address)
  - `address1` (String, optional): Primary address line
  - `address2` (String, optional): Secondary address line
  - `city` (String, optional): City
  - `state` (String, optional): 2-digit uppercase state code (e.g., "NY", "CA", "TX")
  - `country` (String, optional): Country
  - `pincode` (String, optional): Postal/ZIP code
- `bankAccount` (Array, optional): Bank accounts (replaces entire array)
  - `bank` (String, optional): Bank name
  - `accountNumber` (String, optional): Account number
  - `ifsc` (String, optional): IFSC/SWIFT code
- `sim_nif` (String, optional): SIM/NIF number
- `picture` (String, optional): Profile picture URL
- `password` (String, optional): New password (minimum 6 characters, will be hashed)
- `securePin` (String, optional): Secure PIN (will be hashed)

**Success Response (200):**
```json
{
  "success": true,
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "name": {
      "firstName": "Jane",
      "lastName": "Doe"
    },
    "picture": "https://s3.amazonaws.com/bucket/new_profile.jpg",
    "dob": "1992-05-15",
    "userName": "johndoe123",
    "role": "USER",
    "countryCode": "+1",
    "phone": "1234567890",
    "email": "jane.doe@example.com",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-16T00:00:00.000Z",
    "address": {
      "address1": "456 Oak Avenue",
      "address2": null,
      "city": "San Francisco",
      "state": "CA",
      "country": "USA",
      "pincode": "94102"
    },
    "sim_nif": "NIF789012",
    "bankAccount": [
      {
        "bank": "Wells Fargo",
        "accountNumber": "5555555555",
        "ifsc": "WFBIUS6S"
      }
    ],
    ...
  }
}
```

**Error Responses:**

**400 Bad Request:**
```json
{
  "success": false,
  "error": "Invalid parameters."
}
```

**409 Conflict:**
```json
{
  "success": false,
  "error": "Validation error details"
}
```

**Example:**
```bash
curl -X PUT https://your-api-domain.com/api/user/ \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "address": {
      "city": "Los Angeles",
      "state": "CA"
    },
    "email": "jane.doe@example.com"
  }'
```

**Notes:**
- Address fields are merged with existing address (partial updates supported)
- Name fields are merged with existing name (partial updates supported)
- Bank account array is completely replaced (include all accounts you want to keep)
- Password and securePin are automatically hashed
- Email and phone must be unique if provided

---

## Password Management

### 6. Verify Reset Password (Send OTP)

Send OTP to user's phone number for password reset.

**Endpoint:** `POST /api/user/verify-reset`

**Authentication:** Not required

**Request Body:**
```json
{
  "countryCode": "+1",
  "phone": "1234567890"
}
```

**Request Parameters:**
- `countryCode` (String, required): Country code
- `phone` (String, required): Phone number (7-10 digits)

**Success Response (200):**
```json
{
  "verificationToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Invalid phone number."
}
```

**Example:**
```bash
curl -X POST https://your-api-domain.com/api/user/verify-reset \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "countryCode": "+1",
    "phone": "1234567890"
  }'
```

---

### 7. Reset Password

Reset user password after OTP verification.

**Endpoint:** `POST /api/user/reset-password`

**Authentication:** Not required

**Request Body:**
```json
{
  "countryCode": "+1",
  "phone": "1234567890",
  "verificationToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "password": "newpassword123"
}
```

**Request Parameters:**
- `countryCode` (String, required): Country code
- `phone` (String, required): Phone number
- `verificationToken` (String, required): Token from verify-reset response
- `password` (String, required): New password (minimum 6 characters)

**Success Response (200):**
```json
{
  "success": true,
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "name": {
      "firstName": "John",
      "lastName": "Doe"
    },
    ...
  },
  "refreshToken": "refresh_token_string",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Error Responses:**

**500 - Invalid token:**
```json
{
  "success": false,
  "error": "Invalid token passed."
}
```

**500 - Token expired:**
```json
{
  "success": false,
  "error": "Signup token has expired."
}
```

**Example:**
```bash
curl -X POST https://your-api-domain.com/api/user/reset-password \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "countryCode": "+1",
    "phone": "1234567890",
    "verificationToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "password": "newpassword123"
  }'
```

**Notes:**
- Password is automatically hashed
- Returns new access token and refresh token
- Token must match the phone number provided

---

## Media & Document Upload

### 8. Get Signed URL for Media Upload

Get a pre-signed URL for uploading media files (images/videos) to S3.

**Endpoint:** `GET /api/user/media/signedurl`

**Authentication:** Required

**Query Parameters:**
- `fileType` (String, required): File extension (jpg, png, gif, webp, bmp, svg, heic, heif, mp4, mov, avi, flv, mkv, webm)

**Success Response (200):**
```json
{
  "success": true,
  "signedUrl": "https://s3.amazonaws.com/bucket/file_name.jpg?X-Amz-Algorithm=...",
  "fileName": "507f1f77bcf86cd799439011_a1b2c3d4e5f6.jpg"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Unsupported file type: xyz"
}
```

**Example:**
```bash
curl -X GET "https://your-api-domain.com/api/user/media/signedurl?fileType=jpg" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Supported File Types:**
- Images: jpg, jpeg, png, gif, webp, bmp, svg, heic, heif
- Videos: mp4, mov, avi, flv, mkv, webm

**Usage:**
1. Get signed URL from this endpoint
2. Upload file directly to S3 using the signed URL (PUT request)
3. Use the returned fileName to store in user profile

---

### 9. Get Profile Picture Signed URL

Get a pre-signed URL for viewing user's profile picture from S3.

**Endpoint:** `GET /api/user/image/self`

**Authentication:** Required

**Query Parameters:** None

**Success Response (200):**
```json
{
  "success": true,
  "signedUrl": "https://s3.amazonaws.com/bucket/507f1f77bcf86cd799439011_profile_pic.jpg?X-Amz-Algorithm=..."
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Error message"
}
```

**Example:**
```bash
curl -X GET https://your-api-domain.com/api/user/image/self \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Notes:**
- Returns a temporary signed URL (expires in 60 seconds)
- File name format: `{userId}_profile_pic.jpg`

---

### 10. Get Signed URL for Document Upload

Get a pre-signed URL for uploading verification documents (ID proof, address proof) to S3.

**Endpoint:** `GET /api/user/documents/signedurl`

**Authentication:** Required

**Query Parameters:**
- `fileType` (String, required): File extension (jpg, png, etc.)
- `documentType` (String, required): Type of document (idProof, addressProof)

**Success Response (200):**
```json
{
  "success": true,
  "signedUrl": "https://s3.amazonaws.com/bucket/file_name.jpg?X-Amz-Algorithm=...",
  "fileName": "507f1f77bcf86cd799439011_idProof.jpg"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "error": "Error message"
}
```

**Example:**
```bash
curl -X GET "https://your-api-domain.com/api/user/documents/signedurl?fileType=jpg&documentType=idProof" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Notes:**
- File name format: `{userId}_{documentType}.{fileType}`
- Document types: `idProof`, `addressProof`
- After uploading, update user profile with the document URL

---

## User Information

### 11. Get User Info (DEALER/ADMIN Only)

Get user information including wallet data. Only accessible by DEALER or ADMIN roles.

**Endpoint:** `POST /api/user/info`

**Authentication:** Required (DEALER or ADMIN role)

**Request Body:**
```json
{
  "userPhone": "1234567890",
  "countryCode": "+1"
}
```

**Request Parameters:**
- `userPhone` (String, required): Phone number of the user to look up
- `countryCode` (String, required): Country code of the user

**Success Response (200):**
```json
{
  "success": true,
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "name": {
      "firstName": "John",
      "lastName": "Doe"
    },
    ...
  },
  "walletData": {
    "realBalance": 1000.50,
    "virtualBalance": 500.25
  }
}
```

**Error Responses:**

**500 - Unauthorized:**
```json
{
  "success": false,
  "error": "You are not authorized to perform this action."
}
```

**500 - User not found:**
```json
{
  "success": false,
  "error": "Invalid user."
}
```

**Example:**
```bash
curl -X POST https://your-api-domain.com/api/user/info \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "userPhone": "1234567890",
    "countryCode": "+1"
  }'
```

---

### 12. Verify Secure PIN

Verify user's secure PIN. Account is blocked after 3 failed attempts.

**Endpoint:** `POST /api/user/verify/pin`

**Authentication:** Required

**Request Body:**
```json
{
  "securePin": "1234"
}
```

**Request Parameters:**
- `securePin` (String, required): Secure PIN to verify

**Success Response (200):**
```json
{
  "success": true
}
```

**Error Responses:**

**403 - Invalid PIN (1-2 attempts):**
```json
{
  "success": false,
  "error": "Invalid secure pin. You have 2 attempt left."
}
```

**403 - Account Blocked (3+ attempts):**
```json
{
  "success": false,
  "error": "Invalid secure pin. Your account has been blocked due to 3 failed attempts. Please contact MegaPay support."
}
```

**Example:**
```bash
curl -X POST https://your-api-domain.com/api/user/verify/pin \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "securePin": "1234"
  }'
```

**Notes:**
- Account is blocked after 3 failed attempts
- Contact support to unblock account
- Failed attempts are tracked per user session

---

## Data Models

### User Model

```typescript
{
  _id: ObjectId,
  countryCode: String, // Required, dial code e.g., "+1"
  countryName: String, // Optional, full country name e.g., "United States"
  countryISO: String, // Optional, 2-digit ISO 3166-1 ALPHA-2 code e.g., "US"
  phone: String, // Required, unique, 7-10 digits
  email: String, // Optional, unique, valid email format
  slugName: String, // Auto-generated from name
  userName: String, // Auto-generated unique username
  dob: String, // Required, date of birth
  refferalCode: String, // Optional, referral code
  password: String, // Required, hashed, min 6 characters
  securePin: String, // Optional, hashed
  name: {
    firstName: String, // Required
    lastName: String // Required
  },
  address: {
    address1: String, // Optional
    address2: String, // Optional
    city: String, // Optional
    state: String, // Optional, 2-digit uppercase code (e.g., "NY", "CA")
    country: String, // Optional
    pincode: String // Optional
  },
  sim_nif: String, // Optional
  bankAccount: [ // Array of bank accounts
    {
      bank: String, // Optional
      accountNumber: String, // Optional
      ifsc: String // Optional
    }
  ],
  picture: String, // Optional, profile picture URL
  role: String, // Enum: 'USER', 'ADMIN', 'DEALER', 'AGENT', 'SYSTEM', default: 'USER'
  isActive: Boolean, // Default: true
  isInfluencer: Boolean, // Default: false
  influencerContractId: ObjectId, // Optional
  idProof: {
    documentUrl: String, // Optional
    uploadDate: Date, // Optional
    verificationStatus: String, // Enum: 'NOT_UPLOADED', 'PENDING', 'VERIFIED', 'REJECTED'
    rejectionReason: String // Optional
  },
  addressProof: {
    documentUrl: String, // Optional
    uploadDate: Date, // Optional
    verificationStatus: String, // Enum: 'NOT_UPLOADED', 'PENDING', 'VERIFIED', 'REJECTED'
    rejectionReason: String // Optional
  },
  sessionTracking: {
    lastLoginDate: Date, // Optional
    lastActivityDate: Date, // Optional
    currentSessionStartTime: Date, // Optional
    dailyLoginStreak: Number, // Default: 0
    lastDailyLoginDate: Date, // Optional
    totalSessionTimeToday: Number, // Default: 0, in seconds
    sessionTimeUpdatedDate: Date // Optional
  },
  createdAt: Date, // Auto-generated
  updatedAt: Date // Auto-generated
}
```

---

## Error Handling

### Common Error Responses

#### 400 Bad Request
```json
{
  "success": false,
  "error": "Invalid parameters."
}
```

**Common 400 errors:**
- Invalid state code format (must be 2-digit uppercase code like "NY", "CA")
- Invalid registration details
- Password too short (minimum 6 characters)

#### 401 Unauthorized
```
401 Unauthorized
```
- Missing or invalid authentication token
- Token expired

#### 403 Forbidden
```json
{
  "success": false,
  "error": "Your account has been blocked due to 3 failed attempts. Please contact MegaPay support."
}
```
- Account blocked after multiple failed PIN attempts
- Insufficient permissions

#### 404 Not Found
```json
{
  "success": false,
  "error": "User not found"
}
```

#### 409 Conflict
```json
{
  "success": false,
  "error": "Phone number already registered."
}
```
- Duplicate phone number or email
- Validation errors

#### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Error message"
}
```
- Server errors
- Database errors
- Validation errors

---

## Best Practices

### Address Updates
- Use partial updates for address fields
- Only include fields you want to update
- Existing fields are preserved if not included
- State code must be a 2-digit uppercase code (e.g., "NY", "CA", "TX")

### Bank Account Management
1. Get current profile: `GET /api/user/me`
2. Read current `bankAccount` array
3. Modify the array (add/update/remove)
4. Send complete array in update request
5. Verify changes: `GET /api/user/me`

### File Uploads
1. Get signed URL from API
2. Upload file directly to S3 using signed URL (PUT request)
3. Update user profile with file URL
4. For profile pictures, use the returned fileName

### Error Handling
- Always check the `success` field in responses
- Handle 401 errors by refreshing tokens
- Handle 403 errors for blocked accounts
- Validate input before sending requests

### Security
- Never send passwords or PINs in plain text (handled automatically)
- Store access tokens securely
- Use HTTPS for all API calls
- Implement token refresh mechanism

---

## Rate Limiting

- OTP endpoints: Rate limited to prevent abuse
- PIN verification: Maximum 3 attempts before account block
- File uploads: Rate limited per user

---

## Support

For API support or questions, please contact the development team or refer to the main API documentation.

---

## Changelog

### Version 1.0.0
- Initial API documentation
- User registration and authentication
- Profile management
- Password reset
- Media and document upload
- Secure PIN verification
- Address and bank account management

