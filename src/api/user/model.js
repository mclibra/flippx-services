import bcrypt from 'bcryptjs';
import randtoken from 'rand-token';
import mongoose, { Schema } from 'mongoose';
import slug from 'mongoose-slug-generator';
import { env } from '../../../config';

const roles = ['USER', 'ADMIN', 'DEALER', 'AGENT', 'SYSTEM'];

mongoose.plugin(slug, {
	separator: '',
	lang: 'en',
	truncate: 120,
});

const userSchema = new Schema(
	{
		countryCode: {
			type: String,
			required: true,
			trim: true,
		},
		phone: {
			type: String,
			required: true,
			unique: true,
			trim: true,
		},
		email: {
			type: String,
			match: /^\S+@\S+\.\S+$/,
			unique: true,
			trim: true,
			sparse: true,
			lowercase: true,
		},
		slugName: {
			type: String,
			lowercase: true,
			required: true,
		},
		userName: {
			type: String,
			slug: 'slugName',
			slug_padding_size: 3,
			unique: true,
		},
		dob: {
			type: String,
			required: true,
		},
		referralCode: {
			type: String,
			default: null,
		},
		password: {
			type: String,
			required: true,
			minlength: 6,
		},
		securePin: {
			type: String,
			default: null,
		},
		name: {
			firstName: { type: String, required: true },
			lastName: { type: String, required: true },
		},
		address: {
			address1: { type: String, default: null },
			address2: { type: String, default: null },
			city: { type: String, default: null },
			state: { type: String, default: null },
			country: { type: String, default: null },
			pincode: { type: String, default: null },
		},
		simNif: { type: String, default: null },
		bankAccount: [
			{
				bank: { type: String, default: null },
				accountNumber: { type: String, default: null },
				ifsc: { type: String, default: null },
			},
		],
		services: {
			facebook: String,
			google: String,
		},
		picture: {
			type: String,
			trim: true,
		},
		role: {
			type: String,
			enum: roles,
			default: 'USER',
		},
		isActive: { type: Boolean, default: true },
		isInfluencer: { type: Boolean, default: false },
		influencerContractId: {
			type: Schema.Types.ObjectId,
			ref: 'Influencer',
			default: null
		},

		// Document verification fields
		idProof: {
			documentUrl: { type: String, default: null },
			uploadDate: { type: Date, default: null },
			verificationStatus: {
				type: String,
				enum: ['NOT_UPLOADED', 'PENDING', 'VERIFIED', 'REJECTED'],
				default: 'NOT_UPLOADED',
			},
			rejectionReason: { type: String, default: null },
			verifiedAt: { type: Date, default: null },
			verifiedBy: { type: String, ref: 'User', default: null },
		},
		addressProof: {
			documentUrl: { type: String, default: null },
			uploadDate: { type: Date, default: null },
			verificationStatus: {
				type: String,
				enum: ['NOT_UPLOADED', 'PENDING', 'VERIFIED', 'REJECTED'],
				default: 'NOT_UPLOADED',
			},
			rejectionReason: { type: String, default: null },
			verifiedAt: { type: Date, default: null },
			verifiedBy: { type: String, ref: 'User', default: null },
		},

		// Session and activity tracking fields
		sessionTracking: {
			lastLoginDate: { type: Date, default: null },
			lastActivityDate: { type: Date, default: null },
			currentSessionStartTime: { type: Date, default: null },
			dailyLoginStreak: { type: Number, default: 0 },
			lastDailyLoginDate: { type: Date, default: null },
			totalSessionTimeToday: { type: Number, default: 0 }, // in seconds
			sessionTimeUpdatedDate: { type: Date, default: null },
		},

		accountStatus: {
			type: String,
			enum: ['ACTIVE', 'SUSPENDED', 'INACTIVE', 'BANNED'],
			default: 'ACTIVE',
		},

		// Suspension tracking
		suspensionReason: { type: String, default: null },
		suspendedBy: { type: String, ref: 'User', default: null },
		suspendedAt: { type: Date, default: null },
		reactivatedBy: { type: String, ref: 'User', default: null },
		reactivatedAt: { type: Date, default: null },

		// Role change tracking
		roleChangedBy: { type: String, ref: 'User', default: null },
		roleChangedAt: { type: Date, default: null },
		roleChangeReason: { type: String, default: null },
		previousRole: { type: String, enum: roles, default: null },

		// Password reset tracking (admin actions)
		passwordResetBy: { type: String, ref: 'User', default: null },
		passwordResetAt: { type: Date, default: null },
		passwordResetReason: { type: String, default: null },

		// PIN reset tracking (admin actions)
		pinResetBy: { type: String, ref: 'User', default: null },
		pinResetAt: { type: Date, default: null },
		pinResetReason: { type: String, default: null },

		// Force logout tracking
		forceLogoutBy: { type: String, ref: 'User', default: null },
		forceLogoutAt: { type: Date, default: null },

		// Referral system fields
		referredBy: { type: String, ref: 'User', default: null },
		managedBy: { type: String, ref: 'User', default: null },
		referralStats: {
			totalReferrals: { type: Number, default: 0 },
			activeReferrals: { type: Number, default: 0 },
			totalCommissionsEarned: { type: Number, default: 0 },
		},

		// Compliance and risk tracking
		complianceFlags: {
			kycCompleted: { type: Boolean, default: false },
			amlChecked: { type: Boolean, default: false },
			riskLevel: {
				type: String,
				enum: ['LOW', 'MEDIUM', 'HIGH'],
				default: 'LOW'
			},
			lastRiskAssessment: { type: Date, default: null },
		},

		// Administrative notes and flags
		adminNotes: [
			{
				note: { type: String, required: true },
				addedBy: { type: String, ref: 'User', required: true },
				addedAt: { type: Date, default: Date.now },
				category: {
					type: String,
					enum: ['GENERAL', 'SECURITY', 'FINANCIAL', 'COMPLIANCE', 'SUPPORT'],
					default: 'GENERAL'
				},
			}
		],

		// Account limitations
		limitations: {
			depositBlocked: { type: Boolean, default: false },
			withdrawalBlocked: { type: Boolean, default: false },
			gamePlayBlocked: { type: Boolean, default: false },
			reasonForLimitations: { type: String, default: null },
			limitationsSetBy: { type: String, ref: 'User', default: null },
			limitationsSetAt: { type: Date, default: null },
		},

		// Territory management (for agents/dealers)
		territory: {
			region: { type: String, default: null },
			assignedStates: [{ type: String }],
			assignedBy: { type: String, ref: 'User', default: null },
			assignedAt: { type: Date, default: null },
		},

		// Additional metadata
		metadata: {
			registrationIP: { type: String, default: null },
			lastIP: { type: String, default: null },
			deviceInfo: { type: String, default: null },
			registrationSource: {
				type: String,
				enum: ['WEB', 'MOBILE_APP', 'AGENT', 'ADMIN'],
				default: 'WEB'
			},
		},
	},
	{
		timestamps: true,
	}
);

