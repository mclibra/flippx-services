# Admin Application Dashboard API

## Overview

The Admin Application Dashboard endpoint provides a comprehensive overview of the entire application with all monetary information separated into **Real** and **Virtual** categories.

## Endpoint

```
GET /api/admin/lottery-management/application-dashboard
```

## Authentication

- **Required**: Yes
- **Role**: ADMIN only
- **Headers**:
  - `x-api-key`: API key
  - `Authorization`: Bearer token with ADMIN role

## Request

### Method
`GET`

### Headers
```http
x-api-key: your-api-key
Authorization: Bearer your-jwt-token
```

### Query Parameters
None

### Example Request
```bash
curl -X GET \
  'https://api.example.com/api/admin/lottery-management/application-dashboard' \
  -H 'x-api-key: your-api-key' \
  -H 'Authorization: Bearer your-jwt-token'
```

## Response

### Success Response (200 OK)

```json
{
  "status": 200,
  "entity": {
    "success": true,
    "dashboard": {
      "users": {
        "total": 1500,
        "active": 850,
        "newUsers": {
          "today": 12,
          "thisWeek": 85,
          "thisMonth": 320
        },
        "loyaltyTierDistribution": [
          {
            "tier": "BRONZE",
            "count": 450
          },
          {
            "tier": "SILVER",
            "count": 600
          },
          {
            "tier": "GOLD",
            "count": 350
          },
          {
            "tier": "VIP",
            "count": 100
          }
        ]
      },
      "wallets": {
        "real": {
          "withdrawable": 125000.50,
          "nonWithdrawable": 45000.25,
          "total": 170000.75,
          "pendingWithdrawals": 5000.00
        },
        "virtual": {
          "total": 2500000.00
        },
        "totalWallets": 1500
      },
      "financial": {
        "real": {
          "deposits": {
            "total": 500000.00,
            "today": 2500.00,
            "thisWeek": 15000.00,
            "thisMonth": 75000.00
          },
          "withdrawals": {
            "total": 200000.00,
            "today": 1000.00,
            "thisWeek": 5000.00,
            "thisMonth": 25000.00
          },
          "revenue": {
            "total": 300000.00,
            "lottery": 150000.00,
            "roulette": 100000.00,
            "domino": 50000.00
          },
          "payouts": {
            "total": 180000.00,
            "lottery": 100000.00,
            "roulette": 80000.00
          },
          "profit": {
            "total": 120000.00,
            "margin": "40.00"
          },
          "transactions": {
            "credits": 500000.00,
            "debits": 300000.00,
            "net": 200000.00,
            "count": 5000
          }
        },
        "virtual": {
          "deposits": {
            "total": 2000000.00,
            "today": 10000.00,
            "thisWeek": 60000.00,
            "thisMonth": 300000.00
          },
          "revenue": {
            "total": 1500000.00,
            "lottery": 800000.00,
            "roulette": 500000.00,
            "domino": 200000.00
          },
          "payouts": {
            "total": 900000.00,
            "lottery": 500000.00,
            "roulette": 400000.00
          },
          "profit": {
            "total": 600000.00,
            "margin": "40.00"
          },
          "transactions": {
            "credits": 2000000.00,
            "debits": 1500000.00,
            "net": 500000.00,
            "count": 15000
          }
        }
      },
      "games": {
        "lottery": {
          "total": 150,
          "scheduled": 25,
          "completed": 125,
          "borlette": {
            "totalPlayed": 950000.00,
            "totalWon": 600000.00,
            "ticketCount": 5000,
            "real": {
              "revenue": 150000.00,
              "winnings": 100000.00,
              "ticketCount": 1000
            },
            "virtual": {
              "revenue": 800000.00,
              "winnings": 500000.00,
              "ticketCount": 4000
            }
          },
          "megaMillion": {
            "totalPlayed": 500000.00,
            "totalWon": 300000.00,
            "ticketCount": 2000,
            "real": {
              "revenue": 100000.00,
              "winnings": 60000.00,
              "ticketCount": 500
            },
            "virtual": {
              "revenue": 400000.00,
              "winnings": 240000.00,
              "ticketCount": 1500
            }
          }
        },
        "roulette": {
          "real": {
            "revenue": 100000.00,
            "payouts": 80000.00,
            "profit": 20000.00,
            "ticketCount": 2000
          },
          "virtual": {
            "revenue": 500000.00,
            "payouts": 400000.00,
            "profit": 100000.00,
            "ticketCount": 10000
          },
          "total": {
            "revenue": 600000.00,
            "payouts": 480000.00,
            "profit": 120000.00,
            "ticketCount": 12000
          }
        },
        "domino": {
          "real": {
            "revenue": 50000.00,
            "roomCount": 500
          },
          "virtual": {
            "revenue": 200000.00,
            "roomCount": 2000
          },
          "total": {
            "revenue": 250000.00,
            "roomCount": 2500,
            "gameCount": 10000
          }
        }
      },
      "summary": {
        "totalUsers": 1500,
        "activeUsers": 850,
        "real": {
          "revenue": 300000.00,
          "payout": 180000.00,
          "profit": 120000.00,
          "profitMargin": "40.00"
        },
        "virtual": {
          "revenue": 1500000.00,
          "payout": 900000.00,
          "profit": 600000.00,
          "profitMargin": "40.00"
        },
        "total": {
          "revenue": 1800000.00,
          "payout": 1080000.00,
          "profit": 720000.00,
          "profitMargin": "40.00"
        }
      }
    }
  }
}
```

