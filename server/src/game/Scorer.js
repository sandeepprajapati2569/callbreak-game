/**
 * Scores a round of Call Break for all players.
 *
 * Scoring rules:
 * - If a player wins at least as many tricks as their bid:
 *     score = bid + (overtricks * 0.1)
 * - If a player wins fewer tricks than their bid:
 *     score = -bid (negative penalty)
 *
 * @param {Array} players - Array of { id, bid, tricksWon } objects.
 * @returns {Array} Array of { playerId, roundScore } objects.
 */
export function scoreRound(players) {
  if (!players || players.length === 0) {
    throw new Error('Cannot score round: no players provided');
  }

  return players.map((player) => {
    if (player.bid == null || player.bid < 1 || player.bid > 13) {
      throw new Error(
        `Invalid bid for player ${player.id}: ${player.bid}. Must be 1-13.`
      );
    }

    let roundScore;

    if (player.tricksWon >= player.bid) {
      const overtricks = player.tricksWon - player.bid;
      roundScore = player.bid + overtricks * 0.1;
    } else {
      roundScore = -player.bid;
    }

    return {
      playerId: player.id,
      roundScore,
    };
  });
}
