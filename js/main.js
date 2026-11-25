import { create2D } from "./game2d.js";
import { MultiplayerClient } from "./multiplayer.js";

const multiplayer = new MultiplayerClient();

const $ = id => document.getElementById(id);

const lobbyScreen = $("lobbyScreen");
const gameScreen = $("gameScreen");
const onlineModal = $("onlineModal");
const waitingRoomOverlay = $("waitingRoomOverlay");
const victoryOverlay = $("victoryOverlay");

const canvas = $("gameCanvas");
const container3D = $("game3D");

const MAP_WIDTH = 1280;
const MAP_HEIGHT = 820;
const CENTER = { x: 640, y: 410 };
const ARENA_RADIUS = 370;
const PLAYER_RADIUS = 18;

const COLORS = [
    "#54e5d4", "#ff6c9d", "#ffd166", "#8c9eff",
    "#b58cff", "#ff966b", "#7ee081", "#f18bd7"
];

let visualMode = "2d";
let gameMode = null;
let state = null;
let renderer = null;
let localPlayerId = null;

let aim = null;
let dragging = false;
let localTimer = null;
let botThinkTimer = null;
let countdownStarted = false;

// ESCOLHA 2D OU 3D
function selectVisual(mode) {
    visualMode = mode;
    $("select2D").classList.toggle("selected", mode === "2d");
    $("select3D").classList.toggle("selected", mode === "3d");
}

$("select2D").addEventListener("click", () => selectVisual("2d"));
$("select3D").addEventListener("click", () => selectVisual("3d"));

// MODAL DE SALA ONLINE
$("onlineButton").addEventListener("click", () => {
    $("onlineModalError").textContent = "";
    onlineModal.hidden = false;
    $("playerNameInput").focus();
});

$("closeOnlineModal").addEventListener("click", () => {
    onlineModal.hidden = true;
});

$("createRoomButton").addEventListener("click", async () => {
    const name = $("playerNameInput").value.trim() || "Jogador 1";
    $("onlineModalError").textContent = "";
    await enterGame("online");
    multiplayer.createRoom(name);
});

$("joinRoomButton").addEventListener("click", async () => {
    const code = $("roomCodeInput").value.trim().toUpperCase();
    if (!code || code.length < 4) {
        $("onlineModalError").textContent = "Digite o código de 4 letras da sala!";
        return;
    }
    const name = $("playerNameInput").value.trim() || "Convidado";
    $("onlineModalError").textContent = "";
    await enterGame("online");
    multiplayer.joinRoom(code, name);
});

$("roomCodeInput").addEventListener("keydown", e => {
    if (e.key === "Enter") $("joinRoomButton").click();
});

$("botsButton").addEventListener("click", () => enterGame("bots"));

// BOTÕES DE COMPLETAR COM BOTS NO LOBBY ONLINE
$("modeHumansOnly").addEventListener("click", () => {
    if (state?.hostId !== localPlayerId) return;
    multiplayer.setFillBots(false);
});

$("modeFillBots").addEventListener("click", () => {
    if (state?.hostId !== localPlayerId) return;
    multiplayer.setFillBots(true);
});

// COPIAR CÓDIGO DA SALA
function copyRoomCode(btn) {
    const code = multiplayer.roomId;
    if (!code) return;
    navigator.clipboard?.writeText(code);
    const original = btn.textContent;
    btn.textContent = "✓ COPIADO!";
    setTimeout(() => {
        btn.textContent = original;
    }, 1500);
}

$("copyCodeButton").addEventListener("click", () => copyRoomCode($("copyCodeButton")));
$("copyCodeBigButton").addEventListener("click", () => copyRoomCode($("copyCodeBigButton")));

$("startOnlineMatchButton").addEventListener("click", () => {
    multiplayer.startMatch();
});

