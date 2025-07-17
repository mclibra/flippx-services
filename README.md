# FlippX Platform API

A comprehensive online platform featuring lottery games, casino games, and skill-based games with real-time gameplay, dual cash systems, and loyalty rewards.

## 🎮 Overview

This Node.js/Express.js API service powers a multi-state gaming platform that offers:
- **Lottery Games**: Borlette (Pick 3/4), Mega Million
- **Casino Games**: Roulette with real-time betting
- **Skill Games**: Domino tournaments and competitions
- **Dual Cash System**: Real cash (withdrawable/non-withdrawable) and virtual cash
- **Loyalty Program**: Tier-based rewards (NONE, SILVER, GOLD, VIP) with XP system
- **Multi-state Support**: Different lottery configurations per state
- **Real-time Features**: Live game updates via Socket.io

## 🏗️ Architecture

```
src/
├── api/                          # API endpoints and controllers
│   ├── admin/                   # Admin management modules
│   │   ├── tier-management/     # Loyalty tier configuration
│   │   ├── user-management/     # User administration
│   │   └── state-management/    # State configuration
│   ├── lottery/                 # Lottery game logic
│   ├── borlette_ticket/         # Borlette ticket management
│   ├── megamillion_ticket/      # Mega Million ticket management
│   ├── roulette/                # Roulette game logic
│   ├── roulette_ticket/         # Roulette betting
│   ├── domino/                  # Domino game management
│   ├── wallet/                  # Wallet and balance operations
│   ├── transaction/             # Transaction processing
│   ├── user/                    # User management
│   ├── oauth/                   # Authentication
│   ├── plan/                    # Payment plans
│   ├── loyalty/                 # Loyalty and rewards
│   └── payout_config/           # Payout configuration
├── services/                    # Business logic services
│   ├── express/                 # Express.js configuration
│   ├── mongoose/                # MongoDB connection
│   ├── passport/                # Authentication strategies
│   ├── socket/                  # Real-time communication
│   ├── cron/                    # Automated tasks
│   ├── tier/                    # Tier management service
│   ├── lottery/                 # Lottery processing
│   └── migrations/              # Database migrations
└── seedDb.js                    # Database seeding
```

## 🚀 Tech Stack

### **Backend Framework**
- **Node.js** with **Express.js** 4.16.2
- **MongoDB** with **Mongoose** 5.1.0
- **Socket.io** 4.8.1 for real-time features

### **Authentication & Security**
- **JWT** (jsonwebtoken 8.1.0) for token-based authentication
- **Passport.js** with multiple strategies (Local, Bearer, API Key)
- **bcryptjs** for password hashing
- Role-based access control (USER, AGENT, DEALER, ADMIN, SYSTEM)

### **Key Dependencies**
- **moment-timezone** 0.5.48 - Date/time management
- **node-cron** 4.0.3 - Automated lottery scheduling
- **aws-sdk** 2.579.0 - AWS integration
- **plivo** 4.1.3 - SMS notifications
- **request-promise** 4.2.2 - HTTP requests
- **pm2** 5.3.0 - Process management

### **Development Tools**
- **Babel** 7.x for ES6+ transpilation
- **ESLint** with Prettier for code formatting
- **Nodemon** for development

## 🎯 Core Features

### **Gaming Systems**
1. **Lottery Games**
   - Borlette (Pick 3/4) with marriage number support
   - Mega Million with jackpot system
   - State-specific configurations
   - Automated draw scheduling and result publishing

2. **Casino Games**
   - Real-time Roulette with multiple betting options
   - Live spin scheduling and result calculation
   - Interactive betting interface

3. **Skill Games**
   - Domino tournaments with entry fees
   - Competitive gameplay with rankings
   - Prize pool distribution

### **Financial System**
- **Dual Cash System**: Real cash (withdrawable/non-withdrawable) and virtual cash
- **Secure Transactions**: Comprehensive transaction logging and validation
- **Payment Integration**: Multiple payment gateways support
- **Withdrawal Management**: Bank account integration with admin approval
- **Commission System**: Multi-level referral commissions

### **Loyalty Program**
- **Tier System**: NONE → SILVER → GOLD → VIP progression
- **XP System**: Experience points for gameplay activities
- **Tier Benefits**: Increased payouts, exclusive features, commission bonuses
- **Configurable Requirements**: Admin-configurable tier advancement requirements

### **Administration**
- **User Management**: Account creation, verification, status management
- **Game Configuration**: Lottery restrictions, payout percentages
- **Financial Oversight**: Transaction monitoring, withdrawal approval
- **Analytics Dashboard**: Revenue tracking, player statistics

## 🔐 Authentication & Authorization

### **Authentication Methods**
```javascript
// JWT Token Authentication
Authorization: Bearer <jwt_token>

// API Key Authentication
x-api-key: <api_key>

// Local Authentication (Login)
POST /api/oauth
{
  "phone": "+1234567890",
  "password": "userpassword",
  "countryCode": "+1"
}
```

### **User Roles**
- **USER**: Standard player access
- **AGENT**: User management, transaction processing
- **DEALER**: Advanced user operations
- **ADMIN**: Full system administration
- **SYSTEM**: Automated system operations

