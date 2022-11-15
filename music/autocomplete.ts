import { Artist } from "@prisma/client";
import { SpotifyArtistsResponse, SpotifySearchResponse } from "../wstypes";
import { spToken, getToken } from "./utils";

export async function autoComplete(input: string): Promise<Artist[]> {
    if (!input) return [];

    // TODO: Hit cache before spotify endpoint
    // Get both artists
    let { artists: spArtists } = await autoCompleteEndpoint(input, spToken);

    // Filter list
    // If two arists have the same name, take the one with more followers
    for (let i = 0; i < spArtists.length; i++) {
        for (let j = i + 1; j < spArtists.length; j++) {
            if (spArtists[i].name === spArtists[j].name && i != j) {
                if (spArtists[i].followers.total > spArtists[j].followers.total) {
                    spArtists.splice(j, 1);
                }
                else {
                    spArtists.splice(i, 1);
                }
            }
        }
    }

    // Now filter list by input
    spArtists = spArtists.filter(artist => FormatName(artist.name).startsWith(FormatName(input)));

    // Only keep name and one images
    let artists: Artist[] = spArtists.map(artist => {
        return {
            id: artist.id,
            name: artist.name,
            artistImage: artist.images.length > 0 ? artist.images[0].url : '',
            acceptedNames: [artist.name]
        }
    });

    return artists;
}

function FormatName(name: string) {
    // Lowercase
    name = name.toLowerCase();

    // Remove spaces
    name = name.replace(' ', '');

    // Remove accents
    name = name.normalize('NFD').replace(/[\u0300-\u036f]/g, "");

    return name;
}

async function autoCompleteEndpoint(input: string, token: string | null): Promise<{
    artists: SpotifyArtistsResponse[];
}> {
    let url = encodeURI(`https://api.spotify.com/v1/search?limit=3&market=FR&type=artist&q=${input}`);

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json',
            }
        });

        const data = await response.json() as SpotifySearchResponse;

        // Check for errors
        if (data.error && data.error.status === 401 || data.error && data.error.status === 400) {
            // Change headers and call again
            return autoCompleteEndpoint(input, await getToken());
        }

        // TODO: Add to cache

        return {
            artists: data?.artists?.items ? data.artists.items : []
        }
    } catch (error) {
        console.error(error);

        return {
            artists: []
        }
    }
}
