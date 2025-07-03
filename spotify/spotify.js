import express from "express";
import dotenv from "dotenv";
import { supabase } from "../supabase/supabase.js";

dotenv.config();
const router = express.Router();

router.get("/oauth2/login", async (req, res) => {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "spotify",
      options: {
        redirectTo: "https://qzpaqlooijqunmoseefh.supabase.co/auth/v1/callback",
        scopes: "user-read-recently-played user-top-read user-library-read user-read-playback-state",
      },
    });

    if (error) {
      return res.status(400).json({ message: "Failed to Authenticate" });
    }

    if (data.url) {
      res.redirect(data.url);
    }
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/oauth2/callback", async (req, res) => {
  const { state } = req.params
  
})


export default router;