## 📡 API Endpoints

### **Authentication**
```
POST   /api/oauth                 # User login
GET    /api/oauth/token           # Token validation
```

### **User Management**
```
GET    /api/user                  # Get user profile
PUT    /api/user/:id              # Update user profile
POST   /api/user/verify           # Phone verification
POST   /api/user/reset-password   # Password reset
```

### **Wallet Operations**
```
GET    /api/wallet                # Get wallet balance
POST   /api/wallet/deposit        # Deposit funds
POST   /api/wallet/withdraw       # Withdraw funds
GET    /api/wallet/transactions   # Transaction history
```

### **Lottery Games**
```
GET    /api/lottery               # List lotteries
GET    /api/lottery/next          # Next lottery info
GET    /api/lottery/last          # Last lottery results
POST   /api/ticket/borlette       # Place Borlette bet
POST   /api/ticket/megamillion    # Place Mega Million bet
```

### **Casino Games**
```
GET    /api/roulette              # Active roulette games
POST   /api/roulette-ticket       # Place roulette bet
GET    /api/roulette/:id/results  # Game results
```

### **Loyalty System**
```
GET    /api/loyalty/profile       # User loyalty status
GET    /api/loyalty/rewards       # Available rewards
POST   /api/loyalty/redeem        # Redeem rewards
```

### **Admin Endpoints**
```
GET    /api/admin/users           # User management
PUT    /api/admin/users/:id       # Update user
GET    /api/admin/tiers           # Tier management
POST   /api/admin/tiers           # Create/update tiers
GET    /api/admin/states          # State management
POST   /api/payout-config         # Payout configuration
```

## 💾 Database Models

### **User Model**
```javascript
{
  _id: ObjectId,
  phone: String,
  countryCode: String,
  password: String (hashed),
  role: Enum['USER', 'AGENT', 'DEALER', 'ADMIN', 'SYSTEM'],
  isActive: Boolean,
  loyaltyTier: Enum['NONE', 'SILVER', 'GOLD', 'VIP'],
  xpPoints: Number,
  verification: {
    phoneVerified: Boolean,
    idProof: { status: String, document: String },
    addressProof: { status: String, document: String }
  },
  createdAt: Date,
  updatedAt: Date
}
```

### **Wallet Model**
```javascript
{
  _id: ObjectId,
  user: ObjectId (ref: User),
  virtualBalance: Number,
  realBalanceWithdrawable: Number,
  realBalanceNonWithdrawable: Number,
  pendingWithdrawals: Number,
  active: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### **Transaction Model**
```javascript
{
  _id: ObjectId,
  user: ObjectId (ref: User),
  cashType: Enum['REAL', 'VIRTUAL'],
  transactionType: Enum['CREDIT', 'DEBIT', 'PENDING_DEBIT', 'COMPLETED_DEBIT'],
  transactionIdentifier: String,
  transactionAmount: Number,
  previousBalance: Number,
  newBalance: Number,
  referenceIndex: String,
  transactionData: Object,
  status: Enum['PENDING', 'COMPLETED', 'CANCELLED'],
  createdAt: Date
}
```

### **Lottery Model**
```javascript
{
  _id: ObjectId,
  title: String,
  type: Enum['BORLETTE', 'MEGAMILLION'],
  state: ObjectId (ref: State),
  scheduledTime: Number,
  drawTime: Number,
  status: Enum['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
  results: {
    numbers: [String],
    megaBall: String,
    jackpotAmount: Number
  },
  metadata: String,
  externalGameIds: Object,
  createdAt: Date,
  updatedAt: Date
}
```

## 🛠️ Installation & Setup

### **Prerequisites**
- Node.js 14+ and npm
- MongoDB 4.0+
- Redis (for session management)

### **Environment Variables**
Create a `.env` file in the root directory:
```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/gaming_platform
JWT_SECRET=your_jwt_secret_here
X_API_KEY=your_api_key_here

# AWS Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1

# SMS Configuration (Plivo)
PLIVO_AUTH_ID=your_plivo_auth_id
PLIVO_AUTH_TOKEN=your_plivo_auth_token

# Admin Configuration
ADMIN_PHONE=+1234567890
ADMIN_PASSWORD=admin_password
ADMIN_COUNTRY_CODE=+1
```

### **Installation Steps**

1. **Clone and install dependencies**
```bash
git clone <repository-url>
cd gaming-platform-api
npm install
```

2. **Database setup**
```bash
# Start MongoDB
mongod

# Run database migrations
npm run tier:migrate
```

3. **Start the application**
```bash
# Development mode
npm run dev

# Production mode
npm start
```

4. **Verify installation**
```bash
# Check API health
curl http://localhost:3000/api/user

# Should return authentication required error
```

## 🎮 Usage Examples

### **User Registration & Login**
```javascript
// Register new user
const registerUser = async (userData) => {
  const response = await fetch('/api/user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: '+1234567890',
      countryCode: '+1',
      password: 'securepassword',
      name: {
        firstName: 'John',
        lastName: 'Doe'
      }
    })
  });
  return response.json();
};

