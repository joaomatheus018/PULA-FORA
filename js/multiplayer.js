export class MultiplayerClient {
    constructor() {
        this.socket = null;
        this.playerId = null;
        this.roomId = null;
        this.pendingAction = null;

        this.onConnection = null;
        this.onUpdate = null;
        this.onError = null;
    }

    ensureSocket() {
        if (!window.io) {
            this.onError?.("Servidor multiplayer não encontrado.");
            return false;
        }

        if (this.socket) return true;

        this.socket = window.io({ autoConnect: false });

        this.socket.on("connect", () => {
            this.onConnection?.(true);
            if (this.pendingAction) {
                const { event, payload } = this.pendingAction;
                this.pendingAction = null;
                this.socket.emit(event, payload);
            }
        });

        this.socket.on("disconnect", () => {
            this.onConnection?.(false);
        });

        this.socket.on("connect_error", () => {
            this.onError?.("Não foi possível conectar ao servidor.");
        });

        this.socket.on("roomError", msg => {
            this.onError?.(msg);
        });

        this.socket.on("joined", data => {
            this.playerId = data.playerId;
            this.roomId = data.roomId;
            this.onUpdate?.(data.state);
        });

        this.socket.on("gameState", state => {
            this.onUpdate?.(state);
        });

        return true;
    }

    createRoom(name) {
        if (!this.ensureSocket()) return;

        if (this.socket.connected) {
            this.socket.emit("createRoom", { name });
        } else {
            this.pendingAction = { event: "createRoom", payload: { name } };
            this.socket.connect();
        }
    }

    joinRoom(roomId, name) {
        if (!this.ensureSocket()) return;

        if (this.socket.connected) {
            this.socket.emit("joinRoom", { roomId, name });
        } else {
            this.pendingAction = { event: "joinRoom", payload: { roomId, name } };
            this.socket.connect();
        }
    }

    setFillBots(fillWithBots) {
        if (!this.socket?.connected) return;
        this.socket.emit("setFillBots", { fillWithBots });
    }

    startMatch() {
        if (!this.socket?.connected) return;
        this.socket.emit("startMatch");
    }

    setAim(angle, power) {
        if (!this.socket?.connected) return;
        this.socket.emit("setAim", { angle, power });
    }

    ready() {
        if (!this.socket?.connected) return;
        this.socket.emit("playerReady");
    }

    disconnect() {
        this.pendingAction = null;
        if (this.socket) {
            this.socket.disconnect();
        }
        this.playerId = null;
        this.roomId = null;
        this.onConnection?.(false);
    }
}