// ENTRAR NA TELA DE JOGO
async function enterGame(mode) {
    gameMode = mode;

    onlineModal.hidden = true;
    lobbyScreen.hidden = true;
    gameScreen.hidden = false;
    victoryOverlay.hidden = true;
    waitingRoomOverlay.hidden = true;

    $("selectedMode").textContent = visualMode === "2d" ? "MODO 2D" : "MODO 3D";

    canvas.hidden = visualMode !== "2d";
    container3D.hidden = visualMode !== "3d";

    if (renderer) {
        renderer.destroy();
        renderer = null;
    }

    if (visualMode === "2d") {
        renderer = create2D(canvas);
    } else {
        try {
            $("canvasHint").textContent = "A carregar arena 3D...";
            const mod3d = await import("./game3d.js");
            renderer = mod3d.create3D(container3D);
            if (renderer.element) {
                registerAimEvents(renderer.element);
            }
        } catch (err) {
            console.error("Erro ao carregar 3D, a voltar para 2D:", err);
            visualMode = "2d";
            canvas.hidden = false;
            container3D.hidden = true;
            $("selectedMode").textContent = "MODO 2D";
            renderer = create2D(canvas);
        }
    }

    aim = null;
    dragging = false;
    updatePower(0);

    if (mode === "bots") {
        $("connectionText").textContent = "Modo local";
        $("connection").classList.add("online");
        $("roomCode").textContent = "BOTS";
        $("modeName").textContent = "Partida contra Bots";
        $("copyCodeButton").hidden = true;
        startBotsGame();
    } else {
        $("connectionText").textContent = "Conectando...";
        $("connection").classList.remove("online");
        $("roomCode").textContent = "----";
        $("modeName").textContent = "Multiplayer Online";
        $("copyCodeButton").hidden = false;
    }
}

// SAIR
function leaveGame() {
    stopLocalGame();
    multiplayer.disconnect();

    if (renderer) {
        renderer.destroy();
        renderer = null;
    }

    state = null;
    aim = null;
    dragging = false;
    localPlayerId = null;

    victoryOverlay.hidden = true;
    waitingRoomOverlay.hidden = true;
    lobbyScreen.hidden = false;
    gameScreen.hidden = true;

    $("connectionText").textContent = "Desconectado";
    $("connection").classList.remove("online");
}

$("backButton").addEventListener("click", leaveGame);
$("victoryLobbyButton").addEventListener("click", leaveGame);

// REINICIAR / JOGAR NOVAMENTE
function restartMatch() {
    victoryOverlay.hidden = true;
    if (gameMode === "bots") {
        startBotsGame();
    } else if (state?.hostId === localPlayerId) {
        multiplayer.startMatch();
    }
}

$("resetButton").addEventListener("click", restartMatch);
$("playAgainButton").addEventListener("click", restartMatch);

// CONEXÃO ONLINE
multiplayer.onConnection = connected => {
    $("connectionText").textContent = connected ? "Conectado" : "Desconectado";
    $("connection").classList.toggle("online", connected);
};

multiplayer.onError = message => {
    if (!state || state.status === "waiting") {
        leaveGame();
        onlineModal.hidden = false;
        $("onlineModalError").textContent = message;
    } else {
        $("canvasHint").textContent = message;
    }
};

multiplayer.onUpdate = newState => {
    if (gameMode !== "online") return;

    const prevStatus = state?.status;
    state = newState;
    localPlayerId = multiplayer.playerId;

    if (prevStatus !== "aiming" && state.status === "aiming") {
        aim = null;
        dragging = false;
        updatePower(0);
        renderer?.setAim(null);
    }

    if (state.status !== "aiming") {
        aim = null;
        dragging = false;
        renderer?.setAim(null);
    }

    $("roomCode").textContent = multiplayer.roomId || "----";
    updateGame();
};

// JOGO LOCAL CONTRA BOTS
function startBotsGame() {
    stopLocalGame();

    localPlayerId = "local";
    aim = null;
    dragging = false;
    victoryOverlay.hidden = true;
    waitingRoomOverlay.hidden = true;
    updatePower(0);

    state = {
        status: "aiming",
        round: 1,
        countdown: null,
        winnerId: null,
        winnerName: null,
        localPlayerId,
        players: []
    };

    state.players.push({
        id: "local",
        name: "Você",
        x: CENTER.x,
        y: CENTER.y,
        vx: 0,
        vy: 0,
        angle: 0,
        power: 0,
        alive: true,
        falling: false,
        fallScale: 1,
        ready: false,
        bot: false
    });

    for (let i = 0; i < 7; i++) {
        state.players.push({
            id: "bot" + i,
            name: "Bot " + (i + 1),
            x: CENTER.x,
            y: CENTER.y,
            vx: 0,
            vy: 0,
            angle: 0,
            power: 0,
            alive: true,
            falling: false,
            fallScale: 1,
            ready: false,
            bot: true
        });
    }

    positionPlayers();
    renderer?.setAim(null);
    updateGame();
    scheduleBotsTurn();
}

