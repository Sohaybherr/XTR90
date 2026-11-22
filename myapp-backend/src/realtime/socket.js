const { EventEmitter } = require("events");

const liveEvents = new EventEmitter();
let io = null;

function initSocket(server, options = {}) {
  let Server;
  try {
    ({ Server } = require("socket.io"));
  } catch (error) {
    console.warn("Socket.IO is not installed. Live updates will use REST fallback.");
    return null;
  }

  io = new Server(server, {
    cors: {
      origin: options.allowedOrigins || ["http://localhost:5173"],
      credentials: true
    }
  });

  io.on("connection", (socket) => {
    socket.on("live:subscribe", () => {
      socket.join("live");
    });

    socket.on("live:unsubscribe", () => {
      socket.leave("live");
    });

    socket.on("match:subscribe", (matchId) => {
      if (matchId) socket.join(`match:${matchId}`);
    });

    socket.on("match:unsubscribe", (matchId) => {
      if (matchId) socket.leave(`match:${matchId}`);
    });
  });

  liveEvents.on("match:update", ({ event, matchId, payload }) => {
    if (!event || !matchId) return;
    const eventPayload =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? { matchId, ...payload }
        : { matchId, value: payload };
    io.to(["live", `match:${matchId}`]).emit(event, eventPayload);
  });

  return io;
}

function emitMatchUpdate(event, matchId, payload) {
  liveEvents.emit("match:update", { event, matchId, payload });
}

module.exports = {
  initSocket,
  emitMatchUpdate
};
