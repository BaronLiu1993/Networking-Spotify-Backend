import express from "express";
import dotenv from "dotenv";
import similarity from "compute-cosine-similarity";

//Import Service Layer
import {
  getAccessToken,
  getUserProfile,
  vectoriseProfileData,
  getSpotifyTopTracksData,
  getSpotifyTopArtistsData,
  createSharedPlaylist,
  followSpotifyUser,
  getRedirectData,
  scanQRCode,
} from "../services/spotify.js";
import { decryptToken } from "../services/encrypt.js";
import { supabase } from "../supabase/supabase.js";

dotenv.config();
const router = express.Router();

//get endpoint for expiration of it as well

//Channel Event Handler That Will Then Send Data Over to User
router.post("/get-scan", async (req, res) => {
  const { messageId, ownerId } = req.body;
  try {
    const response = await getRedirectData(messageId, ownerId);
    if (!response.success) {
      return res
        .status(200)
        .json({ message: "No Scanned Data Found", success: false });
    }

    return res.status(200).json({ message: response.userData, success: true });
  } catch (err) {
    return res.status(500).json({ message: "Failed", success: false });
  }
});

router.post("/post-scan", async (req, res) => {
  const { ownerId, scannerId, messageId } = req.body;
  try {
    const response = await scanQRCode(ownerId, scannerId, messageId);
    if (!response.success) {
      return res.status(400).json({ message: "No Scan", success: false });
    }
    return res.status(200).json({ message: response, success: true });
  } catch {
    return res.status(500).json({ message: "Failed", success: false });
  }
});

router.post("/follow", async (req, res) => {
  const { userId1, userId2 } = req.body;
  if (!userId1 || !userId2) {
    return res
      .status(400)
      .json({ message: "Both userId1 and userId2 are required." });
  }

  try {
    const accessToken1 = await getAccessToken(userId1);
    const { data: spotifyData1, error: error1 } = await supabase
      .from("users")
      .select("spotifyId")
      .eq("id", userId1)
      .single();

    const { data: spotifyData2, error: error2 } = await supabase
      .from("users")
      .select("spotifyId")
      .eq("id", userId2)
      .single();

    if (error1 || !spotifyData1) {
      return res
        .status(400)
        .json({ message: "Invalid userId1 or missing spotifyId." });
    }

    if (error2 || !spotifyData2) {
      return res
        .status(400)
        .json({ message: "Invalid userId2 or missing spotifyId." });
    }

    await followSpotifyUser(
      accessToken1,
      spotifyData1.spotifyId,
      spotifyData2.spotifyId
    );

    return res.status(200).json({ message: "Follow Request Sent" });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

//Combine Favourite Songs Into One Playlist
router.post("/create/shared-playlists", async (req, res) => {
  const { userId1, userId2 } = req.body;
  try {
    let [accessToken1, accessToken2] = await Promise.all([
      getAccessToken(userId1),
      getAccessToken(userId2),
    ]);

    accessToken1 = await decryptToken(accessToken1);
    accessToken2 = await decryptToken(accessToken2);

    // Get Spotify user profiles
    const spotifyUser1 = await getUserProfile(accessToken1); // Owner
    const spotifyUser2 = await getUserProfile(accessToken2); // Collaborator

    // Create playlist for the owner
    const rawCreatePlaylistResponse = createSharedPlaylist(
      accessToken1,
      spotifyUser1.id,
      spotifyUser1.display_name,
      spotifyUser2.display_name
    );

    //Follow the Playlist
    const createPlaylistResponse = await rawCreatePlaylistResponse;
    const [user1TracksData, user2TracksData] = await Promise.all([
      fetch(
        "https://api.spotify.com/v1/me/top/tracks?time_range=medium_term&limit=10",
        {
          headers: {
            Authorization: `Bearer ${accessToken1}`,
          },
        }
      ),
      fetch(
        "https://api.spotify.com/v1/me/top/tracks?time_range=medium_term&limit=10",
        {
          headers: {
            Authorization: `Bearer ${accessToken2}`,
          },
        }
      ),
    ]);

    const rawResponse1 = await user1TracksData.json();
    const rawResponse2 = await user2TracksData.json();

    const response1 = rawResponse1.items;
    const response2 = rawResponse2.items;
    let combinedTracks = [];

    //Alternating
    for (let i = 0; i < 10; i++) {
      if (response1[i]) {
        combinedTracks.push(response1[i].uri);
      }
      if (response2[i]) {
        combinedTracks.push(response2[i].uri);
      }
    }

    await fetch(
      `https://api.spotify.com/v1/playlists/${createPlaylistResponse.id}/tracks/`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken1}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uris: combinedTracks,
        }),
      }
    );
    return res
      .status(200)
      .json({ message: "Successfully Created and Added Top Tracks" });
  } catch (err) {
    return res.status(500).json({ message: err.message || err });
  }
});

