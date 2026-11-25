import { initializeApp } from "https://www.gstatic.com/firebasejs/11.4.0/firebase-app.js";
import {
    getDatabase,
    ref,
    set,
    get,
    update,
    remove,
    onValue,
    onDisconnect,
    runTransaction
} from "https://www.gstatic.com/firebasejs/11.4.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCrzroiny0utSm4g2A56pgCgNDnxiELX6k",
    authDomain: "pula-fora.firebaseapp.com",
    databaseURL: "https://pula-fora-default-rtdb.firebaseio.com",
    projectId: "pula-fora",
    storageBucket: "pula-fora.firebasestorage.app",
    messagingSenderId: "612149178203",
    appId: "1:612149178203:web:c7a16678f6e672f7f6b47e"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const CENTER = { x: 640, y: 410 };
const ARENA_RADIUS = 370;
const PLAYER_RADIUS = 18;
const MAX_PLAYERS = 8;

function makeCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function makePlayerId() {
    return "p_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function sanitizeName(raw, fallback) {
    const clean = String(raw || "").trim().slice(0, 16);
    return clean || fallback;
}

export class MultiplayerClient {
    constructor() {
        this.playerId = makePlayerId();
        this.roomId = null;
        this.unsubscribeRoom = null;
        this.disconnectRef = null;
        this.rawRoom = null;

        this.hostTimer = null;
        this.botTimer = null;
        this.countdownRunning = false;
        this.simulating = false;
        this.recordedWinnerRound = null;

        this.onConnection = null;
        this.onUpdate = null;
        this.onError = null;
    }

    isHost() {
        return Boolean(this.rawRoom && this.rawRoom.hostId === this.playerId);
    }

    playersArray(room) {
        if (!room || !room.players) return [];
        return Object.values(room.players).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    }

    toPublicState(room) {
        const list = this.playersArray(room);
        return {
            roomId: room.id,
            hostId: room.hostId,
            fillWithBots: Boolean(room.fillWithBots),
            status: room.status,
            round: room.round || 0,
            countdown: room.aimEnd ? Math.max(0, (room.aimEnd - Date.now()) / 1000) : null,
            winnerId: room.winnerId || null,
            winnerName: room.winnerName || null,
            players: list.map(p => ({
                id: p.id,
                name: p.name,
                x: p.x,
                y: p.y,
                vx: p.vx || 0,
                vy: p.vy || 0,
                angle: p.angle || 0,
                power: p.power || 0,
                alive: p.alive !== false,
                falling: Boolean(p.falling),
                fallScale: p.fallScale ?? 1,
                ready: Boolean(p.ready),
                bot: Boolean(p.bot),
                isHost: p.id === room.hostId
            }))
        };
    }

    async createRoom(name) {
        try {
            this.disconnect();
            this.playerId = makePlayerId();

            let code = makeCode();
            for (let attempt = 0; attempt < 5; attempt++) {
                const snap = await get(ref(db, `rooms/${code}`));
                if (!snap.exists()) break;
                code = makeCode();
            }

            this.roomId = code;
            const player = {
                id: this.playerId,
                name: sanitizeName(name, "Jogador 1"),
                joinedAt: Date.now(),
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
            };

            const initialRoom = {
                id: code,
                hostId: this.playerId,
                fillWithBots: false,
                status: "waiting",
                round: 0,
                aimEnd: null,
                winnerId: null,
                winnerName: null,
                createdAt: Date.now(),
                players: {
                    [this.playerId]: player
                }
            };

            await set(ref(db, `rooms/${code}`), initialRoom);
            this.subscribeToRoom(code);
        } catch (err) {
            console.error(err);
            this.onError?.("Erro ao criar sala no Firebase. Verifique as regras do Realtime Database.");
        }
    }

    async joinRoom(rawCode, name) {
        try {
            this.disconnect();
            this.playerId = makePlayerId();

            const code = String(rawCode || "").trim().toUpperCase();
            const roomSnap = await get(ref(db, `rooms/${code}`));

            if (!roomSnap.exists()) {
                this.onError?.("Sala não encontrada. Verifique o código!");
                return;
            }

            const room = roomSnap.val();
            if (room.status !== "waiting") {
                this.onError?.("Esta partida já começou!");
                return;
            }

            const humans = this.playersArray(room).filter(p => !p.bot);
            if (humans.length >= MAX_PLAYERS) {
                this.onError?.("Esta sala já está cheia (8/8)!");
                return;
            }

            this.roomId = code;
            const player = {
                id: this.playerId,
                name: sanitizeName(name, "Jogador " + (humans.length + 1)),
                joinedAt: Date.now(),
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
            };

            await set(ref(db, `rooms/${code}/players/${this.playerId}`), player);
            this.subscribeToRoom(code);
        } catch (err) {
            console.error(err);
            this.onError?.("Erro ao entrar na sala.");
        }
    }

