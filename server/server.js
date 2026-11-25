const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const CENTER = { x: 640, y: 410 };
const ARENA_RADIUS = 370;
const PLAYER_RADIUS = 18;
const MAX_PLAYERS = 8;

const rooms = new Map();

app.use(express.static(path.join(__dirname, "..")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "index.html"));
});

function makeCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    do {
        code = "";
        for (let i = 0; i < 4; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
    } while (rooms.has(code));
    return code;
}

function createRoom(hostId) {
    const room = {
        id: makeCode(),
        hostId,
        fillWithBots: false,
        players: new Map(),
        status: "waiting",
        round: 0,
        aimEnd: null,
        timer: null,
        botTimer: null,
        winnerId: null,
        winnerName: null,
        ticks: 0
    };

    rooms.set(room.id, room);
    return room;
}

function humanPlayers(room) {
    return [...room.players.values()].filter(p => !p.bot);
}

function publicState(room) {
    return {
        roomId: room.id,
        hostId: room.hostId,
        fillWithBots: room.fillWithBots,
        status: room.status,
        round: room.round,
        countdown: room.aimEnd
            ? Math.max(0, (room.aimEnd - Date.now()) / 1000)
            : null,
        winnerId: room.winnerId,
        winnerName: room.winnerName,
        players: [...room.players.values()].map(p => ({
            id: p.id,
            name: p.name,
            x: p.x,
            y: p.y,
            vx: p.vx,
            vy: p.vy,
            angle: p.angle,
            power: p.power,
            alive: p.alive,
            falling: p.falling,
            fallScale: p.fallScale,
            ready: p.ready,
            bot: Boolean(p.bot),
            isHost: p.id === room.hostId
        }))
    };
}

function broadcast(room) {
    io.to(room.id).emit("gameState", publicState(room));
}

