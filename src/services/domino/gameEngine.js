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

    // Main move processing function - THIS WAS MISSING
    static processMove(game, playerIndex, action, tile = null, side = null) {
        try {
            // Create a deep copy of the game state to avoid mutations
            const gameState = JSON.parse(JSON.stringify(game));
            const player = gameState.players[playerIndex];

            if (!player) {
                return {
                    success: false,
                    error: 'Invalid player index'
                };
            }

            const move = {
                player: playerIndex,
                action,
                tile,
                side,
                timestamp: new Date(),
                boardStateBefore: JSON.stringify(gameState.board)
            };

            switch (action) {
                case 'PLACE':
                    return this.processPlaceMove(gameState, playerIndex, tile, side, move);
                case 'DRAW':
                    return this.processDrawMove(gameState, playerIndex, move);
                case 'PASS':
                    return this.processPassMove(gameState, playerIndex, move);
                default:
                    return {
                        success: false,
                        error: 'Invalid action'
                    };
            }
        } catch (error) {
            console.error('Error processing move:', error);
            return {
                success: false,
                error: 'Internal error processing move'
            };
        }
    }

    static processPlaceMove(gameState, playerIndex, tile, side, move) {
        const player = gameState.players[playerIndex];

        // Validate tile is in player's hand
        const tileIndex = player.hand.indexOf(tile);
        if (tileIndex === -1) {
            return {
                success: false,
                error: 'Tile not in hand'
            };
        }

        // Validate tile can be placed
        const canPlace = this.canPlaceTile(tile, gameState.board);
        if (!canPlace.canPlace) {
            return {
                success: false,
                error: 'Tile cannot be placed on board'
            };
        }

        // Validate side
        if (!canPlace.sides.includes(side)) {
            return {
                success: false,
                error: 'Invalid side for tile placement'
            };
        }

        // Remove tile from hand
        player.hand.splice(tileIndex, 1);

        // Place tile on board
        this.placeTileOnBoard(tile, gameState.board, side);

        // Add to move history
        move.boardStateAfter = JSON.stringify(gameState.board);
        gameState.moves.push(move);

        // Reset consecutive passes
        player.consecutivePasses = 0;

        // Update total moves
        gameState.totalMoves = (gameState.totalMoves || 0) + 1;

        // Update last action
        player.lastAction = new Date();

        // Check for game completion
        const winnerCheck = this.checkGameCompletion(gameState);
        if (winnerCheck.isComplete) {
            gameState.gameState = 'COMPLETED';
            gameState.winner = winnerCheck.winner;
            gameState.endReason = winnerCheck.endReason;
            gameState.finalScores = winnerCheck.finalScores;
            gameState.completedAt = new Date();

            // Calculate duration
            if (gameState.startedAt) {
                gameState.duration = Math.floor((new Date() - new Date(gameState.startedAt)) / 1000);
            }
        } else {
            // Move to next player
            gameState.currentPlayer = this.getNextPlayer(gameState);
            gameState.turnStartTime = new Date();
        }

        return {
            success: true,
            gameState,
            move
        };
    }

    static processDrawMove(gameState, playerIndex, move) {
        const player = gameState.players[playerIndex];

        // Check if draw pile is empty
        if (gameState.drawPile.length === 0) {
            return {
                success: false,
                error: 'Draw pile is empty'
            };
        }

        // Draw tile from pile
        const drawnTile = gameState.drawPile.shift();
        player.hand.push(drawnTile);

        // Add to move history
        move.tile = drawnTile;
        gameState.moves.push(move);

        // Reset consecutive passes
        player.consecutivePasses = 0;

        // Update total moves
        gameState.totalMoves = (gameState.totalMoves || 0) + 1;

        // Update last action
        player.lastAction = new Date();

        // Check if drawn tile can be played immediately
        const hasValidMoves = this.hasValidMoves(player.hand, gameState.board);

        if (hasValidMoves) {
            // Player can continue their turn with new tile
            gameState.turnStartTime = new Date();
        } else {
            // Auto-pass since no valid moves even with new tile
            return this.processPassMove(gameState, playerIndex, {
                player: playerIndex,
                action: 'PASS',
                timestamp: new Date(),
                reason: 'NO_VALID_MOVES_AFTER_DRAW'
            });
        }

        return {
            success: true,
            gameState,
            move
        };
    }

    static processPassMove(gameState, playerIndex, move) {
        const player = gameState.players[playerIndex];

        // Increment consecutive passes
        player.consecutivePasses++;

        // Add to move history
        gameState.moves.push(move);

        // Update total moves
        gameState.totalMoves = (gameState.totalMoves || 0) + 1;

        // Update last action
        player.lastAction = new Date();

        // Check if game should be blocked using enhanced logic
        const blockCheck = this.checkGameBlocked(gameState);

        if (blockCheck.isBlocked) {
            // Game is blocked - end it
            const winnerCheck = this.checkGameCompletion(gameState, true);
            gameState.gameState = 'BLOCKED';  // Use BLOCKED instead of COMPLETED
            gameState.winner = winnerCheck.winner;
            gameState.endReason = blockCheck.reason === 'NO_MOVES_NO_TILES' ? 'BLOCKED_NO_MOVES' : 'BLOCKED_ALL_PASSED';
            gameState.finalScores = winnerCheck.finalScores;
            gameState.completedAt = new Date();

            // Calculate duration
            if (gameState.startedAt) {
                gameState.duration = Math.floor((new Date() - new Date(gameState.startedAt)) / 1000);
            }
        } else {
            gameState.currentPlayer = this.getNextPlayer(gameState);
            gameState.turnStartTime = new Date();
        }

        return {
            success: true,
            gameState,
            move
        };
    }

    static checkGameBlocked(gameState) {
        // Check condition 1: No players have playable tiles AND no tiles to draw
        const noPlayableTiles = gameState.players.every(player =>
            !this.hasValidMoves(player.hand, gameState.board)
        );
        const noTilesToDraw = gameState.drawPile.length === 0;

        console.log(`Checking if game is blocked`);
        console.log(`noPlayableTiles => ${noPlayableTiles} and noTilesToDraw => ${noTilesToDraw}`)

        if (noPlayableTiles && noTilesToDraw) {
            return {
                isBlocked: true,
                reason: 'NO_MOVES_NO_TILES'
            };
        }

        // Check condition 2: All players have passed for last 2 attempts
        // This means consecutivePasses >= 3 for ALL players
        const allPlayersPassedThreeTimes = gameState.players.every(player => player.consecutivePasses >= 2);

        console.log(`All players have passed for last 2 attempts: ${allPlayersPassedThreeTimes}`);

        if (allPlayersPassedThreeTimes) {
            return {
                isBlocked: true,
                reason: 'ALL_PASSED_TWO_TIMES'
            };
        }

        return { isBlocked: false };
    }

    static checkGameCompletion(gameState, forcedEnd = false) {
        // Check if any player has no tiles left
        const emptyHandPlayer = gameState.players.find(p => p.hand.length === 0);
        if (emptyHandPlayer) {
            return {
                isComplete: true,
                winner: emptyHandPlayer.position,
                endReason: 'LAST_TILE',
                finalScores: this.calculateFinalScores(gameState.players)
            };
        }

        // If forced end (blocked game), find winner by lowest dots
        if (forcedEnd) {
            const playerScores = gameState.players.map(p => ({
                position: p.position,
                dots: this.calculateDots(p.hand)
            }));

            const lowestDots = Math.min(...playerScores.map(s => s.dots));
            const winner = playerScores.find(s => s.dots === lowestDots);

            return {
                isComplete: true,
                winner: winner.position,
                endReason: 'LOWEST_DOTS',
                finalScores: this.calculateFinalScores(gameState.players)
            };
        }

        return { isComplete: false };
    }

    // Calculate final scores
    static calculateFinalScores(players) {
        return players.map(player => ({
            position: player.position,
            dotsRemaining: this.calculateDots(player.hand),
            tilesRemaining: player.hand.length
        }));
    }

    // Get next player in turn order
    static getNextPlayer(gameState) {
        let nextPlayer = (gameState.currentPlayer + 1) % gameState.players.length;

        // Skip disconnected players if needed
        let attempts = 0;
        while (!gameState.players[nextPlayer].isConnected && attempts < gameState.players.length) {
            nextPlayer = (nextPlayer + 1) % gameState.players.length;
            attempts++;
        }

        return nextPlayer;
    }

    // Determine game winner
    static determineWinner(players, winRule, targetPoints = 100) {
        // Check if any player has no tiles left
        const emptyHandPlayer = players.find(p => p.hand.length === 0);
        if (emptyHandPlayer) {
            if (winRule === 'POINT_BASED') {
                // For point-based, calculate points for the round winner
                const roundScores = this.calculateRoundScores(players, emptyHandPlayer.position);
                const roundWinner = emptyHandPlayer.position;
                const winnerScore = roundScores.find(s => s.position === roundWinner);

                // Check if target points reached
                if (winnerScore.totalScore >= targetPoints) {
                    return {
                        winner: roundWinner,
                        endReason: 'POINTS_REACHED',
                        roundWinner,
                        finalScores: roundScores,
                        gameCompleted: true
                    };
                } else {
                    return {
                        winner: null,
                        endReason: 'ROUND_WON',
                        roundWinner,
                        finalScores: roundScores,
                        gameCompleted: false
                    };
                }
            }

            return {
                winner: emptyHandPlayer.position,
                endReason: 'LAST_TILE',
                finalScores: this.calculateFinalScores(players),
                gameCompleted: true
            };
        }

        // Check for blocked game (all players passed)
        if (players.every(p => p.consecutivePasses > 0)) {
            const playerScores = players.map(p => ({
                position: p.position,
                dots: this.calculateDots(p.hand)
            }));

            const lowestDots = Math.min(...playerScores.map(s => s.dots));
            const winner = playerScores.find(s => s.dots === lowestDots);

            return {
                winner: winner.position,
                endReason: 'LOWEST_DOTS',
                finalScores: this.calculateFinalScores(players),
                gameCompleted: true
            };
        }

        return { winner: null, gameCompleted: false };
    }

    // Calculate round scores for point-based games
    static calculateRoundScores(players, roundWinner) {
        return players.map(player => {
            const dotsRemaining = this.calculateDots(player.hand);
            let roundScore = 0;

            if (player.position === roundWinner) {
                // Winner gets points from all other players' remaining tiles
                roundScore = players
                    .filter(p => p.position !== roundWinner)
                    .reduce((sum, p) => sum + this.calculateDots(p.hand), 0);
            }

            return {
                position: player.position,
                dotsRemaining,
                roundScore,
                totalScore: (player.totalScore || 0) + roundScore
            };
        });
    }

    // Generate room ID
    static generateRoomId() {
        const prefix = 'DOM';
        const randomPart = crypto.randomBytes(4).toString('hex');
        const timestamp = Date.now().toString(36);
        return `${prefix}_${randomPart}_${timestamp}`;
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

    static startNewRound(players, tilesPerPlayer = 7) {
        // Reset player hands and states
        const resetPlayers = players.map(p => ({
            ...p,
            hand: [],
            consecutivePasses: 0,
            lastAction: new Date()
        }));

        // Generate new tile set and distribute
        const tiles = this.generateDominoSet();
        const { players: playersWithHands, drawPile } = this.dealTiles(resetPlayers.length, tilesPerPlayer);

        // Assign hands to players
        resetPlayers.forEach((player, index) => {
            player.hand = playersWithHands[index].hand;
        });

        return {
            players: resetPlayers,
            drawPile,
            board: [],
            currentPlayer: 0, // Start with first player
            gameState: 'ACTIVE'
        };
    }
}