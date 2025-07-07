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
  const parsedData = await data.json();
  return parsedData;
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
  const rawResponse = await userTracksData.json();
  const response = rawResponse.items;
  let completeTracksList = [];
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
    completeTracksList.push(cleanedUserObject);
  }

  const averagedPopularityScore = popularityScore / 10;
  return { completeTracksList, averagedPopularityScore };
}

//Get this to add to the create playlsit functionality
async function createSharedPlaylist(accessToken, spotifyUserId, name1, name2) {
  //generate using AI the description name and also add a profile pic from pinterest
  const createPlaylist = await fetch(
    `https://api.spotify.com/v1/users/${spotifyUserId}/playlists`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        name: `${name1} + ${name2}'s Playlist`,
        description: `🎉 ${name1} and ${name2} - a musical friendship is born!`,
        public: true,
        collaborative: true,
      }),
    }
  );
  const playlistData = await createPlaylist.json();
  return playlistData;
}

//Add Songs To It

//Call This Twice for Both Users so They Mutually Follow Each Other Back
async function followSpotifyUser(accessToken, userId1, userId2) {
  const response = await fetch(
    `https://api.spotify.com/v1/me/following?type=user&ids=${
      (userId1, userId2)
    }`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );
  return response;
}

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

    return res.status(200).json({ message: "Follow request sent to Spotify." });
  } catch (err) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

async function followPlaylist(accessToken, playlistId) {
  const data = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/followers`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  })
}

//Combine Favourite Songs Into One Playlist
router.post("/create/shared-playlists", async (req, res) => {
  const { userId1, userId2 } = req.body;
  try {
    const [accessToken1, accessToken2] = await Promise.all([
      getAccessToken(userId1),
      getAccessToken(userId2),
    ]);
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
    // Fetch top tracks for both users
    await followPlaylist(accessToken2, createPlaylistResponse.id)

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
      similarityScore: 1 - similarityScore,
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
