export let spToken = "";

export async function getToken() {
    const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
    const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error('Spotify client id or secret not found in env.');
    }

    try {
        const response = await fetch(`https://accounts.spotify.com/api/token`, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + (Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')),
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                'grant_type': 'client_credentials'
            })
        });
        const data = await response.json() as any;
        spToken = data.access_token;

        return data.access_token;
    } catch (error) {
        console.error(error);
    }
}

export async function getArtistPicture(request: string, token?: string) {
    try {
        const response = await fetch(request, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json',
            }
        });

        const data = await response.json() as any;

        return data.images.length > 0 ? data.images[0].url : {};
    } catch (error) {
        console.error(error);
    }
}
