import { Banner } from './model';

// ===== GET ACTIVE BANNERS (PUBLIC/USER ENDPOINT) =====

export const getActiveBanners = async () => {
	try {
		// Get only active banners, sorted by order
		const banners = await Banner.find({ isActive: true })
			.select('imageUrl title description linkUrl order')
			.sort({ order: 1, createdAt: -1 })
			.exec();

		return {
			status: 200,
			entity: {
				success: true,
				banners,
			},
		};
	} catch (error) {
		console.error('Get active banners error:', error);
		return {
			status: 500,
			entity: {
				success: false,
				error: error.message || 'Failed to fetch banners',
			},
		};
	}
};
