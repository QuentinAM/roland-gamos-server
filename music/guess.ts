import { getToken, getArtistPicture, spToken } from "./utils";
import { PrismaClient } from '@prisma/client'
import { SpotifyArtistsResponse, SpotifySearchResponse, SpotifyTrackResponse } from "../wstypes";
const levenshtein_threshold = 2;
const prisma = new PrismaClient();

export async function guess(guess: string, market: string) {
    // Get both artists
    const guess_split: Array<string> = guess.split(",");
    const first_artist: string = guess_split[0];
    const second_artist: string = guess_split[1];

    // Check if the guess is cached
    const cacheRes = await prisma.track.findFirst({
        where: {
            AND: [
                {
                    artists: {
                        some: {
                            acceptedNames: {
                                has: first_artist
                            }
                        }
                    }
                },
                {
                    artists: {
                        some: {
                            acceptedNames: {
                                has: second_artist
                            }
                        }
                    }
                }
            ]
        },
        include: {
            artists: true
        }
    })

    if (cacheRes) {
        console.log('Found in cache:', cacheRes.name);

        return cacheRes;
    }

    let { track, token } = await GuessEndpoint(first_artist, second_artist, market, spToken);

    if (!track) {
        return;
    }

    let res = await CheckTrack(track, first_artist, second_artist, token);

    return res;
}

async function CheckTrack(track: SpotifyTrackResponse, first_artist: string, second_artist: string, token: string) {
    const feat = IsValid(first_artist, second_artist, track.artists);

    if (track && feat[0] && feat[1]) {
        const feat0Image = await getArtistPicture(feat[0].href, token);
        const feat1Image = await getArtistPicture(feat[1].href, token);

        let feat0AcceptedNames = [feat[0].name];
        if (feat[0].name !== first_artist) {
            feat0AcceptedNames.push(first_artist);
        }

        let feat1AcceptedNames = [feat[1].name];
        if (feat[1].name !== second_artist) {
            feat1AcceptedNames.push(second_artist);
        }

        // Add the track to the database
        const res = await prisma.track.upsert({
            where: {
                id: track.id
            },
            update: {},
            create: {
                id: track.id,
                name: track.name,
                trackImage: track.album.images[0].url,
                releaseDate: track.album.release_date,
                previewUrl: track.preview_url,
                artists: {
                    connectOrCreate: [
                        {
                            where: {
                                id: feat[0].id
                            },
                            create: {
                                id: feat[0].id,
                                name: feat[0].name,
                                acceptedNames: feat0AcceptedNames,
                                artistImage: feat0Image?.url || "",
                            }
                        },
                        {
                            where: {
                                id: feat[1].id
                            },
                            create: {
                                id: feat[1].id,
                                name: feat[1].name,
                                acceptedNames: feat1AcceptedNames,
                                artistImage: feat1Image?.url || "",
                            }
                        }
                    ]
                }
            },
            include: {
                artists: true
            }
        });

        return res;
    }
}

async function GuessEndpoint(first_artist: string, second_artist: string, market: string | null, token: string | null): Promise<{ track?: SpotifyTrackResponse, token: string }> {
    if (!token) {
        token = await getToken();
    }

    let url = encodeURI(`https://api.spotify.com/v1/search?limit=25&type=track${market !== null ? `&market=${market}` : ''}&q=${`${first_artist} ${second_artist}`}`);

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
            return GuessEndpoint(first_artist, second_artist, market, token);
        }

        let res = data.tracks?.items.filter(track => {
            // Check if both artist are in item.artists list
            const [artist1, artist2] = IsValid(first_artist, second_artist, track.artists);
            
            return artist1 && artist2;
        })

        if (!res) {
            console.error('No results for', first_artist, second_artist);
            console.error('An error might have occurred while fetching the track:', data);

            return {
                token: token
            };
        }

        // Check if there is at least one result
        if (res.length === 0) {
            return {
                token: token
            };
        }
        else {
            return {
                track: res[0],
                token: token
            };
        }
    } catch (error) {
        console.log(error);

        return {
            token: token
        };
    }
}

function IsValid(first_artist: string, second_artist: string, artists: SpotifyArtistsResponse[]) {
    // Check if both artists are in the list of artists
    const first_artist_found = artists.find(artist => levenshtein(FormatName(artist.name), FormatName(first_artist)) <= levenshtein_threshold);

    const second_artist_found = artists.find(artist => levenshtein(FormatName(artist.name), FormatName(second_artist)) <= levenshtein_threshold);

    return [first_artist_found, second_artist_found];
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

function levenshtein(s: string, t: string) {
    if (s === t) {
        return 0;
    }
    var n = s.length, m = t.length;
    if (n === 0 || m === 0) {
        return n + m;
    }
    var x = 0, y, a, b, c, d, g, h, k;
    var p = new Array(n);
    for (y = 0; y < n;) {
        p[y] = ++y;
    }

    for (; (x + 3) < m; x += 4) {
        var e1 = t.charCodeAt(x);
        var e2 = t.charCodeAt(x + 1);
        var e3 = t.charCodeAt(x + 2);
        var e4 = t.charCodeAt(x + 3);
        c = x;
        b = x + 1;
        d = x + 2;
        g = x + 3;
        h = x + 4;
        for (y = 0; y < n; y++) {
            k = s.charCodeAt(y);
            a = p[y];
            if (a < c || b < c) {
                c = (a > b ? b + 1 : a + 1);
            }
            else {
                if (e1 !== k) {
                    c++;
                }
            }

            if (c < b || d < b) {
                b = (c > d ? d + 1 : c + 1);
            }
            else {
                if (e2 !== k) {
                    b++;
                }
            }

            if (b < d || g < d) {
                d = (b > g ? g + 1 : b + 1);
            }
            else {
                if (e3 !== k) {
                    d++;
                }
            }

            if (d < g || h < g) {
                g = (d > h ? h + 1 : d + 1);
            }
            else {
                if (e4 !== k) {
                    g++;
                }
            }
            p[y] = h = g;
            g = d;
            d = b;
            b = c;
            c = a;
        }
    }

    for (; x < m;) {
        var e = t.charCodeAt(x);
        c = x;
        d = ++x;
        for (y = 0; y < n; y++) {
            a = p[y];
            if (a < c || d < c) {
                d = (a > d ? d + 1 : a + 1);
            }
            else {
                if (e !== s.charCodeAt(y)) {
                    d = c + 1;
                }
                else {
                    d = c;
                }
            }
            p[y] = d;
            c = a;
        }
        h = d;
    }

    return h;
}
