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
    return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function createRoom() {
    const room = {
        id: makeCode(),
        players: new Map(),
        status: "waiting",
        round: 0,
        aimEnd: null,
        timer: null,
        winnerName: null,
        ticks: 0
    };

    rooms.set(room.id, room);
    return room;
}

function findRoom() {
    for (const room of rooms.values()) {
        if (room.status === "waiting" && room.players.size < MAX_PLAYERS) {
            return room;
        }
    }
    return createRoom();
}

function publicState(room) {
    return {
        status: room.status,
        round: room.round,
        countdown: room.aimEnd
            ? Math.max(0, (room.aimEnd - Date.now()) / 1000)
            : null,
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
            ready: p.ready
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
    });
}

function startAiming(room) {
    if (room.timer) {
        clearInterval(room.timer);
        room.timer = null;
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
}

function startCountdown(room) {
    if (room.status !== "aiming" || room.aimEnd) return;

    const alive = [...room.players.values()].filter(p => p.alive);

    if (alive.length < 2 || !alive.every(p => p.ready && p.power > 0)) {
        return;
    }

    room.aimEnd = Date.now() + 3000;
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

            p.vx *= 0.982;
            p.vy *= 0.982;

            if (Math.hypot(p.x - CENTER.x, p.y - CENTER.y) > ARENA_RADIUS - PLAYER_RADIUS) {
                p.alive = false;
            }
        });

        const active = [...room.players.values()].filter(p => p.alive);

        for (let i = 0; i < active.length; i++) {
            for (let j = i + 1; j < active.length; j++) {
                const a = active[i];
                const b = active[j];

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

        const remaining = [...room.players.values()].filter(p => p.alive);
        const allStopped = remaining.every(p => Math.hypot(p.vx, p.vy) < 0.15);

        if (remaining.length <= 1 || room.ticks >= 240 || (room.ticks > 25 && allStopped)) {
            clearInterval(room.timer);
            room.timer = null;

            if (remaining.length <= 1) {
                finishGame(room, remaining[0]);
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

    room.status = "finished";
    room.winnerName = winner ? winner.name : "Ninguém";
    broadcast(room);
}

function removePlayer(socket) {
    for (const room of rooms.values()) {
        if (!room.players.has(socket.id)) continue;

        room.players.delete(socket.id);

        if (room.players.size === 0) {
            if (room.timer) clearInterval(room.timer);
            rooms.delete(room.id);
            return;
        }

        const alive = [...room.players.values()].filter(p => p.alive);

        if (room.status === "running") {
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
        }

        return;
    }
}

io.on("connection", socket => {
    socket.on("joinGame", () => {
        for (const room of rooms.values()) {
            if (room.players.has(socket.id)) return;
        }

        const room = findRoom();
        socket.join(room.id);

        const player = {
            id: socket.id,
            name: "Jogador " + (room.players.size + 1),
            x: CENTER.x,
            y: CENTER.y,
            vx: 0,
            vy: 0,
            angle: 0,
            power: 0,
            alive: true,
            ready: false
        };

        room.players.set(socket.id, player);

        socket.emit("joined", {
            playerId: socket.id,
            roomId: room.id,
            state: publicState(room)
        });

        if (room.players.size >= 2) {
            startAiming(room);
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