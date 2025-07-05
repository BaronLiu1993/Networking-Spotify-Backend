import express from "express";
import dotenv from "dotenv";
import { supabase } from "../supabase/supabase.js";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto"

dotenv.config();
const router = express.Router();
const encryptionAlgorithm = 'aes-256-gcm'

async function encryptToken(token) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(token, salt, 24, (err, key) => {
      if (err) return reject(err);

      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(encryptionAlgorithm, key, iv);

      let encrypted = cipher.update(token, "utf8", "hex");
      encrypted += cipher.final("hex");

      const encryptedData = {
        iv: iv.toString("hex"),
        encrypted,
      };
      resolve(encryptedData);
    });
  });
}

async function decryptToken(encryptedData, token) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(token, salt, 24, (err, key) => {
      if (err) return reject(err);

      const iv = Buffer.from(encryptedData.iv, "hex");
      const decipher = crypto.createDecipheriv(encryptionAlgorithm, key, iv);

      let decrypted = decipher.update(encryptedData.encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      resolve(decrypted);
    });
  });
}


router.post("/login", async (req, res) => {});

router.post("/register", async (req, res) => {
  const { email, password, firstName, lastName } = req.body;
  try {
    const { error: registrationError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (registrationError) {
      return res.status(400).json({ message: "Failed to Register" });
    }

    const { data: userData, error: insertionError } = await supabase
      .from("users")
      .insert({ email: email, first_name: firstName, last_name: lastName })
      .select("id");

    if (insertionError) {
      return res.status(400).json({ message: "Failed to Insert" });
    }
    res.redirect(
      `https://f34d-166-48-48-44.ngrok-free.app/auth/oauth2/sync/${encodeURIComponent(userData.id)}`
    );
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/oauth2/sync", (req, res) => {
  const scope = [
    "user-read-email user-read-private user-read-recently-played user-top-read",
  ];
  const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
  const REDIRECT_URI = "https://f34d-166-48-48-44.ngrok-free.app/auth/callback";
  const state = uuidv4();
  const authURL = `https://accounts.spotify.com/authorize?response_type=code&client_id=${CLIENT_ID}&scope=${encodeURIComponent(
    scope
  )}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}`;

  res.redirect(authURL);
});

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
    console.log(tokenData)
    const { access_token, refresh_token } = tokenData;
    const { error: insertionError } = await supabase
      .from("users")
      .update({ access_token:access_token, refresh_token: refresh_token})
      .eq("user_id", state);

    if (insertionError) {
      return res.status(400).json({ message: "Failed to Insert" });
    }
    res.redirect("http://localhost:3000/");
  } catch (err) {
    res.status(500).json({ message: "OAuth flow failed" });
  }
});

export default router;
