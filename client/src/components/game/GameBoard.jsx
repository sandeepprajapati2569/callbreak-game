import { useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut } from "lucide-react";
import { useGame } from "../../context/GameContext";
import { useSocket } from "../../context/SocketContext";
import { useVoiceChatContext } from "../../context/VoiceChatContext";
import { useOrientation } from "../../hooks/useOrientation";
import PlayerHand from "./PlayerHand";
import PlayerStation from "./PlayerStation";
import TrickArea from "./TrickArea";
import ScoreBoard from "./ScoreBoard";
import VoiceChat from "./VoiceChat";

const POSITION_MAPS = {
  2: ["bottom", "top"],
  3: ["bottom", "top-left", "top-right"],
  4: ["bottom", "left", "top", "right"],
  5: ["bottom", "bottom-left", "top-left", "top", "top-right"],
};

const POSITION_STYLES = {
  top: "absolute top-12 sm:top-16 left-1/2 -translate-x-1/2 z-30",
  left: "absolute left-1 sm:left-4 top-[45%] -translate-y-1/2 z-30",
  right: "absolute right-1 sm:right-4 top-[45%] -translate-y-1/2 z-30",
  "top-left": "absolute top-12 sm:top-16 left-[12%] sm:left-[18%] z-30",
  "top-right": "absolute top-12 sm:top-16 right-[12%] sm:right-[18%] z-30",
  "bottom-left":
    "absolute bottom-28 sm:bottom-32 left-[12%] sm:left-[18%] z-30",
  "bottom-right":
    "absolute bottom-28 sm:bottom-32 right-[12%] sm:right-[18%] z-30",
};

const LANDSCAPE_POSITION_STYLES = {
  top: "absolute top-11 left-1/2 -translate-x-1/2 z-30",
  left: "absolute left-2 top-[42%] -translate-y-1/2 z-30",
  right: "absolute right-2 top-[42%] -translate-y-1/2 z-30",
  "top-left": "absolute top-11 left-[12%] z-30",
  "top-right": "absolute top-11 right-[12%] z-30",
  "bottom-left": "absolute bottom-24 left-[12%] z-30",
  "bottom-right": "absolute bottom-24 right-[12%] z-30",
};