function positionPlayers() {
    const alive = state.players.filter(p => p.alive);
    const radius = 235;

    alive.forEach((p, i) => {
        const angle = (Math.PI * 2 * i) / alive.length - Math.PI / 2;

        p.x = CENTER.x + Math.cos(angle) * radius;
        p.y = CENTER.y + Math.sin(angle) * radius;

        p.vx = 0;
        p.vy = 0;
        p.angle = 0;
        p.power = 0;
        p.ready = false;
        p.falling = false;
        p.fallScale = 1;
    });
}

function scheduleBotsTurn() {
    if (botThinkTimer) {
        clearTimeout(botThinkTimer);
        botThinkTimer = null;
    }

    if (!state || gameMode !== "bots" || state.status !== "aiming") return;

    botThinkTimer = setTimeout(() => {
        if (!state || state.status !== "aiming") return;

        state.players.forEach(bot => {
            if (!bot.bot || !bot.alive || bot.ready) return;

            const targets = state.players.filter(p => p.alive && p.id !== bot.id);
            const target = targets[Math.floor(Math.random() * targets.length)];

            if (target) {
                bot.angle = Math.atan2(target.y - bot.y, target.x - bot.x);
            } else {
                bot.angle = Math.atan2(CENTER.y - bot.y, CENTER.x - bot.x);
            }

            bot.angle += (Math.random() - 0.5) * 0.45;
            bot.power = Math.round(35 + Math.random() * 50);
            bot.ready = true;
        });

        updateGame();
        checkAllReadyLocal();
    }, 900);
}

function checkAllReadyLocal() {
    if (!state || state.status !== "aiming") return;

    const alive = state.players.filter(p => p.alive);
    if (alive.length <= 1) {
        finishGame(alive[0]);
        return;
    }

    if (alive.every(p => p.ready)) {
        startCountdown();
    }
}

// MIRA E FORÇA
function pointerPosition(event, element) {
    const rect = element.getBoundingClientRect();
    return {
        x: ((event.clientX - rect.left) * MAP_WIDTH) / Math.max(1, rect.width),
        y: ((event.clientY - rect.top) * MAP_HEIGHT) / Math.max(1, rect.height)
    };
}

function getAimElement() {
    return visualMode === "2d"
        ? canvas
        : renderer?.element || container3D.querySelector("canvas");
}

function getPlayer() {
    return state?.players.find(p => p.id === localPlayerId);
}

function startAim(event) {
    if (!state || state.status !== "aiming") return;

    const player = getPlayer();
    if (!player || !player.alive || player.ready) return;

    const element = getAimElement();
    if (!element) return;

    const pos = pointerPosition(event, element);

    dragging = true;

    aim = {
        x: pos.x,
        y: pos.y,
        startX: pos.x,
        startY: pos.y,
        angle: player.angle || 0,
        power: player.power || 0
    };

    if (element.setPointerCapture) {
        try {
            element.setPointerCapture(event.pointerId);
        } catch (_) {}
    }
}

function moveAim(event) {
    if (!dragging || !aim) return;

    const element = getAimElement();
    if (!element) return;

    const pos = pointerPosition(event, element);

    const dx = aim.startX - pos.x;
    const dy = aim.startY - pos.y;
    const distance = Math.hypot(dx, dy);

    aim.x = pos.x;
    aim.y = pos.y;

    if (distance > 5) {
        aim.angle = Math.atan2(dy, dx);
    }

    aim.power = Math.min(100, Math.round(distance / 2.2));

    const player = getPlayer();
    if (player) {
        player.angle = aim.angle;
        player.power = aim.power;
    }

    updatePower(aim.power);
    updateRendererAim();
    updateReadyButtonState();
}

