import express from "express";
import dotenv from "dotenv";
import { supabase } from "../supabase/supabase.js";

//Encryption and Decryption
import { encryptToken, decryptToken } from "../services/encrypt.js";

dotenv.config();
const router = express.Router();
router.post("/login", async (req, res) => {
    
});

router.post("/register", async (req, res) => {
  const { email, password, firstName, lastName, major, year } = req.body;
  try {
    const { error: registrationError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (registrationError) {
      return res.status(400).json({ message: "Failed to Register" });
    }

    const { error: insertionError } = await supabase
      .from("users")
      .insert({ email, firstName, lastName, major, year });

    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    if (insertionError) {
      return res.status(400).json({ message: "Failed to Insert" });
    }

    if (fetchError) {
      return res.status(400).json({ message: "Failed to Fetch" });
    }

    console.log(user.id);
    res.redirect(
      `https://f34d-166-48-48-44.ngrok-free.app/auth/oauth2/sync/${encodeURIComponent(
        user.id
      )}`
    );
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/oauth2/sync/:id", (req, res) => {
  const { id } = req.params;
  const state = id;
  const scope =
    "user-read-email user-read-private user-read-recently-played user-top-read playlist-modify-public playlist-modify-private ugc-image-upload user-follow-modify";
  const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
  const REDIRECT_URI = "https://f34d-166-48-48-44.ngrok-free.app/auth/callback";
  const authURL = `https://accounts.spotify.com/authorize?response_type=code&client_id=${CLIENT_ID}&scope=${encodeURIComponent(
    scope
  )}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}`;

  res.redirect(authURL);
});

//Issue Token
router.get("/callback", async (req, res) => {
  const { code, error, state } = req.query;
  const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
  const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
  const REDIRECT_URI = "https://f34d-166-48-48-44.ngrok-free.app/auth/callback";
  if (error) {
    return res.status(400).json({ message: "Authorization failed" });
  }

  try {
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json();
    const { access_token, refresh_token } = tokenData;

    const rawUserIdData = await fetch("https://api.spotify.com/v1/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    const userIdData = await rawUserIdData.json();
    const { error: insertionError } = await supabase
      .from("users")
      .update({
        access_token: encryptToken(access_token),
        refresh_token: encryptToken(refresh_token),
        spotifyId: userIdData.id,
      })
      .eq("id", state);
    if (insertionError) {
      return res.status(400).json({ message: "Failed to Insert" });
    }
    res.redirect("http://localhost:3000");
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "OAuth flow failed" });
  }
});

router.get("/refresh-token/:id", async (req, res) => {
  const { id } = req.params;
  const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
  const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
  
  try {
    const { data: userData, error: fetchError } = await supabase
      .from("users")
      .select("refresh_token")
      .eq("id", id)
      .single();
    
    if (fetchError) {
      return res.status(400).json({ message: "Failed to Fetch Token" });
    }

    const body = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: decryptToken(userData.refresh_token),
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });

    const response = await body.json();
    const { error: accessTokenInsertionError } = await supabase
      .from("users")
      .update({ access_token: encryptToken(response.access_token) })
      .eq("id", id);

    if (accessTokenInsertionError) {
      return res.status(400).json({ message: "Failed to Insert Access Token" });
    }
    if (response.refresh_token) {
      const { error: refreshTokenInsertionError } = await supabase
        .from("users")
        .update({ refresh_token: encryptToken(response.refresh_token) })
        .eq("id", id);
      if (refreshTokenInsertionError) {
        return res.status(400).json({ message: "Failed to Insert Refresh" });
      }
    }

    return res.status(200).json({ message: "Refreshed" });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/get-user-data", async (req, res) => {
  const { id } = req.query;
  try {
    const { data: userData, error: userDataError } = await supabase
      .from("users")
      .select("major, year, lastName, firstName")
      .eq("id", id);
    if (userDataError) {
      return res.status(400).json({ message: "Failed to Authorize" });
    }
    return res.status(200).json({ data: userData });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
