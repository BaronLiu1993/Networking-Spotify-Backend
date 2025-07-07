# 🎧 Spotify API

## 🌐 What This API Does

This API handles:

- Spotify OAuth 2.0 login + token encryption/decryption  
- Secure user registration and Supabase integration  
- Generating QR codes to connect instantly  
- Fetching and analyzing top tracks & artists  
- Calculating cosine similarity between music preferences  
- Automatically creating shared playlists and following users on Spotify

---

## 🔑 Core Features

- 🎵 **Spotify Integration**  
  Secure login and personalized data access (top artists, tracks, genres)

- 🤝 **Music-Based Matching**  
  Compare two users' Spotify vectors using cosine similarity and OpenAI embeddings

- 📀 **Auto-Generated Shared Playlists**  
  Create a collaborative playlist combining each user's top tracks

- 📸 **QR Code Matching**  
  Users can connect instantly by scanning a QR and syncing accounts

- 🔐 **Token Encryption**  
  All access and refresh tokens are encrypted with AES-256-GCM before storage

- 🧑‍🎓 **Student Profile Enrichment**  
  Store academic metadata like major, year, college, and interests to aid compatibility

---

## 🛠 Tech Stack

| Layer | Tools |
|-------|-------|
| **Auth** | Spotify OAuth 2.0 |
| **Encryption** | `crypto`, `scrypt` |
| **Backend** | Express.js |
| **Database** | Supabase (PostgreSQL) |
| **Similarity Analysis** | `compute-cosine-similarity`, OpenAI Embeddings |
| **QR Codes** | Custom generation endpoint (external client support) |

---

## 🧠 How Matching Works

1. Each user's top artists are fetched from Spotify  
2. Genres are extracted → vectorized into an OpenAI embedding  
3. Cosine similarity is computed to get a compatibility score  
4. Shared interests and differences are used to generate icebreakers and playlists

---

## 📡 API Endpoint Overview

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/auth/register` | Create user and store academic profile |
| `GET`  | `/auth/oauth2/sync/:id` | Redirects to Spotify OAuth login |
| `GET`  | `/auth/callback` | Handles Spotify auth callback and token encryption |
| `GET`  | `/auth/refresh-token/:id` | Refreshes Spotify token from Supabase |
| `GET`  | `/auth/get-user-data` | Returns user metadata (major, year, etc.) |
| `POST` | `/match/follow` | Makes user1 follow user2 on Spotify |
| `POST` | `/match/create/shared-playlists` | Combines top tracks into shared playlist |
| `POST` | `/match/analyse` | Computes compatibility score and metadata |
| `GET`  | `/match/top-tracks` | Fetches user's top Spotify tracks |
| `GET`  | `/match/top-artists` | Fetches user's top Spotify artists |

Disclaimer: No Spotify Data is Saved to My Database