// Indexes for performance
userSchema.index({ phone: 1, countryCode: 1 });
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ accountStatus: 1 });
userSchema.index({ referredBy: 1 });
userSchema.index({ managedBy: 1 });
userSchema.index({ 'sessionTracking.lastLoginDate': -1 });
userSchema.index({ 'sessionTracking.lastActivityDate': -1 });
userSchema.index({ 'complianceFlags.riskLevel': 1 });

// Pre-save hooks
userSchema.pre('save', function (next) {
	if (!this.isModified('password')) return next();

	const rounds = env === 'test' ? 1 : 9;

	bcrypt
		.hash(this.password, rounds)
		.then(hash => {
			this.password = hash;
			next();
		})
		.catch(next);
});

userSchema.pre('save', function (next) {
	if (
		!this.isModified('securePin') ||
		(this.isModified('securePin') && this.securePin === null)
	)
		return next();

	const rounds = env === 'test' ? 1 : 9;

	bcrypt
		.hash(this.securePin, rounds)
		.then(hash => {
			this.securePin = hash;
			next();
		})
		.catch(next);
});

// Pre-save middleware to track role changes
userSchema.pre('save', function (next) {
	if (this.isModified('role') && !this.isNew) {
		this.previousRole = this.constructor.findById(this._id)
			.then(original => {
				if (original && original.role !== this.role) {
					this.previousRole = original.role;
				}
			});
	}
	next();
});

