const COLORS = [
    "#54e5d4",
    "#ff6c9d",
    "#ffd166",
    "#8c9eff",
    "#b58cff",
    "#ff966b",
    "#7ee081",
    "#f18bd7"
];

export function create2D(canvas) {
    const ctx = canvas.getContext("2d");

    const WIDTH = 1280;
    const HEIGHT = 820;
    const center = { x: 640, y: 410 };
    const radius = 370;

    let stars = [];
    let particles = [];
    let currentState = null;
    let aim = null;
    let frame = null;

    for (let i = 0; i < 210; i++) {
        stars.push({
            x: Math.random() * WIDTH,
            y: Math.random() * HEIGHT,
            size: Math.random() * 1.8 + 0.4,
            alpha: Math.random() * 0.7 + 0.2,
            speed: Math.random() * 0.02
        });
    }

    function background(time) {
        const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
        bg.addColorStop(0, "#101b3a");
        bg.addColorStop(0.5, "#19264b");
        bg.addColorStop(1, "#080e23");

        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        const nebula = ctx.createRadialGradient(240, 200, 10, 240, 200, 420);
        nebula.addColorStop(0, "#8759b63d");
        nebula.addColorStop(1, "#8759b600");
        ctx.fillStyle = nebula;
        ctx.fillRect(0, 0, 750, 650);

        const nebula2 = ctx.createRadialGradient(1080, 620, 10, 1080, 620, 400);
        nebula2.addColorStop(0, "#347fc43b");
        nebula2.addColorStop(1, "#347fc400");
        ctx.fillStyle = nebula2;
        ctx.fillRect(600, 250, 680, 570);

        stars.forEach(s => {
            ctx.globalAlpha = s.alpha * (0.7 + Math.sin(time * s.speed + s.x) * 0.3);
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.globalAlpha = 1;

        const planet = ctx.createRadialGradient(1120, 140, 5, 1120, 140, 72);
        planet.addColorStop(0, "#f5d4ff");
        planet.addColorStop(0.5, "#aa79df");
        planet.addColorStop(1, "#4c448e");

        ctx.fillStyle = planet;
        ctx.beginPath();
        ctx.arc(1120, 140, 58, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "#c1a4ff77";
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.ellipse(1120, 140, 88, 22, -0.3, 0, Math.PI * 2);
        ctx.stroke();

        const meteorX = ((time * 0.08) % (WIDTH + 200)) - 100;
        const meteorY = (time * 0.05) % HEIGHT;

        ctx.strokeStyle = "#a7d7ff55";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(meteorX, meteorY);
        ctx.lineTo(meteorX - 35, meteorY - 20);
        ctx.stroke();
    }

    function arena(time) {
        ctx.save();
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 55;
        ctx.shadowOffsetY = 32;
        ctx.fillStyle = "#28486a";
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius + 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = "#5ce8dc";
        ctx.lineWidth = 9;
        ctx.shadowColor = "#54e5d4";
        ctx.shadowBlur = 28;
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius + 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        const floor = ctx.createRadialGradient(540, 270, 25, center.x, center.y, radius);
        floor.addColorStop(0, "#c0f3c3");
        floor.addColorStop(0.55, "#83d8af");
        floor.addColorStop(1, "#3b9295");

        ctx.fillStyle = floor;
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        ctx.clip();

        for (let i = 0; i < 120; i++) {
            const angle = i * 2.4;
            const r = 40 + (i * 47) % (radius - 35);
            const x = center.x + Math.cos(angle) * r;
            const y = center.y + Math.sin(angle) * r;

            ctx.fillStyle = i % 2 ? "#ffffff1c" : "#246c7530";
            ctx.beginPath();
            ctx.arc(x, y, 3 + (i % 5), 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.strokeStyle = "#ffffff28";
        ctx.lineWidth = 2;
        [120, 220, 305].forEach(r => {
            ctx.beginPath();
            ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
            ctx.stroke();
        });
        ctx.restore();

        ctx.strokeStyle = "#ffffff90";
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 10]);
        ctx.beginPath();
        ctx.arc(center.x, center.y, radius - 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = "#ffffff40";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(
            center.x,
            center.y,
            radius + 13 + Math.sin(time * 0.002) * 3,
            0,
            Math.PI * 2
        );
        ctx.stroke();
    }

    function drawSinglePlayer(p, i, time) {
        const color = COLORS[i % COLORS.length];
        const isLocal = p.id === currentState.localPlayerId;
        const scale = p.falling ? Math.max(0.05, p.fallScale || 1) : 1;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(scale, scale);
        ctx.globalAlpha = scale;

        if (isLocal && currentState.status === "aiming" && !p.falling) {
            ctx.strokeStyle = "#ffd166cc";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 0, 26 + Math.sin(time * 0.006) * 3, 0, Math.PI * 2);
            ctx.stroke();
        }

        if (!p.falling) {
            ctx.fillStyle = "#173b3c66";
            ctx.beginPath();
            ctx.ellipse(3, 9, 20, 12, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        const body = ctx.createRadialGradient(-7, -8, 2, 0, 0, 25);
        body.addColorStop(0, "#ffffff");
        body.addColorStop(0.3, color);
        body.addColorStop(1, color);

        ctx.shadowColor = color;
        ctx.shadowBlur = 18;
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(0, 0, 19, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = "#ffffffaa";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#172039";
        ctx.beginPath();
        ctx.arc(-6, -3, 2.8, 0, Math.PI * 2);
        ctx.arc(6, -3, 2.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "#172039";
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (p.falling) {
            // Boca assustada a cair
            ctx.arc(0, 5, 4, 0, Math.PI * 2);
        } else {
            ctx.arc(0, 2, 5, 0.15, Math.PI - 0.15);
        }
        ctx.stroke();

        ctx.font = "bold 12px Arial";
        ctx.textAlign = "center";
        ctx.fillStyle = isLocal ? "#ffd166" : "#fff";
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 6;

        ctx.fillText(isLocal ? "VOCÊ" : p.name, 0, -32);
        ctx.shadowBlur = 0;

        if (p.ready && currentState.status === "aiming") {
            ctx.fillStyle = "#5de7a9";
            ctx.font = "bold 16px Arial";
            ctx.fillText("✓", 25, -20);
        }

        ctx.restore();
    }

    function drawAim() {
        if (!aim || aim.power <= 0) return;

        const player = currentState?.players.find(
            p => p.id === currentState.localPlayerId
        );

        if (!player || !player.alive || player.falling) return;

        const length = 45 + aim.power * 1.3;
        const endX = player.x + Math.cos(aim.angle) * length;
        const endY = player.y + Math.sin(aim.angle) * length;

        ctx.strokeStyle = "#ffffffdd";
        ctx.lineWidth = 4;
        ctx.setLineDash([9, 7]);
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = "#ffd166";
        ctx.shadowColor = "#ffd166";
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(endX, endY, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = "#fff";
        ctx.font = "bold 15px Arial";
        ctx.textAlign = "center";
        ctx.fillText(aim.power + "%", endX, endY - 17);
    }

    function drawParticles() {
        particles = particles.filter(p => p.life > 0);

        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.025;

            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.globalAlpha = 1;
    }

    function render(time = 0) {
        ctx.clearRect(0, 0, WIDTH, HEIGHT);

        background(time);

        // Desenha primeiro quem está a cair (por baixo da plataforma!)
        if (currentState) {
            currentState.players.forEach((p, i) => {
                if (p.alive && p.falling) {
                    drawSinglePlayer(p, i, time);
                }
            });
        }

        arena(time);

        // Desenha depois quem está em cima da plataforma
        if (currentState) {
            currentState.players.forEach((p, i) => {
                if (p.alive && !p.falling) {
                    drawSinglePlayer(p, i, time);
                }
            });
        }

        drawAim();
        drawParticles();

        frame = requestAnimationFrame(render);
    }

    render();

    return {
        update(state) {
            currentState = state;
        },

        setAim(value) {
            aim = value;
        },

        burst(x, y, color = "#fff") {
            for (let i = 0; i < 18; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 4 + 1;

                particles.push({
                    x,
                    y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 1,
                    color
                });
            }
        },

        destroy() {
            cancelAnimationFrame(frame);
        }
    };
}