function endAim(event) {
    if (!dragging || !aim) return;

    dragging = false;

    const element = getAimElement();
    if (element?.releasePointerCapture && event?.pointerId != null) {
        try {
            element.releasePointerCapture(event.pointerId);
        } catch (_) {}
    }

    const player = getPlayer();
    if (!player) return;

    player.angle = aim.angle;
    player.power = Math.max(0, aim.power);

    if (gameMode === "online" && player.power > 0) {
        multiplayer.setAim(player.angle, player.power);
    }

    updateRendererAim();
    updateGame();
}

function updateRendererAim() {
    renderer?.setAim(aim);
}

function updatePower(power) {
    $("powerValue").textContent = power + "%";
    $("powerBar").style.width = power + "%";
}

function registerAimEvents(element) {
    if (!element || element.dataset.aimBound) return;
    element.dataset.aimBound = "true";

    element.addEventListener("pointerdown", startAim);
    element.addEventListener("pointermove", moveAim);
    element.addEventListener("pointerup", endAim);
    element.addEventListener("pointercancel", endAim);
}

registerAimEvents(canvas);

// CONFIRMAR JOGADA
$("readyButton").addEventListener("click", () => {
    if (!state || state.status !== "aiming") return;

    const player = getPlayer();
    if (!player || !player.alive || player.ready) return;

    if (player.power <= 0) {
        $("canvasHint").textContent = "Arraste na arena para definir força e direção primeiro!";
        return;
    }

    if (gameMode === "online") {
        multiplayer.setAim(player.angle, player.power);
        multiplayer.ready();
        player.ready = true;
        updateGame();
        return;
    }

    player.ready = true;
    updateGame();
    checkAllReadyLocal();
});

// CONTAGEM REGRESSIVA
function startCountdown() {
    if (countdownStarted) return;
    countdownStarted = true;

    const player = getPlayer();
    let count = player?.alive ? 3 : 1;

    state.countdown = count;
    updateGame();

    localTimer = setInterval(() => {
        count--;
        state.countdown = count;
        updateGame();

        if (count <= 0) {
            clearInterval(localTimer);
            localTimer = null;
            launchPlayers();
        }
    }, 1000);
}

// LANÇAMENTO SIMULTÂNEO
function launchPlayers() {
    state.status = "running";
    state.countdown = null;
    aim = null;
    renderer?.setAim(null);

    state.players.forEach(p => {
        if (!p.alive) return;

        const force = 2.5 + (p.power / 100) * 8.5;
        p.vx = Math.cos(p.angle) * force;
        p.vy = Math.sin(p.angle) * force;
    });

    updateGame();

    let ticks = 0;

    localTimer = setInterval(() => {
        ticks++;

        const alive = state.players.filter(p => p.alive);

        alive.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;

            if (p.falling) {
                p.vx *= 0.94;
                p.vy *= 0.94;
                p.fallScale -= 0.05;

                if (p.fallScale <= 0.05) {
                    p.alive = false;
                    p.falling = false;
                }
                return;
            }

            p.vx *= 0.982;
            p.vy *= 0.982;

            if (Math.hypot(p.x - CENTER.x, p.y - CENTER.y) > ARENA_RADIUS) {
                p.falling = true;
                p.fallScale = 1;
            }
        });

        const onPlatform = state.players.filter(p => p.alive && !p.falling);

        for (let i = 0; i < onPlatform.length; i++) {
            for (let j = i + 1; j < onPlatform.length; j++) {
                const a = onPlatform[i];
                const b = onPlatform[j];

                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const distance = Math.hypot(dx, dy);

                if (distance > 0 && distance < PLAYER_RADIUS * 2) {
                    const nx = dx / distance;
                    const ny = dy / distance;

                    const overlap = PLAYER_RADIUS * 2 - distance;

                    a.x -= (nx * overlap) / 2;
                    a.y -= (ny * overlap) / 2;

                    b.x += (nx * overlap) / 2;
                    b.y += (ny * overlap) / 2;

                    const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;

                    if (relative < 0) {
                        const impulse = -relative * 1.2;

                        a.vx -= impulse * nx;
                        a.vy -= impulse * ny;

                        b.vx += impulse * nx;
                        b.vy += impulse * ny;

                        renderer?.burst(
                            (a.x + b.x) / 2,
                            (a.y + b.y) / 2,
                            "#ffffff"
                        );
                    }
                }
            }
        }

        updateGame();

        const stillOnPlatform = state.players.filter(p => p.alive && !p.falling);
        const anyoneFalling = state.players.some(p => p.alive && p.falling);
        const allStopped = stillOnPlatform.every(p => Math.hypot(p.vx, p.vy) < 0.15);

        if (!anyoneFalling && (stillOnPlatform.length <= 1 || ticks >= 240 || (ticks > 25 && allStopped))) {
            clearInterval(localTimer);
            localTimer = null;

            if (stillOnPlatform.length <= 1) {
                finishGame(stillOnPlatform[0]);
            } else {
                state.round++;
                state.status = "aiming";
                state.countdown = null;
                countdownStarted = false;

                state.players.forEach(p => {
                    p.vx = 0;
                    p.vy = 0;
                    p.angle = 0;
                    p.power = 0;
                    p.ready = false;
                });

                aim = null;
                renderer?.setAim(null);
                updatePower(0);
                updateGame();

                scheduleBotsTurn();
            }
        }
    }, 30);
}

