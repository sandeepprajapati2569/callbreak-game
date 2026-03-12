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
  top: "absolute top-[clamp(64px,10vh,108px)] left-1/2 -translate-x-1/2 z-30",
  left: "absolute left-[max(4px,1.2vw)] sm:left-4 top-[46%] -translate-y-1/2 z-30",
  right: "absolute right-[max(4px,1.2vw)] sm:right-4 top-[46%] -translate-y-1/2 z-30",
  "top-left": "absolute top-[clamp(62px,9.5vh,104px)] left-[10%] sm:left-[16%] z-30",
  "top-right": "absolute top-[clamp(62px,9.5vh,104px)] right-[10%] sm:right-[16%] z-30",
  "bottom-left":
    "absolute bottom-[108px] sm:bottom-32 left-[10%] sm:left-[16%] z-30",
  "bottom-right":
    "absolute bottom-[108px] sm:bottom-32 right-[10%] sm:right-[16%] z-30",
};

const LANDSCAPE_POSITION_STYLES = {
  top: "absolute top-[46px] left-1/2 -translate-x-1/2 z-30",
  left: "absolute left-2 top-[44%] -translate-y-1/2 z-30",
  right: "absolute right-2 top-[44%] -translate-y-1/2 z-30",
  "top-left": "absolute top-[46px] left-[10%] z-30",
  "top-right": "absolute top-[46px] right-[10%] z-30",
  "bottom-left": "absolute bottom-[94px] left-[10%] z-30",
  "bottom-right": "absolute bottom-[94px] right-[10%] z-30",
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
    roomCode,
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
  const phaseLabel =
    phase === "BIDDING"
      ? "Bidding"
      : phase === "PLAYING"
        ? "Live Trick"
        : "Starting";
  const hudTopOffset = isLandscapeMobile
    ? "6px"
    : "calc(env(safe-area-inset-top, 0px) + var(--native-status-bar-offset, 0px) + 4px)";
  const bottomStationPositionClass = isLandscapeMobile
    ? phase === "BIDDING"
      ? "bottom-[78px]"
      : "bottom-[96px]"
    : isMobile
      ? "bottom-[118px]"
      : "bottom-[118px] sm:bottom-32";
  const turnBannerTop = isLandscapeMobile
    ? "calc(50% - 64px)"
    : isMobile
      ? "calc(50% - 78px)"
      : "calc(50% - 100px)";
  const tableFrameSize = isLandscapeMobile
    ? "w-[min(62vw,430px)] h-[min(43vh,230px)]"
    : isMobile
      ? "w-[min(84vw,360px)] h-[min(33vh,230px)]"
      : "w-[min(58vw,560px)] h-[min(48vh,360px)]";

  return (
    <div
      className="w-full h-full felt-bg relative flex items-center justify-center overflow-hidden"
      style={{ paddingTop: "0px" }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-32 bg-[linear-gradient(180deg,rgba(0,0,0,0.32),transparent)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(0deg,rgba(0,0,0,0.36),transparent)]" />
        <motion.div
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[44%] border ${tableFrameSize}`}
          style={{
            borderColor: "rgba(212, 175, 55, 0.18)",
            background:
              "radial-gradient(circle at center, rgba(17, 91, 57, 0.55) 0%, rgba(9, 50, 31, 0.28) 56%, rgba(0, 0, 0, 0) 100%)",
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.03), inset 0 0 50px rgba(0,0,0,0.2), 0 40px 120px rgba(0,0,0,0.25)",
          }}
          animate={{ scale: [1, 1.015, 1], opacity: [0.92, 1, 0.92] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <div
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[44%] border border-dashed ${tableFrameSize}`}
          style={{ borderColor: "rgba(212, 175, 55, 0.14)" }}
        />
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
          style={{
            width: isLandscapeMobile ? "88px" : isMobile ? "104px" : "132px",
            height: isLandscapeMobile ? "88px" : isMobile ? "104px" : "132px",
            borderColor: "rgba(212, 175, 55, 0.14)",
            boxShadow: "0 0 30px rgba(212, 175, 55, 0.08)",
          }}
        />
      </div>

      {/* Top HUD: aligned for native status bar + landscape */}
      <div
        className="absolute left-0 right-0 z-20 px-2 sm:px-4"
        style={{
          top: hudTopOffset,
        }}
      >
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 sm:gap-3">
          <div className="justify-self-start flex items-center gap-1.5 sm:gap-2">
            <motion.button
              onClick={handleLeaveRoom}
              className="game-icon-button text-red-300/75 hover:text-red-300 hover:bg-red-500/10 transition-all"
              style={{
                background: "linear-gradient(180deg, rgba(65, 16, 16, 0.92), rgba(33, 10, 10, 0.92))",
                borderColor: "rgba(239, 68, 68, 0.18)",
              }}
              whileTap={{ scale: 0.9 }}
              title="Leave game"
            >
              <LogOut size={14} />
            </motion.button>
            <div className="game-hud-surface px-1.5 py-1.5 sm:px-2 sm:py-2 rounded-2xl">
              <VoiceChat voiceChat={voiceChat} />
            </div>
          </div>

          <div className="justify-self-center min-w-0">
            <div className="game-hud-surface text-center px-3 py-2.5 sm:px-4 sm:py-3 min-w-[188px] sm:min-w-[248px]">
              <div className="flex items-center justify-center gap-2 text-[9px] sm:text-[10px] uppercase tracking-[0.26em]">
                <span
                  className="game-pill px-2 py-0.5"
                >
                  {phaseLabel}
                </span>
                {roomCode && (
                  <span className="opacity-45 truncate max-w-[110px] sm:max-w-none">
                    Table {roomCode}
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center justify-center gap-4 sm:gap-6">
                <div>
                  <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.24em] opacity-45">
                    Round
                  </p>
                  <p className="mt-1 text-sm sm:text-base font-semibold text-gold">
                    {currentRound || 1}
                  </p>
                </div>
                <div className="h-8 w-px bg-white/10" />
                <div>
                  <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.24em] opacity-45">
                    Trick
                  </p>
                  <p className="mt-1 text-sm sm:text-base font-semibold text-gold">
                    {(currentTrick || 0) + 1}
                  </p>
                </div>
              </div>
            </div>
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
          style={{ top: turnBannerTop }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTurn}
              className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-[20px] text-xs sm:text-sm font-medium whitespace-nowrap text-center"
              style={{
                background:
                  currentTurn === playerId
                    ? "linear-gradient(135deg, rgba(240, 208, 96, 0.98), rgba(212, 175, 55, 0.95))"
                    : "linear-gradient(180deg, rgba(8, 42, 26, 0.92), rgba(4, 22, 14, 0.96))",
                color: currentTurn === playerId ? "#000" : "var(--gold)",
                border: "1px solid rgba(212, 175, 55, 0.45)",
                boxShadow:
                  currentTurn === playerId
                    ? "0 10px 30px rgba(212, 175, 55, 0.34)"
                    : "0 10px 24px rgba(0, 0, 0, 0.22)",
              }}
              initial={{ opacity: 0, y: -10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ duration: 0.25 }}
            >
              <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.24em] opacity-65">
                {currentTurn === playerId ? "Now Playing" : "Turn"}
              </div>
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
          className={`absolute left-1/2 -translate-x-1/2 z-10 ${bottomStationPositionClass}`}
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