// Pre-save middleware to update KYC completion status
userSchema.pre('save', function (next) {
	if (this.isModified('idProof.verificationStatus') || this.isModified('addressProof.verificationStatus')) {
		this.complianceFlags.kycCompleted =
			this.idProof?.verificationStatus === 'VERIFIED' &&
			this.addressProof?.verificationStatus === 'VERIFIED';
	}
	next();
});

userSchema.methods = {
	view(full) {
		let view = {};
		let fields = ['id', 'name', 'picture'];

		if (full) {
			fields = [
				...fields,
				'dob',
				'userName',
				'role',
				'countryCode',
				'phone',
				'email',
				'createdAt',
				'accountStatus',
				'idProof',
				'addressProof',
				'sessionTracking',
				'complianceFlags',
				'referralStats',
				'territory',
				'limitations',
			];
		}

		fields.forEach(field => {
			view[field] = this[field];
		});

		return view;
	},

	authenticate(password) {
		return bcrypt
			.compare(password, this.password)
			.then(valid => (valid ? this : false));
	},

	validatePin(securePin) {
		return bcrypt
			.compare(securePin, this.securePin)
			.then(valid => (valid ? this : false));
	},

	// Helper method to add admin notes
	addAdminNote(note, addedBy, category = 'GENERAL') {
		this.adminNotes.push({
			note,
			addedBy,
			category,
			addedAt: new Date(),
		});
		return this.save();
	},

	// Helper method to check if user has specific limitation
	hasLimitation(type) {
		return this.limitations[`${type}Blocked`] === true;
	},

	// Helper method to get verification progress
	getVerificationProgress() {
		let progress = 0;
		if (this.idProof?.verificationStatus === 'VERIFIED') progress += 50;
		if (this.addressProof?.verificationStatus === 'VERIFIED') progress += 50;
		return progress;
	},

	// Helper method to check if user is in hierarchy
	isInHierarchy(managerId) {
		return this.referredBy?.toString() === managerId ||
			this.managedBy?.toString() === managerId;
	},
};

userSchema.statics = {
	roles,

	createFromService({ service, id, email, name, picture, phone }) {
		return this.findOne({
			$or: [{ [`services.${service}`]: id }, { phone }, { email }],
		}).then(user => {
			if (user) {
				user.services[service] = id;
				user.name = name;
				user.picture = picture;
				return user.save();
			} else {
				const password = randtoken.generate(16);
				return this.create({
					services: { [service]: id },
					email,
					password,
					name,
					picture,
				});
			}
		});
	},

	// Helper method to find users by role and hierarchy
	findByHierarchy(managerId, role = null) {
		const query = {
			$or: [
				{ referredBy: managerId },
				{ managedBy: managerId }
			]
		};

		if (role) {
			query.role = role;
		}

		return this.find(query);
	},

	// Helper method to get users with pending verifications
	findPendingVerifications() {
		return this.find({
			$or: [
				{ 'idProof.verificationStatus': 'PENDING' },
				{ 'addressProof.verificationStatus': 'PENDING' }
			]
		});
	},

	// Helper method to get users by compliance status
	findByComplianceStatus(kycCompleted, riskLevel = null) {
		const query = { 'complianceFlags.kycCompleted': kycCompleted };

		if (riskLevel) {
			query['complianceFlags.riskLevel'] = riskLevel;
		}

		return this.find(query);
	},
};

export const User = mongoose.model('User', userSchema);