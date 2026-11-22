const app = require("./app");
const http = require("http");
const { initSocket } = require("./realtime/socket");

const PORT  = 3000;
const allowedOrigins = (process.env.CORS_ORIGIN || process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const server = http.createServer(app);

initSocket(server, { allowedOrigins });

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
