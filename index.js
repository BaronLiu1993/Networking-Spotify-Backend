import express from "express"
import cors from "cors"
import bodyParser from "body-parser"

//Spotify Auth Routes
import spotify from "./spotify/spotify.js"

const app = express()
const PORT = 7000

//Middleware
app.use(
    cors({
      origin: "http://localhost:3000",
      credentials: true,
    })
  );
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use("/auth", spotify)

app.listen(PORT, () => {
    console.log(`Listening on ${PORT}`)
})