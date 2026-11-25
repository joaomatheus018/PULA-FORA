export class MultiplayerClient {
    constructor() {
        this.socket = null;
        this.playerId = null;
        this.roomId = null;
        this.onUpdate = null;
        this.onConnection = null;
        this.onError = null;
    }

    connect() {
        if (this.socket?.connected) {
            this.socket.emit("joinGame");
            return;
        }

        if (typeof window.io !== "function") {
            this.onError?.("Servidor Socket.IO não encontrado. Rode 'npm start'.");
            return;
        }

        this.socket = window.io();

        this.socket.on("connect", () => {
            this.socket.emit("joinGame");
        });

        this.socket.on("joined", data => {
            this.playerId = data.playerId;
            this.roomId = data.roomId;

            this.onConnection?.(true);

            if (data.state) {
                this.onUpdate?.(data.state);
            }
        });

        this.socket.on("gameState", data => {
            this.onUpdate?.(data);
        });

        this.socket.on("connect_error", () => {
            this.onConnection?.(false);
            this.onError?.("Não foi possível conectar ao servidor.");
        });

        this.socket.on("disconnect", () => {
            this.onConnection?.(false);
        });

        this.socket.on("gameError", message => {
            this.onError?.(message);
        });
    }

    setAim(angle, power) {
        this.socket?.emit("setAim", { angle, power });
    }

    ready() {
        this.socket?.emit("playerReady");
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        this.playerId = null;
        this.roomId = null;
    }
}