const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
let accessToken = ''; // You'll need to get this dynamically or via the login

// Helper function to generate a random string for state validation
const generateRandomString = (length) => {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};

// Function to get Spotify access token (Client Credentials Flow)
const getSpotifyToken = async () => {
    try {
        const response = await axios.post('https://accounts.spotify.com/api/token', querystring.stringify({
            grant_type: 'client_credentials'
        }), {
            headers: {
                'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        accessToken = response.data.access_token;
        console.log('Spotify access token generated successfully');
    } catch (error) {
        console.error('Error getting Spotify token:', error);
    }
};

// Search for songs using Spotify API
app.get('/search', async (req, res) => {
    const query = req.query.query;
    try {
        const response = await axios.get('https://api.spotify.com/v1/search', {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            params: { q: query, type: 'track' }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error searching for songs', error);
        res.sendStatus(500);
    }
});

// Login Route
app.get('/login', (req, res) => {
    const scopes = 'playlist-modify-public playlist-modify-private';
    const state = generateRandomString(16); // Generate state for security
    const query = querystring.stringify({
        response_type: 'code',
        client_id: clientId,
        scope: scopes,
        redirect_uri: redirectUri,
        state: state
    });
    res.redirect(`https://accounts.spotify.com/authorize?${query}`);
});

app.get('/callback', async (req, res) => {
    const code = req.query.code || null;

    if (code) {
        const authOptions = {
            url: 'https://accounts.spotify.com/api/token',
            method: 'post',
            params: {
                code: code,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            },
            headers: {
                'Authorization': 'Basic ' + (Buffer.from(clientId + ':' + clientSecret).toString('base64')),
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        };

        try {
            const response = await axios(authOptions);
            const { access_token, refresh_token } = response.data;

            // Redirect to frontend with the access token in the URL
            res.redirect(`http://localhost:3000/?access_token=${access_token}`);  // Send token to frontend
        } catch (error) {
            console.error('Error fetching Spotify token:', error);
            res.redirect('/?error=invalid_token');
        }
    } else {
        res.redirect('/?error=missing_code');
    }
});

app.post('/refresh-token', async (req, res) => {
    const { refreshToken } = req.body;
    const clientId = 'your-client-id';
    const clientSecret = 'your-client-secret';

    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);

    try {
        const response = await axios.post('https://accounts.spotify.com/api/token', params, {
            headers: {
                Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error refreshing token:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to refresh token' });
    }
});

// Create playlist using selected songs
app.post('/create-playlist', async (req, res) => {
    const { songs, access_token } = req.body;

    if (!songs || songs.length !== 3 || !access_token) {
        return res.status(400).send('Invalid request.');
    }

    try {
        // 1. Create the playlist
        const createPlaylistResponse = await axios({
            url: 'https://api.spotify.com/v1/me/playlists',
            method: 'post',
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json',
            },
            data: {
                name: 'My Tuneblend Playlist',
                description: 'A playlist created with Tuneblend',
                public: false, // or true if you want it public
            }
        });

        const playlistId = createPlaylistResponse.data.id;

        // 2. Add songs to the playlist
        await axios({
            url: `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
            method: 'post',
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json',
            },
            data: {
                uris: songs, // Spotify track URIs
            }
        });

        res.status(200).send('Playlist created successfully!');
    } catch (error) {
        console.error('Error creating playlist:', error);
        res.status(500).send('Failed to create playlist');
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
    await getSpotifyToken();  // Generate the token when the server starts
    console.log(`Server is running on port ${PORT}`);
});
