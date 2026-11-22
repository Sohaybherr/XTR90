require("./config/env");

const express = require("express");
const path = require("path");
const zlib = require("zlib");
const cors = require("cors");
const helmet = require("helmet");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const pool = require("./config/db");
const { passport } = require("./modules/auth/passport");

require.extensions[".ts"] = require.extensions[".js"];

const adminRoutes = require("./modules/admin/admin.routes");
const authRoutes = require("./modules/auth/auth.routes");
const countriesRoutes = require("./modules/countries/countries.routes");
const competitionsRoutes = require("./modules/competitions/competitions.routes");
const teamsRoutes = require("./modules/teams/teams.routes");
const playersRoutes = require("./modules/players/players.routes");
const matchesRoutes = require("./modules/matches/matches.routes");
const newsRoutes = require("./modules/news/news.routes");
const usersRoutes = require("./modules/users/users.routes");
const homeRoutes = require("./modules/home/home.routes");
const searchRoutes = require("./modules/search/search.routes");
const statisticsRoutes = require("./modules/statistics/statistics.routes");
const transfersRoutes = require("./modules/transfers/transfers.routes.ts");
const rankingsRoutes = require("./modules/rankings/rankings.routes");

const app = express();

const isProduction = process.env.NODE_ENV === "production";
const sessionMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
const allowedOrigins = (process.env.CORS_ORIGIN || process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (isProduction) {
  app.set("trust proxy", 1);
}

function gzipResponses(req, res, next) {
  const acceptsGzip = String(req.headers["accept-encoding"] || "").includes("gzip");
  if (!acceptsGzip || req.method === "HEAD") return next();

  const originalSend = res.send.bind(res);

  res.send = function sendCompressed(body) {
    if (
      res.headersSent ||
      res.getHeader("Content-Encoding") ||
      res.statusCode === 204 ||
      res.statusCode === 304
    ) {
      return originalSend(body);
    }

    const contentType = String(res.getHeader("Content-Type") || "");
    const canCompress = /json|text|javascript|css|svg|xml/i.test(contentType);
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ""));

    if (!canCompress || buffer.length < 1024) {
      return originalSend(body);
    }

    const compressed = zlib.gzipSync(buffer);
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Vary", "Accept-Encoding");
    res.removeHeader("Content-Length");
    return res.end(compressed);
  };

  return next();
}

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));
app.use(gzipResponses);

app.use(express.json());
app.use(session({
  name: "sid",
  secret: process.env.SESSION_SECRET || "change-this-session-secret",
  resave: false,
  saveUninitialized: false,
  rolling: true,
  store: new pgSession({
    pool,
    tableName: "session",
    createTableIfMissing: true
  }),
  cookie: {
    maxAge: sessionMaxAgeMs,
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax"
  }
}));
app.use(passport.initialize());
app.use("/assets", express.static(path.join(__dirname, "public", "assets"), {
  maxAge: "30d",
  etag: true,
  immutable: false,
  setHeaders(res) {
    res.setHeader("Cache-Control", "public, max-age=2592000");
  }
}));
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: "1h",
  etag: true
}));

app.get("/", (req, res) => {
  res.send("Backend is running...");
});

app.get("/tester", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "api-tester.html"));
});

app.use("/api/v1/home", homeRoutes);
app.use("/api/v1/search", searchRoutes);
app.use("/api/v1/countries", countriesRoutes);
app.use("/api/v1/competitions", competitionsRoutes);
app.use("/api/v1/teams", teamsRoutes);
app.use("/api/v1/players", playersRoutes);
app.use("/api/v1/matches", matchesRoutes);
app.use("/api/v1/statistics", statisticsRoutes);
app.use("/api/v1/transfers", transfersRoutes);
app.use("/api/v1/rankings", rankingsRoutes);
app.use("/api/v1/news", newsRoutes);
app.use("/api/v1/users", usersRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/admin", adminRoutes);

app.use("/api/statistics", statisticsRoutes);
app.use("/api/transfers", transfersRoutes);
app.use("/api/rankings", rankingsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/admin", adminRoutes);

module.exports = app;
