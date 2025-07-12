import dotenv from "dotenv";
import { supabase } from "../supabase/supabase.js";
import OpenAI from "openai";

dotenv.config();

//Configure Client
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({
  apiKey: OPENAI_KEY,
});

export async function scanQRCode(ownerId, scannerId, messageId) {
  const { error: insertionError } = await supabase.from("qr_scans").insert({
    ownerId,
    scannerId,
    messageId,
  });
  if (!insertionError) {
    return { message: "Failed", success: true };
  }
  return { message: "Success", success: true };
}

export async function getRedirectData(messageId) {
  const { data: userData, error: fetchError } = await supabase
    .from("qr_scans")
    .select("ownerId, scannerId")
    .eq("messageId", messageId)
    .single();
  if (fetchError) {
    return { message: "Failed to Fetch", success: false };
  }
  return { message: userData, success: true };
}
//Helper Functions
export async function getAccessToken(userId) {
  const { data: accessTokenData } = await supabase
    .from("users")
    .select("access_token")
    .eq("id", userId)
    .single();
  return accessTokenData.access_token;
}

export async function getUserProfile(accessToken) {
  const data = await fetch("https://api.spotify.com/v1/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const parsedData = await data.json();
  return parsedData;
}

export async function vectoriseProfileData(accessToken) {
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

export async function getSpotifyTopArtistsData(accessToken) {
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
      uri: response[i].uri,
    };
    popularityScore = popularityScore + response[i].popularity;
    completeArtistsData.push(cleanedUserObject);
  }
  const averagedPopularityScore = popularityScore / 10;
  return { completeArtistsData, averagedPopularityScore };
}

export async function getSpotifyUserData(accessToken) {
  const userData = await fetch("https://api.spotify.com/v1/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const userDataJSON = await userData.json();
  return userDataJSON;
}

export async function getSpotifyTopTracksData(accessToken) {
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
    const track = response[i];
    let cleanedTrackObject = {
      artist: track.album.artists[0].name,
      name: track.name,
      uri: track.uri,
      popularity: track.popularity,
      id: track.id,
      image: track.album.images[0].url, // 640 x 640
    };

    popularityScore += track.popularity;
    completeTracksList.push(cleanedTrackObject);
  }

  const averagedPopularityScore = popularityScore / 10;

  return { completeTracksList, averagedPopularityScore };
}

//Get this to add to the create playlsit functionality
export async function createSharedPlaylist(
  accessToken,
  spotifyUserId,
  name1,
  name2
) {
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
export async function followSpotifyUser(accessToken, userId1, userId2) {
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