function positionPlayers(room) {
    const alive = [...room.players.values()].filter(p => p.alive);
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

function scheduleRoomBots(room) {
    if (room.botTimer) {
        clearTimeout(room.botTimer);
        room.botTimer = null;
    }

    const botsAlive = [...room.players.values()].filter(p => p.bot && p.alive);
    if (botsAlive.length === 0 || room.status !== "aiming") return;

    room.botTimer = setTimeout(() => {
        if (room.status !== "aiming") return;

        for (const bot of room.players.values()) {
            if (!bot.bot || !bot.alive || bot.ready) continue;

            const targets = [...room.players.values()].filter(p => p.alive && p.id !== bot.id);
            const target = targets[Math.floor(Math.random() * targets.length)];

            if (target) {
                bot.angle = Math.atan2(target.y - bot.y, target.x - bot.x);
            } else {
                bot.angle = Math.atan2(CENTER.y - bot.y, CENTER.x - bot.x);
            }

            bot.angle += (Math.random() - 0.5) * 0.45;
            bot.power = Math.round(35 + Math.random() * 50);
            bot.ready = true;
        }

        broadcast(room);
        startCountdown(room);
    }, 900);
}

function startAiming(room) {
    if (room.timer) {
        clearInterval(room.timer);
        room.timer = null;
    }
    if (room.botTimer) {
        clearTimeout(room.botTimer);
        room.botTimer = null;
    }

    const alive = [...room.players.values()].filter(p => p.alive);

    if (alive.length <= 1) {
        finishGame(room, alive[0]);
        return;
    }

    room.status = "aiming";
    room.round++;
    room.aimEnd = null;
    room.ticks = 0;

    if (room.round === 1) {
        positionPlayers(room);
    } else {
        alive.forEach(p => {
            p.vx = 0;
            p.vy = 0;
            p.angle = 0;
            p.power = 0;
            p.ready = false;
        });
    }

    broadcast(room);
    scheduleRoomBots(room);
}

function startCountdown(room) {
    if (room.status !== "aiming" || room.aimEnd) return;

    const alive = [...room.players.values()].filter(p => p.alive);

    if (alive.length < 2 || !alive.every(p => p.ready && p.power > 0)) {
        return;
    }

    const hasHumansAlive = alive.some(p => !p.bot);
    const duration = hasHumansAlive ? 3000 : 1000;

    room.aimEnd = Date.now() + duration;
    broadcast(room);

    room.timer = setInterval(() => {
        const remaining = room.aimEnd - Date.now();

        if (remaining <= 0) {
            clearInterval(room.timer);
            room.timer = null;
            launchPlayers(room);
        } else {
            broadcast(room);
        }
    }, 150);
}

function launchPlayers(room) {
    room.status = "running";
    room.aimEnd = null;
    room.ticks = 0;

    for (const p of room.players.values()) {
        if (!p.alive) continue;

        const force = 2.5 + (p.power / 100) * 8.5;
        p.vx = Math.cos(p.angle) * force;
        p.vy = Math.sin(p.angle) * force;
    }

    broadcast(room);

    room.timer = setInterval(() => {
        room.ticks++;

        const alive = [...room.players.values()].filter(p => p.alive);

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

        const onPlatform = [...room.players.values()].filter(p => p.alive && !p.falling);

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

        if (room.ticks % 2 === 0) {
            broadcast(room);
        }

        const stillOnPlatform = [...room.players.values()].filter(p => p.alive && !p.falling);
        const anyoneFalling = [...room.players.values()].some(p => p.alive && p.falling);
        const allStopped = stillOnPlatform.every(p => Math.hypot(p.vx, p.vy) < 0.15);

        if (!anyoneFalling && (stillOnPlatform.length <= 1 || room.ticks >= 240 || (room.ticks > 25 && allStopped))) {
            clearInterval(room.timer);
            room.timer = null;

            if (stillOnPlatform.length <= 1) {
                finishGame(room, stillOnPlatform[0]);
            } else {
                startAiming(room);
            }
        }
    }, 30);
}

function finishGame(room, winner) {
    if (room.timer) {
        clearInterval(room.timer);
        room.timer = null;
    }
    if (room.botTimer) {
        clearTimeout(room.botTimer);
        room.botTimer = null;
    }

    room.status = "finished";
    room.winnerId = winner ? winner.id : null;
    room.winnerName = winner ? winner.name : "Ninguém";
    broadcast(room);
}

function removePlayer(socket) {
    for (const room of rooms.values()) {
        if (!room.players.has(socket.id)) continue;

        room.players.delete(socket.id);
        socket.leave(room.id);

        const humans = humanPlayers(room);
        if (humans.length === 0) {
            if (room.timer) clearInterval(room.timer);
            if (room.botTimer) clearTimeout(room.botTimer);
            rooms.delete(room.id);
            return;
        }

        if (room.hostId === socket.id) {
            room.hostId = humans[0].id;
        }

        const alive = [...room.players.values()].filter(p => p.alive);

        if (room.status === "waiting") {
            broadcast(room);
        } else if (room.status === "running") {
            if (alive.length <= 1) {
                finishGame(room, alive[0]);
            } else {
                broadcast(room);
            }
        } else if (room.status !== "finished") {
            if (alive.length <= 1) {
                finishGame(room, alive[0]);
            } else {
                startAiming(room);
            }
        } else {
            broadcast(room);
        }

        return;
    }
}

function sanitizeName(rawName, fallback) {
    const clean = String(rawName || "").trim().slice(0, 16);
    return clean || fallback;
}

io.on("connection", socket => {
    socket.on("createRoom", data => {
        removePlayer(socket);

        const room = createRoom(socket.id);
        socket.join(room.id);

        const player = {
            id: socket.id,
            name: sanitizeName(data?.name, "Jogador 1"),
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

        room.players.set(socket.id, player);

        socket.emit("joined", {
            playerId: socket.id,
            roomId: room.id,
            state: publicState(room)
        });
    });

    socket.on("joinRoom", data => {
        const code = String(data?.roomId || "").trim().toUpperCase();
        const room = rooms.get(code);

        if (!room) {
            socket.emit("roomError", "Sala não encontrada. Verifique o código!");
            return;
        }

        if (room.status !== "waiting") {
            socket.emit("roomError", "Esta partida já começou!");
            return;
        }

        if (humanPlayers(room).length >= MAX_PLAYERS) {
            socket.emit("roomError", "Esta sala já está cheia (8/8)!");
            return;
        }

        removePlayer(socket);
        socket.join(room.id);

        const player = {
            id: socket.id,
            name: sanitizeName(data?.name, "Jogador " + (humanPlayers(room).length + 1)),
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

        room.players.set(socket.id, player);

        socket.emit("joined", {
            playerId: socket.id,
            roomId: room.id,
            state: publicState(room)
        });

        broadcast(room);
    });

    // ALTERAR OPÇÃO DE COMPLETAR COM BOTS NO LOBBY
    socket.on("setFillBots", data => {
        for (const room of rooms.values()) {
            if (room.hostId !== socket.id) continue;
            if (room.status !== "waiting") return;

            room.fillWithBots = Boolean(data?.fillWithBots);
            broadcast(room);
            break;
        }
    });

    // DONO DA SALA INICIA A PARTIDA
    socket.on("startMatch", () => {
        for (const room of rooms.values()) {
            if (room.hostId !== socket.id) continue;
            if (room.status !== "waiting" && room.status !== "finished") return;

            // Remove bots da partida anterior, se houver
            for (const [id, p] of room.players) {
                if (p.bot) room.players.delete(id);
            }

            const humans = humanPlayers(room);

            if (!room.fillWithBots && humans.length < 2) {
                socket.emit("roomError", "Aguarde pelo menos 2 jogadores ou ative 'Completar com Bots'!");
                return;
            }

            // Reseta jogadores humanos
            for (const p of humans) {
                p.alive = true;
                p.falling = false;
                p.fallScale = 1;
                p.ready = false;
            }

            // Adiciona bots até completar 8 jogadores, se selecionado
            if (room.fillWithBots) {
                const needed = MAX_PLAYERS - humans.length;
                for (let i = 0; i < needed; i++) {
                    const botId = "bot_" + room.id + "_" + i;
                    room.players.set(botId, {
                        id: botId,
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
            }

            room.round = 0;
            room.winnerId = null;
            room.winnerName = null;

            startAiming(room);
            break;
        }
    });

    socket.on("setAim", data => {
        for (const room of rooms.values()) {
            const p = room.players.get(socket.id);

            if (!p || !p.alive || room.status !== "aiming" || room.aimEnd || p.ready) continue;

            const angle = Number(data?.angle);
            const power = Number(data?.power);

            if (!Number.isFinite(angle) || !Number.isFinite(power) || power <= 0) {
                return;
            }

            p.angle = angle;
            p.power = Math.max(0, Math.min(100, power));
            break;
        }
    });

    socket.on("playerReady", () => {
        for (const room of rooms.values()) {
            const p = room.players.get(socket.id);

            if (!p || !p.alive || room.status !== "aiming" || room.aimEnd || p.ready || p.power <= 0) continue;

            p.ready = true;
            broadcast(room);
            startCountdown(room);
            break;
        }
    });

    socket.on("disconnect", () => {
        removePlayer(socket);
    });
});

server.listen(PORT, () => {
    console.log("--------------------------------");
    console.log("       PULA FORA");
    console.log("--------------------------------");
    console.log(`Servidor: http://localhost:${PORT}`);
});