export default function GameBoard() {
  const navigate = useNavigate();
  const { socket, setPlayerId, setRoomCode } = useSocket();
  const { state, dispatch } = useGame();
  const {
    players,
    playerId,
    currentTurn,
    currentRound,
    currentTrick,
    bids,
    phase,
  } = state;
  const { isMobile, isLandscapeMobile } = useOrientation();

  const voiceChat = useVoiceChatContext();
  const { speakingPeers, isSelfSpeaking } = voiceChat;

  const handleLeaveRoom = useCallback(() => {
    if (!socket) return;
    socket.emit("leave-room");
    dispatch({ type: "RESET" });
    setPlayerId(null);
    setRoomCode(null);
    navigate("/");
  }, [socket, dispatch, setPlayerId, setRoomCode, navigate]);

  // Find current player's seat index
  const mySeatIndex = useMemo(() => {
    return players.findIndex((p) => p.id === playerId);
  }, [players, playerId]);

  // Get relative positions dynamically based on player count
  const positionedPlayers = useMemo(() => {
    if (mySeatIndex === -1 || players.length === 0) return [];
    const numPlayers = players.length;
    const positions = POSITION_MAPS[numPlayers] || POSITION_MAPS[4];
    return players.map((player, seatIndex) => {
      const relativePos = (seatIndex - mySeatIndex + numPlayers) % numPlayers;
      return {
        ...player,
        position: positions[relativePos],
        seatIndex,
        relativeIndex: relativePos,
      };
    });
  }, [players, mySeatIndex]);

  const bottomPlayer = positionedPlayers.find((p) => p.position === "bottom");
  const opponents = positionedPlayers.filter((p) => p.position !== "bottom");
  const hasPlayers = players.length > 0;

  return (
    <div
      className="w-full h-full felt-bg relative flex items-center justify-center overflow-hidden"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      {/* Top HUD: aligned for native status bar + landscape */}
      <div
        className="absolute left-0 right-0 z-20 px-2 sm:px-4"
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + var(--native-status-bar-offset, 0px) + 2px)",
        }}
      >
        <div className="grid grid-cols-[auto_1fr_auto] items-start gap-2">
          <div className="justify-self-start flex items-center gap-1.5">
            <motion.button
              onClick={handleLeaveRoom}
              className="glass-panel p-1.5 sm:p-2 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all rounded-lg"
              whileTap={{ scale: 0.9 }}
              title="Leave game"
            >
              <LogOut size={14} />
            </motion.button>
            <div className="glass-panel p-1 sm:p-1.5 rounded-lg">
              <VoiceChat voiceChat={voiceChat} />
            </div>
          </div>

          <div className="justify-self-center glass-panel text-center px-2 py-0.5 sm:px-4 sm:py-1.5">
            <span className="text-[10px] sm:text-xs uppercase tracking-wider opacity-50">
              Round{" "}
            </span>
            <span className="text-gold font-bold text-xs sm:text-sm">
              {currentRound || 1}
            </span>
            <span className="text-[10px] sm:text-xs uppercase tracking-wider opacity-50 ml-2 sm:ml-3">
              Trick{" "}
            </span>
            <span className="text-gold font-bold text-xs sm:text-sm">
              {(currentTrick || 0) + 1}
            </span>
          </div>

          <div className="justify-self-end">
            <ScoreBoard compact={isMobile || isLandscapeMobile} />
          </div>
        </div>
      </div>

      {/* Opponent player stations - rendered dynamically */}
      {opponents.map((player) => (
        <div
          key={player.id}
          className={
            isLandscapeMobile
              ? LANDSCAPE_POSITION_STYLES[player.position] ||
                POSITION_STYLES[player.position]
              : POSITION_STYLES[player.position]
          }
        >
          <PlayerStation
            player={player}
            position={player.position}
            isCurrentTurn={currentTurn === player.id}
            isSelf={false}
            isSpeaking={speakingPeers.has(player.id)}
            compact={isMobile || isLandscapeMobile}
          />
        </div>
      ))}

      {/* Turn indicator banner */}
      {phase === "PLAYING" && currentTurn && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-20"
          style={{
            top: isLandscapeMobile
              ? "calc(50% - 50px)"
              : isMobile
                ? "calc(50% - 65px)"
                : "calc(50% - 90px)",
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTurn}
              className="px-3 py-1 sm:px-4 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap"
              style={{
                background:
                  currentTurn === playerId
                    ? "linear-gradient(135deg, var(--gold), var(--gold-light))"
                    : "rgba(7, 40, 24, 0.9)",
                color: currentTurn === playerId ? "#000" : "var(--gold)",
                border: "1px solid rgba(212, 175, 55, 0.5)",
                boxShadow:
                  currentTurn === playerId
                    ? "0 0 20px rgba(212, 175, 55, 0.4)"
                    : "0 0 10px rgba(212, 175, 55, 0.15)",
              }}
              initial={{ opacity: 0, y: -10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ duration: 0.25 }}
            >
              {currentTurn === playerId
                ? "Your Turn!"
                : `${players.find((p) => p.id === currentTurn)?.name || "Player"}'s Turn`}
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {/* Trick area - center */}
      <div className="z-10">
        <TrickArea positionedPlayers={positionedPlayers} />
      </div>

      {/* Bottom player station (current user info, above hand) */}
      {bottomPlayer && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 z-10 ${isLandscapeMobile ? "bottom-[88px]" : isMobile ? "bottom-[112px]" : "bottom-28 sm:bottom-32"}`}
        >
          <PlayerStation
            player={bottomPlayer}
            position="bottom"
            isCurrentTurn={currentTurn === bottomPlayer.id}
            isSelf={true}
            isSpeaking={isSelfSpeaking}
            compact={isLandscapeMobile}
          />
        </div>
      )}

      {/* Player hand - bottom with safe area */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <PlayerHand />
      </div>

      {!hasPlayers && (
        <div className="absolute inset-0 z-30 flex items-center justify-center px-6">
          <div className="glass-panel w-full max-w-sm p-5 text-center">
            <p className="text-sm uppercase tracking-widest opacity-55">Connecting</p>
            <p className="mt-2 text-sm sm:text-base">Waiting for room data...</p>
          </div>
        </div>
      )}
    </div>
  );
}
