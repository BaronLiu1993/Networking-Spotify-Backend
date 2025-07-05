import express from "express";
import dotenv from "dotenv";
import { supabase } from "../supabase/supabase.js";

dotenv.config();
const router = express.Router();

//Helper Functions
async function generateFunctions(spotifyData) {
    const data = Promise.all([
        
    ])
}

async function cosineSimilarity(vec1, vec2) {

}

async function getAccessToken (userId) {
    const { data: accessTokenData } = await supabase
        .from("users")
        .select("access_token")
        .eq("id", userId)
        .single()
    return accessTokenData.access_token
}

async function getUserProfile(accessToken) {
    const data = await fetch("https://api.spotify.com/v1/me",{
        method: "GET",
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    })
    return data.id
}

async function getSpotifyData(accessToken) {
    const userTracksData = await fetch(
        "https://api.spotify.com/v1/me/top/tracks?time_range=medium_term&limit=10",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
    const response = userTracksData.data.items
    let completeArtistList = []
    for (let i = 0; i < response.length; i++) {
        let cleanedUserObject = {
            artist: response[i].album.artists[0].name,
            name: response[i].name,
            url: response[i].external_urls.spotify,
            weight: response[i].popularity,
            id: response[i].id
        }
        completeArtistList.push(cleanedUserObject)
    }
    return completeArtistList
}

router.post("/create/shared-playlists", async (req, res) => {
    const { userId1, userId2 } = req.query
    const accessToken1 = getAccessToken(userId1)
    const accessToken2 = getAccessToken(userId2)
    const spotifyUserId1 = getUserProfile(accessToken1)
    const spotifyUserId2 = getUserProfile(accessToken2)
    //Add Collaborator Somehow

    const response = await fetch(`https://api.spotify.com/v1/users/${spotifyUserId1}/playlists`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken1}`
        },
        body: JSON.stringify({
            name: "Test",
            description: "New Playlist Description",
            public: true,
            collaborative: true
        })
    })

    if (response.ok) {
        return res.status(201).json({message: "Created Successfully"})
    }

})

router.get("/analyse", async (req, res) => {
    const { userId1, userId2 } = req.query
    //Get Score
    const [accessToken1, accessToken2] = Promise.all([
        getAccessToken(userId1),
        getAccessToken(userId2)
    ])

    const [spotifyData1, spotifyData2] = Promise.all([
        getSpotifyData(accessToken1),
        getSpotifyData(accessToken2)
    ])

    const [audioData1, audioData2] = Promise.all([

    ])

    const similarityScore = cosineSimilarity(spotifyData1, spotifyData2)
    let data = [{similarityScore, spotifyData1, spotifyData2}]
    return res.status.json({data})
    
})



//Get Top Tracks
router.get("/top-tracks", async (req, res) => {
  const { accessToken } = req.query;
  const userTracksData = await fetch(
    "https://api.spotify.com/v1/me/top/tracks?time_range=medium_term&limit=20",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  const data = await userTracksData.json();
  return res.status(200).json({ data });
});

//Display
router.get("/top-artists", async (req, res) => {
  const { accessToken } = req.query;
  const userTracksData = await fetch(
    "https://api.spotify.com/v1/me/top/tracks?time_range=medium_term&limit=20",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  const data = await userTracksData.json();

  for (let i = 0; i < data.length; i++) {}
  return res.status(200).json({ data });
});

export default router;
