import crypto from 'crypto';

export class DominoGameEngine {

    // Initialize standard domino set (0-0 to 6-6 = 28 tiles)
    static generateDominoSet() {
        const tiles = [];
        for (let i = 0; i <= 6; i++) {
            for (let j = i; j <= 6; j++) {
                tiles.push(`${i}-${j}`);
            }
        }
        return this.shuffleArray(tiles);
    }

    // Cryptographically secure shuffle
    static shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const randomBytes = crypto.randomBytes(4);
            const randomIndex = randomBytes.readUInt32BE(0) % (i + 1);
            [shuffled[i], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[i]];
        }
        return shuffled;
    }

    // Deal tiles to players
    static dealTiles(playerCount, tilesPerPlayer) {
        const dominoSet = this.generateDominoSet();
        const players = [];

        for (let i = 0; i < playerCount; i++) {
            players.push({
                position: i,
                hand: dominoSet.slice(i * tilesPerPlayer, (i + 1) * tilesPerPlayer),
                score: 0,
                totalScore: 0,
                isConnected: true,
                consecutivePasses: 0
            });
        }

        const drawPile = dominoSet.slice(playerCount * tilesPerPlayer);

        return { players, drawPile };
    }

    // Check if tile can be placed on board
    static canPlaceTile(tile, board) {
        if (board.length === 0) return { canPlace: true, sides: ['LEFT', 'RIGHT'] };

        const [tileLeft, tileRight] = tile.split('-').map(Number);
        const boardEnds = this.getBoardEnds(board);
        const validSides = [];

        // Check left end
        if (tileLeft === boardEnds.left || tileRight === boardEnds.left) {
            validSides.push('LEFT');
        }

        // Check right end
        if (tileLeft === boardEnds.right || tileRight === boardEnds.right) {
            validSides.push('RIGHT');
        }

        return {
            canPlace: validSides.length > 0,
            sides: validSides
        };
    }

    // Get playable ends of the board
    static getBoardEnds(board) {
        if (board.length === 0) return { left: null, right: null };

        const firstTile = board[0].tile.split('-').map(Number);
        const lastTile = board[board.length - 1].tile.split('-').map(Number);

        return {
            left: firstTile[0],
            right: lastTile[1]
        };
    }

    // Place tile on specific side of board
    static placeTileOnBoard(tile, board, side) {
        const [tileLeft, tileRight] = tile.split('-').map(Number);
        const boardEnds = this.getBoardEnds(board);

        if (side === 'LEFT') {
            // Determine correct orientation for left side
            const newTile = {
                tile: tileRight === boardEnds.left ? `${tileLeft}-${tileRight}` : `${tileRight}-${tileLeft}`,
                side: 'LEFT',
                position: 0
            };
            board.unshift(newTile);
        } else {
            // Determine correct orientation for right side
            const newTile = {
                tile: tileLeft === boardEnds.right ? `${tileLeft}-${tileRight}` : `${tileRight}-${tileLeft}`,
                side: 'RIGHT',
                position: board.length
            };
            board.push(newTile);
        }

        // Update positions
        board.forEach((tile, index) => {
            tile.position = index;
        });

        return board;
    }

    // Calculate dots on remaining tiles
    static calculateDots(hand) {
        return hand.reduce((total, tile) => {
            const [left, right] = tile.split('-').map(Number);
            return total + left + right;
        }, 0);
    }

    // Check for valid moves
    static hasValidMoves(hand, board) {
        return hand.some(tile => this.canPlaceTile(tile, board).canPlace);
    }

    // Get all valid moves for a player
    static getValidMoves(hand, board) {
        const validMoves = [];

        hand.forEach(tile => {
            const canPlace = this.canPlaceTile(tile, board);
            if (canPlace.canPlace) {
                validMoves.push({
                    tile,
                    validSides: canPlace.sides
                });
            }
        });

        return validMoves;
    }

    // Auto-play for computer or disconnected player
    static autoPlay(hand, board, drawPile, playerType = 'COMPUTER') {
        // Strategy for computer players
        const validMoves = this.getValidMoves(hand, board);

        if (validMoves.length > 0) {
            // Computer strategy: prefer tiles with higher dots or doubles
            const bestMove = validMoves.reduce((best, current) => {
                const currentDots = this.calculateDots([current.tile]);
                const bestDots = this.calculateDots([best.tile]);

                // Prefer doubles
                const [currentLeft, currentRight] = current.tile.split('-').map(Number);
                const [bestLeft, bestRight] = best.tile.split('-').map(Number);

                if (currentLeft === currentRight && bestLeft !== bestRight) {
                    return current;
                }

                return currentDots > bestDots ? current : best;
            });

            return {
                action: 'PLACE',
                tile: bestMove.tile,
                side: bestMove.validSides[0] // Choose first available side
            };
        }

        // Draw if possible
        if (drawPile.length > 0) {
            return { action: 'DRAW' };
        }

        // Pass if no moves available
        return { action: 'PASS' };
    }

    // Determine game winner
    static determineWinner(players, winRule, targetPoints = 100) {
        // Check if any player has no tiles left
        const emptyHandPlayer = players.find(p => p.hand.length === 0);
        if (emptyHandPlayer) {
            return {
                winner: emptyHandPlayer.position,
                endReason: 'LAST_TILE',
                roundWinner: emptyHandPlayer.position
            };
        }

        // Check if all players passed consecutively
        const allPassed = players.every(p => p.consecutivePasses >= 1);
        if (allPassed) {
            // Find player with lowest dots
            const playerDots = players.map(p => ({
                position: p.position,
                dots: this.calculateDots(p.hand),
                totalScore: p.totalScore
            }));

            playerDots.sort((a, b) => a.dots - b.dots);

            const roundWinner = playerDots[0].position;

            // For point-based games, check if target reached
            if (winRule === 'POINT_BASED') {
                // Add points to winner
                const pointsToAdd = playerDots.slice(1).reduce((sum, p) => sum + p.dots, 0);
                const winnerTotalScore = playerDots[0].totalScore + pointsToAdd;

                if (winnerTotalScore >= targetPoints) {
                    return {
                        winner: roundWinner,
                        endReason: 'POINTS_REACHED',
                        roundWinner,
                        finalScores: playerDots,
                        gameCompleted: true
                    };
                } else {
                    return {
                        winner: null,
                        endReason: 'LOWEST_DOTS',
                        roundWinner,
                        finalScores: playerDots,
                        gameCompleted: false
                    };
                }
            }

            return {
                winner: roundWinner,
                endReason: 'LOWEST_DOTS',
                roundWinner,
                finalScores: playerDots,
                gameCompleted: true
            };
        }

        return { winner: null, gameCompleted: false };
    }

    // Calculate round scores for point-based games
    static calculateRoundScores(players, roundWinner) {
        const scores = players.map(p => ({
            position: p.position,
            dotsRemaining: this.calculateDots(p.hand),
            roundScore: 0,
            totalScore: p.totalScore
        }));

        // Winner gets points equal to sum of all other players' remaining dots
        const winnerScore = scores.find(s => s.position === roundWinner);
        const losersDots = scores.filter(s => s.position !== roundWinner)
            .reduce((sum, s) => sum + s.dotsRemaining, 0);

        winnerScore.roundScore = losersDots;
        winnerScore.totalScore += losersDots;

        return scores;
    }

    // Generate unique room ID
    static generateRoomId() {
        const timestamp = Date.now().toString(36);
        const randomBytes = crypto.randomBytes(3).toString('hex').toUpperCase();
        return `DOM_${timestamp}_${randomBytes}`;
    }

    // Find next active player
    static getNextPlayer(currentPlayer, players) {
        let nextPlayer = (currentPlayer + 1) % players.length;
        let attempts = 0;

        // Skip disconnected players, but max 1 full cycle
        while (attempts < players.length && !players[nextPlayer].isConnected) {
            nextPlayer = (nextPlayer + 1) % players.length;
            attempts++;
        }

        return nextPlayer;
    }

    // Validate game state
    static validateGameState(game) {
        const errors = [];

        // Check player count
        if (game.players.length < 2 || game.players.length > 4) {
            errors.push('Invalid player count');
        }

        // Check tile distribution
        const totalTiles = game.players.reduce((sum, p) => sum + p.hand.length, 0)
            + game.drawPile.length + game.board.length;

        if (totalTiles !== 28) {
            errors.push('Invalid tile distribution');
        }

        // Check for duplicate tiles
        const allTiles = [
            ...game.players.flatMap(p => p.hand),
            ...game.drawPile,
            ...game.board.map(b => b.tile)
        ];

        const uniqueTiles = new Set(allTiles);
        if (uniqueTiles.size !== allTiles.length) {
            errors.push('Duplicate tiles detected');
        }

        return { isValid: errors.length === 0, errors };
    }
}