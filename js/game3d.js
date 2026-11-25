import * as THREE from "three";

const COLORS = [
    0x54e5d4,
    0xff6c9d,
    0xffd166,
    0x8c9eff,
    0xb58cff,
    0xff966b,
    0x7ee081,
    0xf18bd7
];

const CSS_COLORS = [
    "#54e5d4",
    "#ff6c9d",
    "#ffd166",
    "#8c9eff",
    "#b58cff",
    "#ff966b",
    "#7ee081",
    "#f18bd7"
];

export function create3D(container) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c142c);

    const camera = new THREE.PerspectiveCamera(44, 1, 10, 3200);
    camera.position.set(0, 560, 740);
    camera.lookAt(0, -10, 15);

    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance"
    });

    // PixelRatio 1 evita renderizar 4x mais pixels em monitores FullHD/Retina
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    container.appendChild(renderer.domElement);

    const root = new THREE.Group();
    scene.add(root);

    const players = new Map();
    const particles = [];

    let currentState = null;
    let aim = null;
    let animationId = null;

    // ==================== ILUMINAÇÃO LEVE E FORTE ====================
    const hemiLight = new THREE.HemisphereLight(0xe6f7ff, 0x2d5e7e, 1.9);
    hemiLight.position.set(0, 500, 0);
    scene.add(hemiLight);

    const sunlight = new THREE.DirectionalLight(0xffffff, 1.8);
    sunlight.position.set(-280, 650, 320);
    scene.add(sunlight);

    const rimLight = new THREE.DirectionalLight(0x64f5e5, 0.9);
    rimLight.position.set(350, 260, -350);
    scene.add(rimLight);

    // ==================== ESTRELAS OTIMIZADAS ====================
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(700 * 3);

    for (let i = 0; i < 700; i++) {
        starPositions[i * 3] = (Math.random() - 0.5) * 2400;
        starPositions[i * 3 + 1] = (Math.random() - 0.3) * 1200;
        starPositions[i * 3 + 2] = (Math.random() - 0.5) * 2400;
    }

    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));

    const stars = new THREE.Points(
        starGeometry,
        new THREE.PointsMaterial({
            color: 0xdbeafe,
            size: 3.5,
            sizeAttenuation: true
        })
    );
    scene.add(stars);

    // PLANETA E ANEL
    const planet = new THREE.Mesh(
        new THREE.SphereGeometry(68, 24, 24),
        new THREE.MeshLambertMaterial({
            color: 0xb185ff,
            emissive: 0x3b1f73,
            emissiveIntensity: 0.6
        })
    );
    planet.position.set(470, 220, -430);
    scene.add(planet);

    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(102, 5.5, 8, 48),
        new THREE.MeshBasicMaterial({ color: 0xd8b4fe })
    );
    ring.position.copy(planet.position);
    ring.rotation.x = 1.15;
    ring.rotation.y = -0.25;
    scene.add(ring);

    // ==================== PLATAFORMA FLUTUANTE ====================
    const platform = new THREE.Group();
    root.add(platform);

    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(378, 320, 68, 48),
        new THREE.MeshLambertMaterial({ color: 0x264c73 })
    );
    base.position.y = -24;
    platform.add(base);

    const floor = new THREE.Mesh(
        new THREE.CylinderGeometry(370, 370, 18, 48),
        new THREE.MeshLambertMaterial({
            color: 0x7be0ad,
            emissive: 0x16423c,
            emissiveIntensity: 0.35
        })
    );
    floor.position.y = 12;
    platform.add(floor);

    const innerCenter = new THREE.Mesh(
        new THREE.CylinderGeometry(175, 175, 18.6, 40),
        new THREE.MeshLambertMaterial({
            color: 0xa7f3c1,
            emissive: 0x1f5246,
            emissiveIntensity: 0.3
        })
    );
    innerCenter.position.y = 12.1;
    platform.add(innerCenter);

    const outerRing = new THREE.Mesh(
        new THREE.TorusGeometry(374, 5.5, 8, 64),
        new THREE.MeshBasicMaterial({ color: 0x59e8d5 })
    );
    outerRing.rotation.x = Math.PI / 2;
    outerRing.position.y = 17;
    platform.add(outerRing);

    [130, 250, 355].forEach((r, idx) => {
        const ringLine = new THREE.Mesh(
            new THREE.RingGeometry(r - 1.5, r + 1.5, 56),
            new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: idx === 2 ? 0.6 : 0.25,
                side: THREE.DoubleSide
            })
        );
        ringLine.rotation.x = -Math.PI / 2;
        ringLine.position.y = 21.3;
        platform.add(ringLine);
    });

    // Pedrinhas usando InstancedMesh (1 draw call para todas as 40 pedras)
    const stoneGeo = new THREE.CircleGeometry(4.5, 8);
    const stoneMat = new THREE.MeshBasicMaterial({
        color: 0xd4fbe0,
        transparent: true,
        opacity: 0.45
    });
    const stonesInstanced = new THREE.InstancedMesh(stoneGeo, stoneMat, 40);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < 40; i++) {
        const angle = i * 2.4;
        const r = 65 + (i * 53) % 280;
        dummy.position.set(Math.cos(angle) * r, 21.4, Math.sin(angle) * r);
        dummy.rotation.x = -Math.PI / 2;
        dummy.scale.setScalar(0.7 + (i % 3) * 0.35);
        dummy.updateMatrix();
        stonesInstanced.setMatrixAt(i, dummy.matrix);
    }
    platform.add(stonesInstanced);

    // Ilhas rochosas ao redor
    const rockGeo = new THREE.DodecahedronGeometry(26, 0);
    const rockMat = new THREE.MeshLambertMaterial({
        color: 0x45679c,
        emissive: 0x162440,
        emissiveIntensity: 0.4
    });

    for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI * 2) / 8;
        const rock = new THREE.Mesh(rockGeo, rockMat);
        rock.position.set(
            Math.cos(angle) * (510 + (i % 2) * 50),
            -70 - (i % 3) * 25,
            Math.sin(angle) * (510 + (i % 2) * 50)
        );
        rock.scale.setScalar(0.8 + (i % 3) * 0.3);
        scene.add(rock);
    }

    // ==================== GEOMETRIAS COMPARTILHADAS DOS BONECO ====================
    const sharedBodyGeo = new THREE.SphereGeometry(19, 20, 16);
    const sharedEyeGeo = new THREE.SphereGeometry(2.8, 8, 8);
    const sharedEyeMat = new THREE.MeshBasicMaterial({ color: 0x12192e });
    const sharedMouthGeo = new THREE.TorusGeometry(4.2, 1.1, 6, 12, Math.PI);
    const sharedShadowGeo = new THREE.CircleGeometry(21, 20);
    const sharedShadowMat = new THREE.MeshBasicMaterial({
        color: 0x0b2528,
        transparent: true,
        opacity: 0.35
    });
    const sharedRingGeo = new THREE.RingGeometry(22, 25.5, 28);

    function createNameSprite(text, isLocal, colorHex) {
        const labelCanvas = document.createElement("canvas");
        labelCanvas.width = 256;
        labelCanvas.height = 64;
        const lctx = labelCanvas.getContext("2d");

        lctx.fillStyle = "rgba(10, 18, 38, 0.82)";
        lctx.beginPath();
        lctx.roundRect(28, 12, 200, 38, 19);
        lctx.fill();

        lctx.strokeStyle = isLocal ? "#ffd166" : colorHex;
        lctx.lineWidth = 3;
        lctx.stroke();

        lctx.font = "bold 22px Inter, Arial, sans-serif";
        lctx.textAlign = "center";
        lctx.textBaseline = "middle";
        lctx.fillStyle = isLocal ? "#ffd166" : "#ffffff";
        lctx.fillText(text, 128, 32);

        const texture = new THREE.CanvasTexture(labelCanvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;

        const sprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                depthTest: false
            })
        );
        sprite.scale.set(92, 23, 1);
        sprite.position.set(0, 74, 0);
        return sprite;
    }

    function createPlayer(p, index, isLocal) {
        const color = COLORS[index % COLORS.length];
        const cssColor = CSS_COLORS[index % CSS_COLORS.length];
        const group = new THREE.Group();

        const body = new THREE.Mesh(
            sharedBodyGeo,
            new THREE.MeshLambertMaterial({
                color,
                emissive: color,
                emissiveIntensity: 0.25
            })
        );
        body.position.y = 40;
        group.add(body);

        [-6, 6].forEach(x => {
            const eye = new THREE.Mesh(sharedEyeGeo, sharedEyeMat);
            eye.position.set(x, 44, 16);
            group.add(eye);
        });

        const mouth = new THREE.Mesh(sharedMouthGeo, sharedEyeMat);
        mouth.position.set(0, 37, 17.5);
        mouth.rotation.x = Math.PI;
        group.add(mouth);

        // Sombra falsa leve no chão
        const shadow = new THREE.Mesh(sharedShadowGeo, sharedShadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 21.5;
        group.add(shadow);

        // Aro colorido no chão
        const ring = new THREE.Mesh(
            sharedRingGeo,
            new THREE.MeshBasicMaterial({
                color: isLocal ? 0xffd166 : color,
                side: THREE.DoubleSide
            })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 21.7;
        group.add(ring);

        const label = createNameSprite(isLocal ? "VOCÊ" : p.name, isLocal, cssColor);
        group.add(label);

        root.add(group);
        return { group, body, ring, shadow };
    }

    // ==================== MIRA 3D LEVE ====================
    const aimGroup = new THREE.Group();
    aimGroup.visible = false;
    root.add(aimGroup);

    const aimShaft = new THREE.Mesh(
        new THREE.BoxGeometry(1, 3.5, 3.5),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    aimGroup.add(aimShaft);

    const aimHead = new THREE.Mesh(
        new THREE.ConeGeometry(10, 22, 10),
        new THREE.MeshBasicMaterial({ color: 0xffd166 })
    );
    aimHead.rotation.z = -Math.PI / 2;
    aimGroup.add(aimHead);

    const aimTargetRing = new THREE.Mesh(
        new THREE.RingGeometry(11, 15, 20),
        new THREE.MeshBasicMaterial({ color: 0xffd166, side: THREE.DoubleSide })
    );
    aimTargetRing.rotation.x = -Math.PI / 2;
    aimGroup.add(aimTargetRing);

    // ==================== PARTÍCULAS LEVES ====================
    const sharedParticleGeo = new THREE.SphereGeometry(3.5, 6, 6);

    function burst(x, y, hexColor = 0xffffff) {
        if (particles.length > 48) return; // Limite de segurança para manter FPS alto

        for (let i = 0; i < 10; i++) {
            const mesh = new THREE.Mesh(
                sharedParticleGeo,
                new THREE.MeshBasicMaterial({ color: hexColor })
            );
            mesh.position.set(x - 640, 38, y - 410);

            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 5;
            scene.add(mesh);

            particles.push({
                mesh,
                vx: Math.cos(angle) * speed,
                vy: 2 + Math.random() * 4,
                vz: Math.sin(angle) * speed,
                life: 1
            });
        }
    }

    function update(state) {
        currentState = state;
        const activeIds = new Set();

        state.players.forEach((p, i) => {
            activeIds.add(p.id);
            const isLocal = p.id === state.localPlayerId;

            let entry = players.get(p.id);
            if (!entry) {
                entry = createPlayer(p, i, isLocal);
                players.set(p.id, entry);
            }

            const { group, ring, shadow } = entry;
            group.visible = p.alive;
            if (!p.alive) return;

            const scale = p.falling ? Math.max(0.05, p.fallScale || 1) : 1;
            const fallDrop = p.falling ? -(1 - scale) * 160 : 0;

            group.position.set(p.x - 640, fallDrop, p.y - 410);
            group.scale.setScalar(scale);
            ring.visible = !p.falling;
            shadow.visible = !p.falling;

            group.rotation.z = -Math.atan2(p.vx || 0, 12);
            group.rotation.x = Math.atan2(p.vy || 0, 12) * 0.6;
        });

        for (const [id, entry] of players) {
            if (!activeIds.has(id)) {
                entry.group.visible = false;
            }
        }
    }

    function updateAim(value) {
        aim = value;
    }

    function drawAim() {
        if (!aim || !currentState || aim.power <= 0 || currentState.status !== "aiming") {
            aimGroup.visible = false;
            return;
        }

        const player = currentState.players.find(
            p => p.id === currentState.localPlayerId && p.alive && !p.falling
        );

        if (!player) {
            aimGroup.visible = false;
            return;
        }

        const length = 55 + aim.power * 1.45;
        const startX = player.x - 640;
        const startZ = player.y - 410;

        aimGroup.visible = true;
        aimGroup.position.set(startX, 34, startZ);
        aimGroup.rotation.y = -aim.angle;

        aimShaft.scale.set(length, 1, 1);
        aimShaft.position.set(length / 2, 0, 0);

        aimHead.position.set(length + 8, 0, 0);
        aimTargetRing.position.set(length + 8, -11.5, 0);
    }

    const clock = new THREE.Clock();

    function animate() {
        animationId = requestAnimationFrame(animate);
        const time = clock.getElapsedTime();

        planet.rotation.y += 0.0012;
        ring.rotation.z += 0.002;
        stars.rotation.y = time * 0.002;
        platform.position.y = Math.sin(time * 0.8) * 3;

        players.forEach(entry => {
            if (!entry.group.visible) return;
            entry.body.position.y = 40 + Math.sin(time * 3.2 + entry.group.position.x) * 1.6;
        });

        for (let i = particles.length - 1; i >= 0; i--) {
            const pt = particles[i];
            pt.mesh.position.x += pt.vx;
            pt.mesh.position.y += pt.vy;
            pt.mesh.position.z += pt.vz;
            pt.vy -= 0.25;
            pt.life -= 0.045;
            pt.mesh.scale.setScalar(Math.max(0.01, pt.life));

            if (pt.life <= 0) {
                scene.remove(pt.mesh);
                pt.mesh.material.dispose();
                particles.splice(i, 1);
            }
        }

        drawAim();
        renderer.render(scene, camera);
    }

    function resize() {
        const width = Math.max(1, container.clientWidth);
        const height = Math.max(1, container.clientHeight);

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(container);

    resize();
    animate();

    return {
        element: renderer.domElement,
        update,
        setAim: updateAim,
        burst,

        destroy() {
            cancelAnimationFrame(animationId);
            observer.disconnect();
            renderer.dispose();
            container.replaceChildren();
        }
    };
}