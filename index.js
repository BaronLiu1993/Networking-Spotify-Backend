//Middleware and Express Imports
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";

//Spotify Auth Routes
import auth from "./router/auth.js";
import spotify from "./router/spotify.js";

//Read Env File
dotenv.config();

//Configure Express
const app = express();
const PORT = process.env.PORT || 8080;

//Middleware
const allowedOrigins = [
  "http://localhost:3000",
  "https://1061-166-48-48-44.ngrok-free.app"
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

/*app.set("trust proxy", true);
//Rate Limiter
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter); */
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

//Endpoints
app.use("/auth", auth);
app.use("/profile", spotify);

//Start Server
app.listen(PORT, () => {
  console.log("Server Is On");
});