function finishGame(winner) {
    state.status = "finished";
    state.winnerId = winner?.id || null;
    state.winnerName = winner?.name || "Ninguém";
    updateGame();
}

function stopLocalGame() {
    if (localTimer) {
        clearInterval(localTimer);
        localTimer = null;
    }
    if (botThinkTimer) {
        clearTimeout(botThinkTimer);
        botThinkTimer = null;
    }
    countdownStarted = false;
}

function updateReadyButtonState() {
    const player = getPlayer();
    const canReady =
        player &&
        player.alive &&
        !player.ready &&
        player.power > 0 &&
        state?.status === "aiming" &&
        (gameMode === "bots" || state.players.length >= 2);

    $("readyButton").disabled = !canReady;
}

function updateGame() {
    if (!state) return;

    state.localPlayerId = localPlayerId;
    const player = getPlayer();

    $("playerCount").textContent = state.players.length + "/8";
    $("roundInfo").textContent = state.round > 0 ? "Rodada " + state.round : "Sala de espera";

    const labels = {
        waiting: "Aguardando jogadores",
        aiming: "Escolhendo jogadas",
        running: "Lançamento!",
        finished: "Partida finalizada"
    };

    $("gameStatus").textContent = labels[state.status] || "Carregando";

    $("timer").textContent =
        state.status === "aiming" && state.countdown != null
            ? Math.max(0, Math.ceil(state.countdown))
            : state.status === "running"
                ? "GO!"
                : "--";

    updateReadyButtonState();

    $("readyButton").textContent = !player?.alive
        ? "VOCÊ FOI ELIMINADO"
        : player?.ready
            ? "AGUARDANDO..."
            : "CONFIRMAR JOGADA";

    const list = $("playersList");
    list.replaceChildren();

    state.players.forEach((p, i) => {
        const row = document.createElement("div");
        const isWinner = state.status === "finished" && p.alive;
        row.className = "player-row" + (!p.alive ? " eliminated" : "") + (isWinner ? " winner" : "");

        const dot = document.createElement("span");
        dot.className = "player-dot";
        dot.style.background = COLORS[i % COLORS.length];
        dot.style.color = COLORS[i % COLORS.length];

        const name = document.createElement("span");
        name.className = "player-name";
        const crown = p.isHost ? "👑 " : "";
        name.textContent = crown + p.name + (p.id === localPlayerId ? " (você)" : "");

        const status = document.createElement("small");
        if (state.status === "waiting") {
            status.textContent = p.isHost ? "LÍDER" : "NA SALA";
        } else if (state.status === "finished") {
            status.textContent = p.alive ? "🏆 VENCEDOR" : "ELIMINADO";
        } else {
            status.textContent = !p.alive ? "ELIMINADO" : p.falling ? "CAINDO..." : p.ready ? "PRONTO" : "ESCOLHENDO";
        }

        row.append(dot, name, status);
        list.appendChild(row);
    });

    // OVERLAY DA SALA DE ESPERA ONLINE
    if (gameMode === "online" && state.status === "waiting") {
        waitingRoomOverlay.hidden = false;
        victoryOverlay.hidden = true;

        $("waitingRoomCode").textContent = state.roomId || multiplayer.roomId || "----";

        const chips = $("waitingPlayersPreview");
        chips.replaceChildren();
        state.players.forEach((p, i) => {
            const chip = document.createElement("span");
            chip.className = "waiting-chip";
            chip.style.borderColor = COLORS[i % COLORS.length];
            chip.textContent = (p.isHost ? "👑 " : "") + p.name;
            chips.appendChild(chip);
        });

        const isHost = state.hostId === localPlayerId;
        const fillBots = Boolean(state.fillWithBots);

        $("modeHumansOnly").classList.toggle("active", !fillBots);
        $("modeFillBots").classList.toggle("active", fillBots);
        $("modeHumansOnly").disabled = !isHost;
        $("modeFillBots").disabled = !isHost;

        const botsCount = Math.max(0, 8 - state.players.length);
        $("fillBotsHint").textContent = fillBots
            ? `Serão adicionados ${botsCount} bot(s) para completar 8 jogadores.`
            : "Apenas os jogadores reais da sala vão participar.";

        const startBtn = $("startOnlineMatchButton");

        if (isHost) {
            const canStart = fillBots || state.players.length >= 2;
            startBtn.disabled = !canStart;
            startBtn.textContent = !canStart
                ? "AGUARDANDO AMIGOS ENTRAREM..."
                : fillBots
                    ? `INICIAR (${state.players.length} JOGADOR(ES) + ${botsCount} BOTS)`
                    : `INICIAR PARTIDA (${state.players.length} JOGADORES)`;
        } else {
            startBtn.disabled = true;
            startBtn.textContent = "AGUARDANDO O LÍDER INICIAR...";
        }

        $("canvasHint").textContent = "Compartilhe o código da sala para seus amigos entrarem!";
    } else {
        waitingRoomOverlay.hidden = true;

        if (state.status === "finished") {
            victoryOverlay.hidden = false;
            $("winnerTitle").textContent =
                state.winnerId === localPlayerId
                    ? "Você venceu!"
                    : `${state.winnerName} venceu!`;
            $("winnerSubtitle").textContent =
                state.winnerName === "Ninguém"
                    ? `Empate! Todos caíram na Rodada ${state.round}.`
                    : `Último sobrevivente na Rodada ${state.round}.`;

            const playAgainBtn = $("playAgainButton");
            if (gameMode === "online" && state.hostId !== localPlayerId) {
                playAgainBtn.disabled = true;
                playAgainBtn.textContent = "AGUARDANDO O LÍDER REINICIAR...";
            } else {
                playAgainBtn.disabled = false;
                playAgainBtn.textContent = "JOGAR NOVAMENTE";
            }

            $("canvasHint").textContent = `${state.winnerName} venceu a partida!`;
        } else {
            victoryOverlay.hidden = true;

            if (state.status === "aiming") {
                if (!player?.alive) {
                    $("canvasHint").textContent = "Você foi eliminado! Assistindo à rodada...";
                } else if (player?.ready) {
                    $("canvasHint").textContent = "Jogada confirmada! Aguardando os outros...";
                } else if (player?.power > 0) {
                    $("canvasHint").textContent = `Força ${player.power}% definida! Clique em CONFIRMAR JOGADA.`;
                } else {
                    $("canvasHint").textContent = "Clique e arraste na arena para escolher direção e força.";
                }
            } else if (state.status === "running") {
                $("canvasHint").textContent = "TODOS LANÇADOS! SOBREVIVA!";
            }
        }
    }

    renderer?.update(state);
}

window.addEventListener("beforeunload", () => {
    stopLocalGame();
    multiplayer.disconnect();
    renderer?.destroy();
});