// Login user
const loginUser = async (credentials) => {
  const response = await fetch('/api/oauth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: '+1234567890',
      password: 'securepassword',
      countryCode: '+1'
    })
  });
  return response.json();
};
```

### **Place Lottery Bet**
```javascript
// Place Borlette bet
const placeBoletteBet = async (lotteryId, betData, token) => {
  const response = await fetch(`/api/ticket/borlette/${lotteryId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      cashType: 'REAL', // or 'VIRTUAL'
      numbers: [
        { numberPlayed: 123, amountPlayed: 10 },
        { numberPlayed: 456, amountPlayed: 5 }
      ],
      totalAmountPlayed: 15
    })
  });
  return response.json();
};
```

### **Check Wallet Balance**
```javascript
const getWalletBalance = async (token) => {
  const response = await fetch('/api/wallet', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  return response.json();
};
```

### **Admin: Manage User Tiers**
```javascript
// Update tier requirements
const updateTierRequirements = async (tier, requirements, adminToken) => {
  const response = await fetch(`/api/admin/tiers/requirements/${tier}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      tier: tier,
      requirements: {
        minimumXP: 1000,
        minimumPlayAmount: 500,
        minimumReferrals: 5
      },
      benefits: {
        payoutMultiplier: 1.2,
        commissionRate: 0.05,
        exclusiveGames: true
      }
    })
  });
  return response.json();
};
```

## 🔧 Configuration

### **Loyalty Tier Configuration**
Tiers can be configured via the admin panel or database:
```javascript
// Example tier configuration
const tierConfig = {
  SILVER: {
    requirements: {
      minimumXP: 1000,
      minimumPlayAmount: 500,
      minimumReferrals: 3
    },
    benefits: {
      payoutMultiplier: 1.1,
      commissionRate: 0.03,
      exclusiveGames: false
    }
  },
  GOLD: {
    requirements: {
      minimumXP: 5000,
      minimumPlayAmount: 2000,
      minimumReferrals: 10
    },
    benefits: {
      payoutMultiplier: 1.2,
      commissionRate: 0.05,
      exclusiveGames: true
    }
  }
};
```

### **State Configuration**
Each state can have different lottery configurations:
```javascript
const stateConfig = {
  name: "Florida",
  code: "FL",
  isActive: true,
  lotteries: {
    borlette: {
      morning: { drawTime: "10:00", drawDays: [1,2,3,4,5,6,7] },
      evening: { drawTime: "22:00", drawDays: [1,2,3,4,5,6,7] }
    },
    megaMillions: {
      drawTime: "23:00",
      drawDays: [3,6], // Tuesday, Friday
      jackpotAmount: 1000000
    }
  }
};
```

## 📊 Monitoring & Analytics

### **Key Metrics**
- **Revenue Tracking**: Real-time revenue by game type
- **User Analytics**: Registration, activity, tier progression
- **Game Performance**: Bet volumes, payout ratios
- **Financial Health**: Cash flow, withdrawal patterns

### **Logging**
The application uses comprehensive logging:
- Transaction logs for all financial operations
- Game activity logs for betting and results
- User activity logs for authentication and actions
- Error logs for system monitoring

## 🔒 Security Features

### **Financial Security**
- Dual cash system prevents unauthorized withdrawals
- Transaction validation and audit trails
- Bank account verification for withdrawals
- Admin approval for large transactions

### **Data Protection**
- Password hashing with bcrypt
- JWT token expiration and refresh
- API rate limiting and input validation
- Role-based access control

### **Game Integrity**
- External lottery result integration
- Tamper-proof result storage
- Automated payout calculations
- Bet validation and restrictions

## 🚀 Deployment

### **Production Deployment**
```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
npm start

# Monitor processes
pm2 logs
pm2 monit
```

### **Docker Deployment**
```dockerfile
FROM node:14-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### **Environment Setup**
- Configure production environment variables
- Set up MongoDB replica set for high availability
- Configure AWS services for file storage and SMS
- Set up monitoring and alerting

## 📝 Scripts

```bash
# Development
npm run dev              # Start development server

# Production
npm start               # Start production server with PM2
npm run poststart       # View PM2 logs

# Database
npm run tier:migrate    # Run tier migration scripts

# Code Quality
npm run eslint          # Run ESLint
```

## 🤝 Contributing

### **Development Workflow**
1. Create feature branch from main
2. Follow existing code patterns and naming conventions
3. Write tests for new features
4. Update documentation
5. Submit pull request

### **Code Standards**
- Use ESLint with Prettier for consistent formatting
- Follow existing service patterns and architecture
- Maintain backward compatibility
- Document all new API endpoints

### **Testing**
- Write unit tests for new controller functions
- Test API endpoints with integration tests
- Validate transaction flows thoroughly
- Test real-time features with Socket.io

## 📞 Support

For technical support or questions:
- **Documentation**: Check this README and inline code comments
- **Issues**: Create GitHub issues for bugs and feature requests
- **Architecture**: Review service patterns before making changes

## 📄 License

This project is proprietary software. All rights reserved.

---

**Built with ❤️ for the gaming community**