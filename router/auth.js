import express from "express";
import dotenv from "dotenv";
import { supabase } from "../supabase/supabase.js";

//Verification of Token
import { verifyToken } from "../middleware/auth.js";

//Encryption and Decryption
import { encryptToken, decryptToken } from "../services/encrypt.js";

dotenv.config();
const router = express.Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data: loginData, error: loginError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });
    if (loginError) {
      return res.status(400).json({ message: "Failed to Login" });
    }
    return res.status(200).json({
      access_token: loginData.session.access_token,
      refresh_token: loginData.session.refresh_token,
      userId: loginData.user.id,
    });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/register", async (req, res) => {
  const {
    email,
    password,
    firstName,
    lastName,
    major,
    year,
    college,
    interests,
  } = req.body;
  try {
    const { data: registrationData, error: registrationError } =
      await supabase.auth.signUp({
        email,
        password,
      });

    if (registrationError) {
      return res.status(400).json({ message: "Failed to Register" });
    }
    const { error: insertionError } = await supabase.from("users").insert({
      id: registrationData.user.id,
      email,
      firstName,
      lastName,
      major,
      year,
      college,
      interests,
    });

    if (insertionError) {
      return res.status(400).json({ message: "Failed to Insert" });
    }

    return res.status(200).json({
      url: `https://network-spotify-backend.onrender.com/auth/oauth2/sync/${encodeURIComponent(
        registrationData.user.id
      )}`,
    });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});
router.delete("/delete-account", verifyToken, async (req, res) => {
  const { userId } = req.user

  if (!userId) {
    return res.status(400).json({ message: "Missing userId" });
  }

  try {
    const { error: deletionError } = await supabase
      .from("users")
      .delete()
      .eq("userId", userId);

    if (deletionError) {
      return res.status(400).json({ message: "Failed to delete" });
    }

    return res.status(200).json({ message: "Deleted successfully" });
  } catch (err) {
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/oauth2/sync/:id", (req, res) => {
  const { id } = req.params;
  const state = id;
  const scope =
    "user-read-email user-read-private user-read-recently-played user-top-read playlist-modify-public playlist-modify-private ugc-image-upload user-follow-modify";
  const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
  const REDIRECT_URI = "https://network-spotify-backend.onrender.com/auth/callback";
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
  const REDIRECT_URI = "https://network-spotify-backend.onrender.com/auth/callback";

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
    if (!access_token || !refresh_token) {
      return res.status(400).json({ message: "Failed to retrieve tokens" });
    }

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
        access_token: await encryptToken(access_token),
        refresh_token: await encryptToken(refresh_token),
        spotifyId: userIdData.id,
      })
      .eq("id", state);

    if (insertionError) {
      return res.status(400).json({ message: "Failed to Insert" });
    }

    res.redirect("https://indie-b-sides-frontend.vercel.app/login");
  } catch (err) {
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
        refresh_token: await decryptToken(userData.refresh_token),
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });
    const response = await body.json();
    const { error: accessTokenInsertionError } = await supabase
      .from("users")
      .update({ access_token: await encryptToken(response.access_token) })
      .eq("id", id);

    if (accessTokenInsertionError) {
      return res.status(400).json({ message: "Failed to Insert Access Token" });
    }
    return res.status(200).json({ message: "Refreshed" });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/get-user-data", verifyToken, async (req, res) => {
  const userId = req.user;
  try {
    const { data: userData, error: userDataError } = await supabase
      .from("users")
      .select("major, year, interests, lastName, firstName")
      .eq("id", userId);
    if (userDataError) {
      return res.status(400).json({ message: "Failed to Authorize", success: false });
    }
    return res.status(200).json({ data: userData, success: true });
  } catch {
    return res.status(500).json({ message: "Internal Server Error", success: true });
  }
});

router.get("/get-user", async (req, res) => {
  const { userId1, userId2 } = req.query;
  try {
    const { data: userData1, error: userDataError1 } = await supabase
      .from("users")
      .select("major, year, interests, lastName, firstName")
      .eq("id", userId1);
    const { data: userData2, error: userDataError2 } = await supabase
      .from("users")
      .select("major, year, interests, lastName, firstName")
      .eq("id", userId2);

    if (userDataError1 || userDataError2) {
      return res.status(400).json({ message: "Failed to Authorize" });
    }
    return res.status(200).json({ data: { userData1, userData2 } });
  } catch {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