    subscribeToRoom(code) {
        const playerRef = ref(db, `rooms/${code}/players/${this.playerId}`);
        this.disconnectRef = onDisconnect(playerRef);
        this.disconnectRef.remove().catch(() => {});

        const roomRef = ref(db, `rooms/${code}`);
        this.unsubscribeRoom = onValue(roomRef, snap => {
            if (!snap.exists()) {
                this.onConnection?.(false);
                this.onError?.("A sala foi encerrada.");
                return;
            }

            this.onConnection?.(true);
            this.rawRoom = snap.val();

            // Se o líder antigo desconectou, transfere a liderança
            const humans = this.playersArray(this.rawRoom).filter(p => !p.bot);
            if (humans.length > 0 && !this.rawRoom.players?.[this.rawRoom.hostId]) {
                if (humans[0].id === this.playerId) {
                    update(roomRef, { hostId: this.playerId });
                }
            }

            this.onUpdate?.(this.toPublicState(this.rawRoom));

            if (this.isHost()) {
                this.hostOrchestrate();
            }
        });
    }

    // ==================== LÓGICA DO LÍDER (HOST) ====================
    hostOrchestrate() {
        const room = this.rawRoom;
        if (!room) return;

        if (room.status === "aiming") {
            const list = this.playersArray(room);
            const alive = list.filter(p => p.alive);

            if (alive.length <= 1) {
                this.hostFinishGame(alive[0]);
                return;
            }

            // Bots escolhem jogada automaticamente
            const botsUnready = alive.filter(p => p.bot && !p.ready);
            if (botsUnready.length > 0 && !this.botTimer) {
                this.botTimer = setTimeout(() => {
                    this.botTimer = null;
                    if (!this.rawRoom || this.rawRoom.status !== "aiming") return;

                    const currentAlive = this.playersArray(this.rawRoom).filter(p => p.alive);
                    const updates = {};

                    currentAlive.forEach(bot => {
                        if (!bot.bot || bot.ready) return;
                        const targets = currentAlive.filter(p => p.id !== bot.id);
                        const target = targets[Math.floor(Math.random() * targets.length)];
                        let angle = target
                            ? Math.atan2(target.y - bot.y, target.x - bot.x)
                            : Math.atan2(CENTER.y - bot.y, CENTER.x - bot.x);
                        angle += (Math.random() - 0.5) * 0.45;
                        const power = Math.round(35 + Math.random() * 50);

                        updates[`players/${bot.id}/angle`] = angle;
                        updates[`players/${bot.id}/power`] = power;
                        updates[`players/${bot.id}/ready`] = true;
                    });

                    if (Object.keys(updates).length > 0) {
                        update(ref(db, `rooms/${this.roomId}`), updates);
                    }
                }, 900);
            }

            // Se todos os vivos confirmaram, inicia contagem regressiva
            if (alive.length >= 2 && alive.every(p => p.ready && p.power > 0) && !this.countdownRunning && !room.aimEnd) {
                this.countdownRunning = true;
                const hasHumans = alive.some(p => !p.bot);
                const duration = hasHumans ? 3000 : 1000;
                const aimEnd = Date.now() + duration;

                update(ref(db, `rooms/${this.roomId}`), { aimEnd });

                this.hostTimer = setTimeout(() => {
                    this.hostTimer = null;
                    this.countdownRunning = false;
                    this.hostLaunchPlayers();
                }, duration);
            }
        }
    }

    async setFillBots(fillWithBots) {
        if (!this.roomId || !this.isHost()) return;
        await update(ref(db, `rooms/${this.roomId}`), {
            fillWithBots: Boolean(fillWithBots)
        });
    }

    async startMatch() {
        if (!this.roomId || !this.isHost() || !this.rawRoom) return;

        this.clearHostTimers();
        this.recordedWinnerRound = null;

        const room = this.rawRoom;
        const humans = this.playersArray(room).filter(p => !p.bot);

        if (!room.fillWithBots && humans.length < 2) {
            this.onError?.("Aguarde pelo menos 2 jogadores ou ative 'Completar com Bots'!");
            return;
        }

        const allPlayers = [];
        humans.forEach(p => {
            allPlayers.push({
                ...p,
                alive: true,
                falling: false,
                fallScale: 1,
                ready: false,
                bot: false
            });
        });

        if (room.fillWithBots) {
            const needed = MAX_PLAYERS - humans.length;
            for (let i = 0; i < needed; i++) {
                allPlayers.push({
                    id: `bot_${i}`,
                    name: `Bot ${i + 1}`,
                    joinedAt: Date.now() + i + 1,
                    alive: true,
                    falling: false,
                    fallScale: 1,
                    ready: false,
                    bot: true
                });
            }
        }

        const radius = 235;
        const playersMap = {};
        allPlayers.forEach((p, i) => {
            const angle = (Math.PI * 2 * i) / allPlayers.length - Math.PI / 2;
            playersMap[p.id] = {
                ...p,
                x: CENTER.x + Math.cos(angle) * radius,
                y: CENTER.y + Math.sin(angle) * radius,
                vx: 0,
                vy: 0,
                angle: 0,
                power: 0
            };
        });

        await update(ref(db, `rooms/${this.roomId}`), {
            status: "aiming",
            round: 1,
            aimEnd: null,
            winnerId: null,
            winnerName: null,
            players: playersMap
        });
    }

