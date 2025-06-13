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
		refferalCode: {
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
		sim_nif: { type: String, default: null },
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
		// New fields for document verification
		idProof: {
			documentUrl: { type: String, default: null },
			uploadDate: { type: Date, default: null },
			verificationStatus: {
				type: String,
				enum: ['NOT_UPLOADED', 'PENDING', 'VERIFIED', 'REJECTED'],
				default: 'NOT_UPLOADED',
			},
			rejectionReason: { type: String, default: null },
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
		},
	},
	{
		timestamps: true,
	}
);

userSchema.pre('save', function (next) {
	if (!this.isModified('password')) return next();

	/* istanbul ignore next */
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
		(this.isModified(this.securePin) && this.securePin === null)
	)
		return next();

	/* istanbul ignore next */
	const rounds = env === 'test' ? 1 : 9;

	bcrypt
		.hash(this.securePin, rounds)
		.then(hash => {
			this.securePin = hash;
			next();
		})
		.catch(next);
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
				'securePin',
				'countryCode',
				'phone',
				'email',
				'createdAt',
				'idProof', // Include new fields in full view
				'addressProof', // Include new fields in full view
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
};

export const User = mongoose.model('User', userSchema);
