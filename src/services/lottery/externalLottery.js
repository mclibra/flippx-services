import axios from 'axios';
import { rapidAPI } from '../../../config';

const api = axios.create({
	baseURL: `https://${rapidAPI.apiHost}`,
	headers: {
		'X-RapidAPI-Host': rapidAPI.apiHost,
		'X-RapidAPI-Key': rapidAPI.apiKey,
	},
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

export const fetchGameResult = async gameId => {
	try {
		console.log(`Fetching game result for lottery with external ID: ${gameId}`);
		const response = await api.get(
			`/lottery-results/game-result?gameID=${gameId}`
		);
		return response.data;
	} catch (error) {
		console.error(`Error fetching game result for ID ${gameId}:`);
		throw new Error(`Failed to fetch game result: ${error.message}`);
	}
};
