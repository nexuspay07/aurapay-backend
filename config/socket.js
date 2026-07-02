const { Server } =
  require("socket.io");

function initializeSocket(
  server
) {
  const io =
    new Server(server, {
      cors: {
        origin: "*",
        methods: [
          "GET",
          "POST",
        ],
      },
    });

  global.io = io;

  io.on(
    "connection",
    (socket) => {
      console.log(
        "⚡ Admin connected:",
        socket.id
      );

      socket.on(
        "disconnect",
        () => {
          console.log(
            "❌ Admin disconnected:",
            socket.id
          );
        }
      );
    }
  );

  return io;
}

module.exports =
  initializeSocket;