### Error Responses

#### Unauthorized (403)
```json
{
  "status": 403,
  "entity": {
    "success": false,
    "error": "Unauthorized access"
  }
}
```

#### Server Error (500)
```json
{
  "status": 500,
  "entity": {
    "success": false,
    "error": "Error message"
  }
}
```

## Response Structure

### Users Section
- **total**: Total number of users
- **active**: Users active in last 30 days
- **newUsers**: New user registrations
  - **today**: New users today
  - **thisWeek**: New users this week
  - **thisMonth**: New users this month
- **loyaltyTierDistribution**: Distribution of users across loyalty tiers

### Wallets Section
- **real**: Real cash wallet balances
  - **withdrawable**: Withdrawable real balance
  - **nonWithdrawable**: Non-withdrawable real balance
  - **total**: Total real balance
  - **pendingWithdrawals**: Pending withdrawal requests
- **virtual**: Virtual cash wallet balances
  - **total**: Total virtual balance
- **totalWallets**: Total number of wallets

### Financial Section

#### Real Cash Financials
- **deposits**: Real cash deposits (total, today, thisWeek, thisMonth)
- **withdrawals**: Real cash withdrawals (total, today, thisWeek, thisMonth)
- **revenue**: Real cash revenue by game type
  - **total**: Total real revenue
  - **lottery**: Real lottery revenue
  - **roulette**: Real roulette revenue
  - **domino**: Real domino revenue
- **payouts**: Real cash payouts/winnings
  - **total**: Total real payouts
  - **lottery**: Real lottery winnings
  - **roulette**: Real roulette winnings
- **profit**: Real cash profit
  - **total**: Total real profit
  - **margin**: Profit margin percentage
- **transactions**: Real cash transaction summary
  - **credits**: Total credits
  - **debits**: Total debits
  - **net**: Net transaction amount
  - **count**: Total transaction count

#### Virtual Cash Financials
- **deposits**: Virtual cash deposits (total, today, thisWeek, thisMonth)
- **revenue**: Virtual cash revenue by game type
  - **total**: Total virtual revenue
  - **lottery**: Virtual lottery revenue
  - **roulette**: Virtual roulette revenue
  - **domino**: Virtual domino revenue
- **payouts**: Virtual cash payouts/winnings
  - **total**: Total virtual payouts
  - **lottery**: Virtual lottery winnings
  - **roulette**: Virtual roulette winnings
- **profit**: Virtual cash profit
  - **total**: Total virtual profit
  - **margin**: Profit margin percentage
- **transactions**: Virtual cash transaction summary
  - **credits**: Total credits
  - **debits**: Total debits
  - **net**: Net transaction amount
  - **count**: Total transaction count

### Games Section

#### Lottery
- **total**: Total lotteries
- **scheduled**: Scheduled lotteries
- **completed**: Completed lotteries
- **borlette**: Borlette lottery statistics
  - **totalPlayed**: Total amount played (all cash types)
  - **totalWon**: Total amount won (all cash types)
  - **ticketCount**: Total ticket count (all cash types)
  - **real**: Real cash statistics
  - **virtual**: Virtual cash statistics
- **megaMillion**: MegaMillion lottery statistics
  - Same structure as borlette

#### Roulette
- **real**: Real cash roulette statistics
- **virtual**: Virtual cash roulette statistics
- **total**: Combined statistics

#### Domino
- **real**: Real cash domino statistics
- **virtual**: Virtual cash domino statistics
- **total**: Combined statistics

### Summary Section
- **totalUsers**: Total number of users
- **activeUsers**: Active users count
- **real**: Real cash summary
  - **revenue**: Total real cash revenue
  - **payout**: Total real cash payouts
  - **profit**: Total real cash profit
  - **profitMargin**: Real cash profit margin percentage
- **virtual**: Virtual cash summary
  - **revenue**: Total virtual cash revenue
  - **payout**: Total virtual cash payouts
  - **profit**: Total virtual cash profit
  - **profitMargin**: Virtual cash profit margin percentage
- **total**: Combined summary (real + virtual)
  - **revenue**: Combined real + virtual revenue
  - **payout**: Combined real + virtual payouts
  - **profit**: Combined real + virtual profit
  - **profitMargin**: Overall profit margin percentage

## Notes

1. All monetary values are in the application's base currency (typically USD)
2. Real cash withdrawals are only available for real cash (virtual cash cannot be withdrawn)
3. Profit margin is calculated as: `(Profit / Revenue) * 100`
4. All statistics are calculated from completed transactions only
5. Periodic stats (today, this week, this month) use the server's timezone
6. Lottery statistics only include completed lotteries
7. Game statistics are separated by cash type (Real/Virtual) for accurate financial tracking

## Implementation Details

- Endpoint uses MongoDB aggregation pipelines for efficient data retrieval
- All monetary calculations are performed server-side to ensure accuracy
- Statistics are calculated in real-time from the database
- The endpoint requires ADMIN role authentication for security
