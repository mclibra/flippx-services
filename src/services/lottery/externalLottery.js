import axios from 'axios';
import { rapidAPI } from '../../../config';

const api = axios.create({
	baseURL: `https://${rapidAPI.apiHost}`,
	headers: {
		'X-RapidAPI-Host': rapidAPI.apiHost,
		'X-RapidAPI-Key': rapidAPI.apiKey,
	},
	timeout: 30000, // 30 second timeout to prevent hanging
});

export const fetchGameListByState = async stateCode => {
	try {
		console.log(`Fetching lottery liost for state: ${stateCode}`);
		const response = await api.get(
			`/lottery-results/states/game-list?state=${stateCode}`
		);
		return response.data;
	} catch (error) {
		console.error('Error fetching game list:', error);
		throw new Error(`Failed to fetch game list: ${error.message}`);
	}
};

export const fetchPastDrawDates = async gameId => {
	try {
		console.log(
			`Fetching past draw dates for lottery with external ID: ${gameId}`
		);
		const response = await api.get(
			`/lottery-results/past-draws-dates?gameID=${gameId}`
		);
		return response.data;
	} catch (error) {
		console.error(`Error fetching past draw dates for ID ${gameId}:`);
		throw new Error(`Failed to fetch past draw dates: ${error.message}`);
	}
};

export const fetchGameResult = async (gameId, drawID = null) => {
	try {
		const url = drawID
			? `/lottery-results/game-result?gameID=${gameId}&drawID=${drawID}`
			: `/lottery-results/game-result?gameID=${gameId}`;
		console.log(
			`Fetching game result for lottery with external ID: ${gameId}${
				drawID ? ` and drawID: ${drawID}` : ''
			}`
		);
		const response = await api.get(url);
		return response.data;
	} catch (error) {
		console.error(`Error fetching game result for ID ${gameId}:`);
		throw new Error(`Failed to fetch game result: ${error.message}`);
	}
};