    hostLaunchPlayers() {
        if (!this.roomId || !this.isHost() || !this.rawRoom || this.simulating) return;
        this.simulating = true;

        const simPlayers = this.playersArray(this.rawRoom).map(p => {
            if (!p.alive) return { ...p };
            const force = 2.5 + (p.power / 100) * 8.5;
            return {
                ...p,
                vx: Math.cos(p.angle) * force,
                vy: Math.sin(p.angle) * force
            };
        });

        const pushState = (extra = {}) => {
            const playersMap = {};
            simPlayers.forEach(p => {
                playersMap[p.id] = p;
            });
            return update(ref(db, `rooms/${this.roomId}`), {
                players: playersMap,
                ...extra
            });
        };

        pushState({ status: "running", aimEnd: null });

        let ticks = 0;
        this.hostTimer = setInterval(() => {
            ticks++;

            const alive = simPlayers.filter(p => p.alive);
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

            const onPlatform = simPlayers.filter(p => p.alive && !p.falling);
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
                        }
                    }
                }
            }

            // Sincroniza no Firebase a cada 3 ticks (~90ms) para suavidade sem estourar banda
            if (ticks % 3 === 0) {
                pushState();
            }

            const stillOnPlatform = simPlayers.filter(p => p.alive && !p.falling);
            const anyoneFalling = simPlayers.some(p => p.alive && p.falling);
            const allStopped = stillOnPlatform.every(p => Math.hypot(p.vx, p.vy) < 0.15);

            if (!anyoneFalling && (stillOnPlatform.length <= 1 || ticks >= 240 || (ticks > 25 && allStopped))) {
                clearInterval(this.hostTimer);
                this.hostTimer = null;
                this.simulating = false;

                if (stillOnPlatform.length <= 1) {
                    const winner = stillOnPlatform[0] || null;
                    pushState({
                        status: "finished",
                        winnerId: winner?.id || null,
                        winnerName: winner?.name || "Ninguém"
                    });
                    if (winner && !winner.bot) {
                        this.saveWinToLeaderboard(winner.name);
                    }
                } else {
                    simPlayers.forEach(p => {
                        p.vx = 0;
                        p.vy = 0;
                        p.angle = 0;
                        p.power = 0;
                        p.ready = false;
                    });
                    pushState({
                        status: "aiming",
                        round: (this.rawRoom?.round || 1) + 1,
                        aimEnd: null
                    });
                }
            }
        }, 30);
    }

    async hostFinishGame(winner) {
        if (!this.roomId || !this.isHost()) return;
        this.clearHostTimers();
        await update(ref(db, `rooms/${this.roomId}`), {
            status: "finished",
            winnerId: winner?.id || null,
            winnerName: winner?.name || "Ninguém"
        });
        if (winner && !winner.bot) {
            this.saveWinToLeaderboard(winner.name);
        }
    }

    // Salva as vitórias permanentemente no banco de dados /leaderboard
    saveWinToLeaderboard(playerName) {
        const key = playerName.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
        if (!key) return;

        const entryRef = ref(db, `leaderboard/${key}`);
        runTransaction(entryRef, current => {
            if (!current) {
                return { name: playerName, wins: 1, lastWinAt: Date.now() };
            }
            return {
                name: playerName,
                wins: (current.wins || 0) + 1,
                lastWinAt: Date.now()
            };
        }).catch(() => {});
    }

    async setAim(angle, power) {
        if (!this.roomId || !this.playerId) return;
        await update(ref(db, `rooms/${this.roomId}/players/${this.playerId}`), {
            angle,
            power: Math.max(0, Math.min(100, power))
        });
    }

    async ready() {
        if (!this.roomId || !this.playerId) return;
        await update(ref(db, `rooms/${this.roomId}/players/${this.playerId}`), {
            ready: true
        });
    }

    clearHostTimers() {
        if (this.hostTimer) {
            clearInterval(this.hostTimer);
            clearTimeout(this.hostTimer);
            this.hostTimer = null;
        }
        if (this.botTimer) {
            clearTimeout(this.botTimer);
            this.botTimer = null;
        }
        this.countdownRunning = false;
        this.simulating = false;
    }

    disconnect() {
        this.clearHostTimers();

        if (this.unsubscribeRoom) {
            this.unsubscribeRoom();
            this.unsubscribeRoom = null;
        }

        if (this.disconnectRef) {
            this.disconnectRef.cancel().catch(() => {});
            this.disconnectRef = null;
        }

        if (this.roomId && this.playerId) {
            remove(ref(db, `rooms/${this.roomId}/players/${this.playerId}`)).catch(() => {});
        }

        this.roomId = null;
        this.rawRoom = null;
        this.onConnection?.(false);
    }
}