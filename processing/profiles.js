import express from "express";
import dotenv from "dotenv";
import { supabase } from "../supabase/supabase.js";
import OpenAI from "openai";
import similarity from "compute-cosine-similarity";

dotenv.config();
const router = express.Router();

//Configure Client
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({
  apiKey: OPENAI_KEY,
});

//Helper Functions

async function getAccessToken(userId) {
  const { data: accessTokenData } = await supabase
    .from("users")
    .select("access_token")
    .eq("id", userId)
    .single();
  return accessTokenData.access_token;
}

async function getUserProfile(accessToken) {
  const data = await fetch("https://api.spotify.com/v1/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return data.id;
}

async function vectoriseProfileData(accessToken) {
  const userGenreData = await fetch(
    "https://api.spotify.com/v1/me/top/artists?time_range=medium_term&limit=10",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  const rawResponse = await userGenreData.json();
  const response = rawResponse.items;
  const rawVectorData = [];
  for (let i = 0; i < response.length; i++) {
    rawVectorData.push(...response[i].genres);
  }
  const removedDuplicateVectorData = [...new Set(rawVectorData)].sort();
  const completeVectorData = removedDuplicateVectorData.join(" ");
  const embeddingVector = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: completeVectorData,
    encoding_format: "float",
  });
  return {
    embedding: embeddingVector.data[0].embedding,
    genres: removedDuplicateVectorData,
  };
}

async function getSpotifyTopArtistsData(accessToken) {
  const userArtistsData = await fetch(
    "https://api.spotify.com/v1/me/top/artists?time_range=medium_term&limit=10",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  const rawResponse = await userArtistsData.json();
  const response = rawResponse.items;
  let completeArtistsData = [];
  let popularityScore = 0;
  for (let i = 0; i < response.length; i++) {
    let cleanedUserObject = {
      followers: response[i].followers.total,
      genre: response[i].genres, //Array
      name: response[i].name,
      popularity: response[i].popularity,
      id: response[i].id,
      image: response[i].images[0].url, //640 x 640
    };
    popularityScore = popularityScore + response[i].popularity;
    completeArtistsData.push(cleanedUserObject);
  }

  const averagedPopularityScore = popularityScore / 10;
  return { completeArtistsData, averagedPopularityScore };
}

async function getSpotifyTopTracksData(accessToken) {
  const userTracksData = await fetch(
    "https://api.spotify.com/v1/me/top/tracks?time_range=medium_term&limit=10",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  console.log(userTracksData);
  const rawResponse = await userTracksData.json();
  const response = rawResponse.items;
  console.log(response);
  let completeArtistList = [];
  let popularityScore = 0;
  for (let i = 0; i < response.length; i++) {
    let cleanedUserObject = {
      artist: response[i].album.artists[0].name,
      name: response[i].name,
      url: response[i].external_urls.spotify,
      popularity: response[i].popularity,
      id: response[i].id,
      image: response[i].album.images[0].url, // 640 x 640
    };
    popularityScore = popularityScore + response[i].popularity;
    completeArtistList.push(cleanedUserObject);
  }

  const averagedPopularityScore = popularityScore / 10;
  return { completeArtistList, averagedPopularityScore };
}

async function createSharedPlaylist(accessToken, spotifyUserId) {
  const createPlaylist = await fetch(
    `https://api.spotify.com/v1/users/${spotifyUserId}/playlists`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        name: "Test",
        description: "New Playlist Description",
        public: true,
        collaborative: true,
      }),
    }
  );
  if (createPlaylist.ok) {
    return { success: true };
  }

  return { success: false };
}

//Add Songs To It

//Call This Twice for Both Users so They Mutually Follow Each Other Back
async function followSpotifyUser(accessToken, userId1, userId2) {
  const followSpotifyUserResponse = await fetch("https://api.spotify.com/v1/me/following", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids: [userId1, userId2] }),
  });
}

router.post("/follow-user", async (req, res) => {
  const { userId1, userId2 } = req.query;
  try {
    const accessToken1 = await getAccessToken(userId1);
    const { data: spotifyData1, error: spotifyFetchErrorUserId1 } = await supabase
      .from("users")
      .select("spotifyId")
      .eq("id", userId1)
      .single();
    const { data: spotifyData2, error: spotifyFetchErrorUserId2 } = await supabase
      .from("users")
      .select("spotifyId")
      .eq("id", userId2)
      .single();
    const rawFollowResponse = followSpotifyUser(accessToken1, spotifyData1.spotifyId, spotifyData2.spotifyId);
    return res.status(200).json({message: "Followed"})
  } catch (err) {
    console.log(err)
    return res.status(500).json({message: err})
  }
  
});

//Combine Favourite Songs Into One Playlist
router.post("/create/shared-playlists/:userId1/:userId2", async (req, res) => {
  const { userId1, userId2 } = req.query;
  const [accessToken1, accessToken2] = await Promise.all([
    getAccessToken(userId1),
    getAccessToken(userId2),
  ]);
  const spotifyUserId1 = getUserProfile(accessToken1);
  const spotifyUserId2 = getUserProfile(accessToken2);

  //Create Playlist here
  const rawCreatePlaylistResponse = createSharedPlaylist(
    accessToken1,
    spotifyUserId1
  );
  const createPlaylistResponse = await rawCreatePlaylistResponse;
  if (!createPlaylistResponse.success) {
    return res.status(400).json({ message: "Authorization Error" });
  }

  res;
});

//Get Similarity
router.get("/analyse/:userId1/:userId2", async (req, res) => {
  const { userId1, userId2 } = req.params;
  //Get Score
  try {
    const [accessToken1, accessToken2] = await Promise.all([
      getAccessToken(userId1),
      getAccessToken(userId2),
    ]);

    const [
      spotifyArtistData1,
      spotifyArtistData2,
      spotifyTrackData1,
      spotifyTrackData2,
    ] = await Promise.all([
      getSpotifyTopArtistsData(accessToken1),
      getSpotifyTopArtistsData(accessToken2),
      getSpotifyTopTracksData(accessToken1),
      getSpotifyTopTracksData(accessToken2),
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
      similarityScore,
      artistScore: {
        score1: spotifyArtistData1.averagedPopularityScore,
        score2: spotifyArtistData2.averagedPopularityScore,
      },
      trackScore: {
        score1: spotifyTrackData1.averagedPopularityScore,
        score2: spotifyTrackData2.averagedPopularityScore,
      },
      tracks: {
        spotifyTrackData1: spotifyTrackData1.completeArtistList,
        spotifyTrackData2: spotifyTrackData2.completeArtistList,
      },
      artists: {
        spotifyArtistData1: spotifyArtistData1.completeArtistsData,
        spotifyArtistData2: spotifyArtistData2.completeArtistsData,
      },
    };
    return res.status(200).json({ data });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

//Get Top Tracks
router.get("/top-tracks", async (req, res) => {
  const { userId } = req.query;
  try {
    const accessToken = getAccessToken(userId);
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
    const processedAccessToken = await accessToken;
    const userArtistData = getSpotifyTopArtistsData(processedAccessToken);
    const data = await userArtistData;
    return res.status(200).json({ data });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