//Get Similarity
router.post("/analyse", async (req, res) => {
  const { userId1, userId2 } = req.body;
  //Get Score

  try {
    let [accessToken1, accessToken2] = await Promise.all([
      getAccessToken(userId1),
      getAccessToken(userId2),
    ]);

    accessToken1 = await decryptToken(accessToken1);
    accessToken2 = await decryptToken(accessToken2);

    const [
      spotifyArtistData1,
      spotifyArtistData2,
      spotifyTrackData1,
      spotifyTrackData2,
      userData1,
      userData2,
    ] = await Promise.all([
      getSpotifyTopArtistsData(accessToken1),
      getSpotifyTopArtistsData(accessToken2),
      getSpotifyTopTracksData(accessToken1),
      getSpotifyTopTracksData(accessToken2),
      getUserProfile(accessToken1),
      getUserProfile(accessToken2),
    ]);

    const [spotifyVector1, spotifyVector2] = await Promise.all([
      vectoriseProfileData(accessToken1),
      vectoriseProfileData(accessToken2),
    ]);

    const similarityScore = similarity(
      spotifyVector1.embedding,
      spotifyVector2.embedding
    );

    let data = {
      similarityScore: 1 - similarityScore,
      userData: {
        user1: {
          name: userData1.display_name,
          uri: userData1.uri,
          image: userData1?.images[0]?.url,
        },
        user2: {
          name: userData2.display_name,
          uri: userData2.uri,
          image: userData2?.images[0]?.url,
        },
      },
      favouriteGenres: {
        genre1: spotifyVector1.genres,
        genre2: spotifyVector2.genres,
      },
      artistScore: {
        score1: spotifyArtistData1.averagedPopularityScore,
        score2: spotifyArtistData2.averagedPopularityScore,
      },
      trackScore: {
        score1: spotifyTrackData1.averagedPopularityScore,
        score2: spotifyTrackData2.averagedPopularityScore,
      },
      tracks: {
        spotifyTrackData1: spotifyTrackData1.completeTracksList,
        spotifyTrackData2: spotifyTrackData2.completeTracksList,
      },
      artists: {
        spotifyArtistData1: spotifyArtistData1.completeArtistsData,
        spotifyArtistData2: spotifyArtistData2.completeArtistsData,
      },
    };
    return res.status(200).json({ data });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/getUserSpotifyProfile", async (req, res) => {
  const { userId } = req.query;

  try {
    let accessToken = await getAccessToken(userId);
    accessToken = await decryptToken(accessToken);

    const userData = await getUserProfile(accessToken);

    const spotifyProfile = {
      name: userData.display_name,
      uri: userData.uri,
      image: userData?.images?.[0]?.url || null,
    };

    return res.status(200).json({ spotifyProfile });
  } catch (err) {
    console.error("Error fetching user Spotify profile:", err);
    return res.status(500).json({ message: "Failed to fetch Spotify profile" });
  }
});

//Get Top Tracks
router.get("/top-tracks", async (req, res) => {
  const { userId } = req.query;
  try {
    let accessToken = getAccessToken(userId);
    accessToken = await accessToken;
    accessToken = await decryptToken(accessToken);
    const userTracksData = getSpotifyTopTracksData(accessToken);
    const data = await userTracksData;
    return res.status(200).json({ data });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

//Display
router.get("/top-artists", async (req, res) => {
  const { userId } = req.query;
  try {
    const accessToken = getAccessToken(userId);
    accessToken = await accessToken;
    accessToken = await decryptToken(accessToken);
    const userArtistData = getSpotifyTopArtistsData(accessToken);
    const data = await userArtistData;
    return res.status(200).json({ data });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
