# Admin Transaction Management API Documentation

Complete API documentation for admin-only transaction management, analytics, and reporting endpoints.

## Table of Contents

1. [Base URL](#base-url)
2. [Authentication](#authentication)
3. [Commission Management](#commission-management)
4. [Analytics & Reports](#analytics--reports)
5. [Error Handling](#error-handling)

---

## Base URL

All endpoints are prefixed with `/api/admin/transaction-management`

```
Base URL: https://your-api-domain.com/api/admin/transaction-management
```

---

## Authentication

All endpoints require ADMIN role authentication using a Bearer token in the Authorization header.

### Headers Required

```
Content-Type: application/json
x-api-key: YOUR_API_KEY
Authorization: Bearer YOUR_ACCESS_TOKEN
```

### Role Requirements

- **ADMIN**: Full access to all endpoints
- **AGENT/DEALER/USER**: No access (403 Forbidden)

---

## Commission Management

### 1. Get Commission Summary by Agent

Get detailed commission summary for agents, including game breakdowns and volume statistics. This endpoint provides comprehensive insights into agent performance across all game types.

**Endpoint:** `GET /api/admin/transaction-management/commission/summary`

**Authentication:** Required (ADMIN role only)

**Query Parameters:**
- `agentId` (String, optional): Specific agent ID to filter (if not provided, returns all agents)
- `startDate` (String, optional): Start date for date range filter (ISO 8601 format, e.g., `2024-01-01`)
- `endDate` (String, optional): End date for date range filter (ISO 8601 format, e.g., `2024-01-31`)

**Success Response (200):**
```json
{
  "success": true,
  "summary": {
    "totalTransactions": 500,
    "totalCommissionEarned": 1500.75,
    "totalCommissionEarnedReal": 1000.50,
    "totalCommissionEarnedVirtual": 500.25,
    "totalVolume": 50000.00,
    "totalVolumeReal": 30000.00,
    "totalVolumeVirtual": 20000.00,
    "gameBreakdown": {
      "borlette": {
        "volume": 20000.00,
        "volumeReal": 12000.00,
        "volumeVirtual": 8000.00,
        "commission": 600.00,
        "commissionReal": 400.00,
        "commissionVirtual": 200.00,
        "count": 200
      },
      "megamillion": {
        "volume": 15000.00,
        "volumeReal": 9000.00,
        "volumeVirtual": 6000.00,
        "commission": 450.00,
        "commissionReal": 300.00,
        "commissionVirtual": 150.00,
        "count": 150
      },
      "domino": {
        "volume": 10000.00,
        "volumeReal": 6000.00,
        "volumeVirtual": 4000.00,
        "commission": 300.00,
        "commissionReal": 200.00,
        "commissionVirtual": 100.00,
        "count": 100
      },
      "roulette": {
        "volume": 5000.00,
        "volumeReal": 3000.00,
        "volumeVirtual": 2000.00,
        "commission": 150.75,
        "commissionReal": 100.50,
        "commissionVirtual": 50.25,
        "count": 50
      }
    }
  },
  "transactions": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "user": {
        "_id": "507f1f77bcf86cd799439011",
        "name": {
          "firstName": "John",
          "lastName": "Doe"
        },
        "phone": "1234567890"
      },
      "cashType": "REAL",
      "transactionType": "CREDIT",
      "transactionIdentifier": "TICKET_BORLETTE_COMMISSION",
      "transactionAmount": 15.00,
      "status": "COMPLETED",
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

**Response Fields:**
- `totalTransactions`: Total number of transactions in the period
- `totalCommissionEarned`: Total commission earned (all cash types)
- `totalCommissionEarnedReal`: Total commission earned in REAL cash
- `totalCommissionEarnedVirtual`: Total commission earned in VIRTUAL cash
- `totalVolume`: Total transaction volume (all cash types)
- `totalVolumeReal`: Total transaction volume in REAL cash
- `totalVolumeVirtual`: Total transaction volume in VIRTUAL cash
- `gameBreakdown`: Detailed breakdown by game type with volume, commission, and count

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to get commission summary"
}
```

**Example:**
```bash
curl -X GET "https://your-api-domain.com/api/admin/transaction-management/commission/summary?agentId=507f1f77bcf86cd799439011&startDate=2024-01-01&endDate=2024-01-31" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Notes:**
- Only accessible by ADMIN users
- Includes detailed breakdown by game type (Borlette, MegaMillion, Domino, Roulette)
- Separates REAL and VIRTUAL cash types for accurate reporting
- Includes both commission and volume statistics
- Returns full transaction list for detailed analysis
- If `agentId` is not provided, returns summary for all agents

---

## Analytics & Reports

### 2. Get Tier-Based Payout Analytics

Get comprehensive analytics on tier-based payout configurations and their impact on revenue. This endpoint helps administrators understand how different loyalty tiers affect payout percentages and profitability.

**Endpoint:** `GET /api/admin/transaction-management/analytics/tier-payouts`

**Authentication:** Required (ADMIN role only)

**Query Parameters:**
- `startDate` (String, optional): Start date for date range filter (ISO 8601 format)
- `endDate` (String, optional): End date for date range filter (ISO 8601 format)
- `tier` (String, optional): Filter by specific tier (e.g., `BRONZE`, `SILVER`, `GOLD`, `VIP`)
- `gameType` (String, optional): Filter by game type (currently supports Borlette)

**Success Response (200):**
```json
{
  "success": true,
  "analytics": {
    "tierStatistics": [
      {
        "_id": {
          "tier": "BRONZE",
          "payoutPercentage": 70,
          "isCustom": false
        },
        "totalTickets": 1000,
        "totalAmountPlayed": 50000.00,
        "totalAmountWon": 35000.00,
        "avgAmountPlayed": 50.00,
        "avgAmountWon": 35.00,
        "winningTickets": 200,
        "winRate": 20.0,
        "profitMargin": 30.0
      },
      {
        "_id": {
          "tier": "SILVER",
          "payoutPercentage": 75,
          "isCustom": false
        },
        "totalTickets": 500,
        "totalAmountPlayed": 25000.00,
        "totalAmountWon": 18750.00,
        "avgAmountPlayed": 50.00,
        "avgAmountWon": 37.50,
        "winningTickets": 125,
        "winRate": 25.0,
        "profitMargin": 25.0
      }
    ],
    "dailyTierPerformance": [
      {
        "_id": {
          "date": "2024-01-15",
          "tier": "BRONZE"
        },
        "totalTickets": 50,
        "totalAmountPlayed": 2500.00,
        "totalAmountWon": 1750.00
      },
      {
        "_id": {
          "date": "2024-01-15",
          "tier": "SILVER"
        },
        "totalTickets": 25,
        "totalAmountPlayed": 1250.00,
        "totalAmountWon": 937.50
      }
    ],
    "configurationUsage": [
      {
        "_id": {
          "tier": "BRONZE",
          "gameType": "BORLETTE",
          "percentage": 70
        },
        "usageCount": 500,
        "isPromotional": false,
        "description": "Standard bronze tier payout"
      }
    ],
    "overallImpact": {
      "totalRevenue": 500000.00,
      "totalPayouts": 350000.00,
      "totalTickets": 10000,
      "avgPayoutPercentageUsed": 72.5,
      "overallProfitMargin": 30.0
    },
    "dateRange": {
      "startDate": "2024-01-01",
      "endDate": "2024-01-31"
    }
  }
}
```

**Response Fields:**
- `tierStatistics`: Aggregated statistics by tier, showing payout percentages, ticket counts, amounts, win rates, and profit margins
- `dailyTierPerformance`: Daily breakdown of performance by tier
- `configurationUsage`: Usage statistics for different payout configurations
- `overallImpact`: Overall revenue, payouts, and profit margin across all tiers
- `dateRange`: The date range used for the analysis

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to retrieve analytics"
}
```

**Example:**
```bash
curl -X GET "https://your-api-domain.com/api/admin/transaction-management/analytics/tier-payouts?startDate=2024-01-01&endDate=2024-01-31&tier=BRONZE" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Notes:**
- Only accessible by ADMIN users
- Provides insights into tier-based payout effectiveness
- Includes win rates, profit margins, and payout percentage analysis
- Shows daily performance trends for better understanding
- Helps optimize tier configurations for maximum profitability
- Currently focuses on Borlette tickets, but can be extended to other game types

---

### 3. Get Revenue Impact Comparison

Compare revenue metrics before and after tier-based payout implementation. This endpoint helps evaluate the business impact of introducing tier-based payouts.

**Endpoint:** `GET /api/admin/transaction-management/analytics/revenue-impact`

**Authentication:** Required (ADMIN role only)

**Query Parameters:** None (uses predefined tier implementation date)

**Success Response (200):**
```json
{
  "success": true,
  "comparison": {
    "beforeTierImplementation": {
      "totalTickets": 5000,
      "totalRevenue": 250000.00,
      "totalPayouts": 187500.00,
      "avgTicketValue": 50.00,
      "profitMargin": 25.0
    },
    "afterTierImplementation": {
      "totalTickets": 10000,
      "totalRevenue": 500000.00,
      "totalPayouts": 350000.00,
      "avgTicketValue": 50.00,
      "profitMargin": 30.0
    },
    "impact": {
      "revenueChange": {
        "absolute": 250000.00,
        "percentage": 100.0
      },
      "payoutChange": {
        "absolute": 162500.00,
        "percentage": 86.67
      },
      "profitMarginChange": {
        "absolute": 5.0,
        "beforeMargin": 25.0,
        "afterMargin": 30.0
      }
    },
    "implementationDate": "2024-01-01T00:00:00.000Z"
  }
}
```

**Response Fields:**
- `beforeTierImplementation`: Statistics from before tier-based payouts were implemented
- `afterTierImplementation`: Statistics from after tier-based payouts were implemented
- `impact`: Calculated changes showing absolute and percentage differences
  - `revenueChange`: Change in total revenue
  - `payoutChange`: Change in total payouts
  - `profitMarginChange`: Change in profit margin
- `implementationDate`: The date when tier-based payouts were implemented

**Error Response (500):**
```json
{
  "success": false,
  "error": "Failed to retrieve impact comparison"
}
```

**Example:**
```bash
curl -X GET "https://your-api-domain.com/api/admin/transaction-management/analytics/revenue-impact" \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Notes:**
- Only accessible by ADMIN users
- Compares metrics before and after tier implementation
- Shows absolute and percentage changes for easy analysis
- Helps evaluate the effectiveness of tier-based payouts
- The tier implementation date is currently hardcoded (2024-01-01) but can be made configurable
- Useful for business reporting and decision-making

---

## Error Handling

### Common Error Responses

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
  "error": "You are not authorized to view analytics data."
}
```
- User does not have ADMIN role
- Insufficient permissions

#### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Error message describing the issue"
}
```

**Common 500 errors:**
- Database errors
- Query execution failures
- Data processing errors
- Invalid date formats

---

## Best Practices

### Query Optimization

1. **Date Ranges**: Always specify date ranges for commission summaries to limit query scope
2. **Agent Filtering**: Use `agentId` parameter to focus on specific agents when needed
3. **Caching**: Consider caching analytics results for frequently accessed date ranges
4. **Pagination**: For large transaction lists, implement client-side pagination

### Analytics Usage

1. **Regular Monitoring**: Run tier-based payout analytics regularly to monitor performance
2. **Trend Analysis**: Use daily tier performance data to identify trends
3. **Configuration Optimization**: Use analytics to optimize payout configurations
4. **Impact Evaluation**: Regularly run revenue impact comparisons to assess business changes

### Security

1. **Role-Based Access**: All endpoints strictly require ADMIN role
2. **Token Management**: Store and refresh tokens securely
3. **HTTPS**: Always use HTTPS for API calls
4. **Data Privacy**: Be mindful of sensitive financial data in responses

---

## Rate Limiting

- Analytics endpoints are rate-limited to prevent abuse
- Commission summary endpoints have moderate rate limits
- Contact support for higher rate limits if needed for reporting purposes

---

## Support

For API support or questions, please contact the development team or refer to the main API documentation.

---

## Related Documentation

- [Transaction API Documentation](../transaction/README.md) - For general transaction endpoints
- [Admin User Management API Documentation](../user-management/README.md) - For user management
- [Admin Tier Management API Documentation](../tier-management/README.md) - For tier configuration

---

## Changelog

### Version 1.0.0
- Initial API documentation
- Commission summary by agent
- Tier-based payout analytics
- Revenue impact comparison
- Admin-only access control
