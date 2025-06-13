export const generateRandomDigits = length =>
	Math.floor(
		Math.random() * parseInt('8' + '9'.repeat(length - 1)) +
			parseInt('1' + '0'.repeat(length - 1))
	);
