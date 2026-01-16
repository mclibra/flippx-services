import crypto from 'crypto';
import AWS from 'aws-sdk';
import { Banner } from '../../banner/model';
import config from '../../../../config';

// ===== GET SIGNED URL FOR BANNER UPLOAD =====

export const getBannerSignedUrl = async (adminUser, { fileType }) => {
	try {
		const S3_BUCKET = config.aws.s3BucketName;
		AWS.config.update(config.aws.config);
		const s3 = new AWS.S3();
		const normalizedFileType = (fileType || '').toLowerCase();
		const mimeTypeMap = {
			jpg: 'image/jpeg',
			jpeg: 'image/jpeg',
			png: 'image/png',
			gif: 'image/gif',
			webp: 'image/webp',
			bmp: 'image/bmp',
			svg: 'image/svg+xml',
			heic: 'image/heic',
			heif: 'image/heif',
		};
		const contentType = mimeTypeMap[normalizedFileType];
		if (!contentType) {
			return {
				status: 400,
				entity: {
					success: false,
					error: `Unsupported file format. Please upload an image (JPG, PNG, GIF, WebP, BMP, SVG, HEIC, HEIF).`,
				},
			};
		}
		const randomKey = crypto.randomBytes(16).toString('hex');
		const fileName = `banners/${adminUser._id}_${randomKey}.${normalizedFileType}`;
		const s3Params = {
			Bucket: S3_BUCKET,
			Key: fileName,
			Expires: 60,
			ContentType: contentType,
			ACL: 'public-read',
		};
		const signedUrl = s3.getSignedUrl('putObject', s3Params);
		return {
			status: 200,
			entity: {
				success: true,
				signedUrl,
				fileName,
			},
		};
	} catch (error) {
		const errorMessage =
			error?.message ||
			error?.error ||
			'Unable to generate file upload URL. Please try again.';
		return {
			status: 500,
			entity: {
				success: false,
				error: errorMessage,
			},
		};
	}
};

// ===== CREATE BANNER =====

export const createBanner = async (body, adminUser) => {
	try {
		const { imageUrl, title, description, linkUrl, order, isActive } = body;

		// Validate required fields
		if (!imageUrl) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Image URL is required',
				},
			};
		}

		// Validate imageUrl format (basic URL validation)
		try {
			new URL(imageUrl);
		} catch (e) {
			return {
				status: 400,
				entity: {
					success: false,
					error: 'Invalid image URL format',
				},
			};
		}

		// Create banner
		const bannerData = {
			imageUrl,
			createdBy: adminUser._id.toString(),
			...(title !== undefined && { title }),
			...(description !== undefined && { description }),
			...(linkUrl !== undefined && { linkUrl }),
			...(order !== undefined && { order }),
			...(isActive !== undefined && { isActive }),
		};

		const banner = await Banner.create(bannerData);

		return {
			status: 201,
			entity: {
				success: true,
				message: 'Banner created successfully',
				banner,
			},
		};
	} catch (error) {
		console.error('Create banner error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to create banner',
			},
		};
	}
};

// ===== UPDATE BANNER =====

export const updateBanner = async (bannerId, body, adminUser) => {
	try {
		const { imageUrl, title, description, linkUrl, order, isActive } = body;

		// Check if banner exists
		const existingBanner = await Banner.findById(bannerId);
		if (!existingBanner) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Banner not found',
				},
			};
		}

		// Validate imageUrl format if provided
		if (imageUrl) {
			try {
				new URL(imageUrl);
			} catch (e) {
				return {
					status: 400,
					entity: {
						success: false,
						error: 'Invalid image URL format',
					},
				};
			}
		}

		// Prepare update data (only include fields that are provided)
		const updateData = {
			updatedBy: adminUser._id.toString(),
		};
		if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
		if (title !== undefined) updateData.title = title;
		if (description !== undefined) updateData.description = description;
		if (linkUrl !== undefined) updateData.linkUrl = linkUrl;
		if (order !== undefined) updateData.order = order;
		if (isActive !== undefined) updateData.isActive = isActive;

		// Update banner
		const banner = await Banner.findByIdAndUpdate(bannerId, updateData, {
			new: true,
			runValidators: true,
		});

		return {
			status: 200,
			entity: {
				success: true,
				message: 'Banner updated successfully',
				banner,
			},
		};
	} catch (error) {
		console.error('Update banner error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to update banner',
			},
		};
	}
};

// ===== DELETE BANNER =====

export const deleteBanner = async bannerId => {
	try {
		// Check if banner exists
		const banner = await Banner.findById(bannerId);
		if (!banner) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Banner not found',
				},
			};
		}

		// Delete banner
		await Banner.findByIdAndDelete(bannerId);

		return {
			status: 200,
			entity: {
				success: true,
				message: 'Banner deleted successfully',
			},
		};
	} catch (error) {
		console.error('Delete banner error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to delete banner',
			},
		};
	}
};

// ===== LIST BANNERS (ADMIN) =====

export const listBanners = async query => {
	try {
		const {
			page = 1,
			limit = 20,
			isActive,
			sortBy = 'order',
			sortOrder = 'asc',
		} = query;

		// Build filter object
		const filter = {};
		if (isActive !== undefined) {
			filter.isActive = isActive === 'true' || isActive === true;
		}

		// Calculate pagination
		const skip = (page - 1) * limit;

		// Get banners with populated data
		const banners = await Banner.find(filter)
			.populate('createdBy', 'name userName email')
			.populate('updatedBy', 'name userName email')
			.skip(skip)
			.limit(parseInt(limit))
			.sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
			.exec();

		// Get total count
		const total = await Banner.countDocuments(filter);

		return {
			status: 200,
			entity: {
				success: true,
				banners,
				pagination: {
					page: parseInt(page),
					limit: parseInt(limit),
					total,
					pages: Math.ceil(total / limit),
					hasMore: parseInt(page) * parseInt(limit) < total,
				},
			},
		};
	} catch (error) {
		console.error('List banners error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch banners',
			},
		};
	}
};

// ===== GET BANNER DETAILS =====

export const getBannerDetails = async bannerId => {
	try {
		const banner = await Banner.findById(bannerId)
			.populate('createdBy', 'name userName email')
			.populate('updatedBy', 'name userName email')
			.exec();

		if (!banner) {
			return {
				status: 404,
				entity: {
					success: false,
					error: 'Banner not found',
				},
			};
		}

		return {
			status: 200,
			entity: {
				success: true,
				banner,
			},
		};
	} catch (error) {
		console.error('Get banner details error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch banner details',
			},
		};
	}
};
