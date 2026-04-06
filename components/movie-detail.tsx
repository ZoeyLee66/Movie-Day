import { useEffect, useState } from 'react';
import {
    View,
    Text,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
    getUserRating,
    isInWantToWatch,
    saveUserRatingAndRefreshPredictions,
    toggleWantToWatch,
} from '../db/database';

type EntrySource = 'rate-movies' | 'home' | 'user-page';
type Provider = 'defaultAll' | 'Disney+' | 'Netflix';

const defaultEmptyStar = require('../assets/images/icons/emptyStar.png');
const defaultHalfStar = require('../assets/images/icons/defaultHalf.png');
const defaultFullStar = require('../assets/images/icons/defaultStar.png');

const netflixHalfStar = require('../assets/images/icons/netflixHalf.png');
const netflixFullStar = require('../assets/images/icons/netflixStar.png');

const disneyHalfStar = require('../assets/images/icons/disneyHalf.png');
const disneyFullStar = require('../assets/images/icons/disneyStar.png');

const defaultUnsave = require('../assets/images/icons/defaultUnsave.png');
const defaultSave = require('../assets/images/icons/defaultSave.png');

const netflixUnsave = require('../assets/images/icons/netflixUnsave.png');
const netflixSave = require('../assets/images/icons/netflixSave.png');

const disneyUnsave = require('../assets/images/icons/disneyUnsave.png');
const disneySave = require('../assets/images/icons/disneySave.png');

type MovieDetailProps = {
    movie: {
        movie_id: number;
        title: string;
        release_year: number;
        genres: string;
        overview: string;
        keywords?: string;
        cast?: string;
        director: string;
        avg_rating?: number | null;
        predicted_rating?: number | null;
        rating_count?: number | null;
        poster_url: string;
        user_rating?: number | null;
        is_saved?: number;
    };
    source?: EntrySource;
    provider?: Provider;
};

const STAR_SIZE = 45;
const THEME_TEXT_COLOR = {
    defaultAll: '#FFD54A',
    'Disney+': '#006E99',
    Netflix: '#BA0C0C',
};

function getThemeTextColor(provider: Provider) {
    return THEME_TEXT_COLOR[provider];
}

function getStarAssets(provider: Provider) {
    if (provider === 'Netflix') {
        return {
            empty: defaultEmptyStar,
            half: netflixHalfStar,
            full: netflixFullStar,
        };
    }

    if (provider === 'Disney+') {
        return {
            empty: defaultEmptyStar,
            half: disneyHalfStar,
            full: disneyFullStar,
        };
    }

    return {
        empty: defaultEmptyStar,
        half: defaultHalfStar,
        full: defaultFullStar,
    };
}

function getSaveAssets(provider: Provider) {
    if (provider === 'Netflix') {
        return {
            unsave: netflixUnsave,
            save: netflixSave,
        };
    }

    if (provider === 'Disney+') {
        return {
            unsave: disneyUnsave,
            save: disneySave,
        };
    }

    return {
        unsave: defaultUnsave,
        save: defaultSave,
    };
}

export default function MovieDetail({
    movie,
    source = 'home',
    provider = 'defaultAll',
}: MovieDetailProps) {
    const [selectedRating, setSelectedRating] = useState<number | null>(null);
    const [savedRating, setSavedRating] = useState<number | null>(
        movie.user_rating ?? null
    );
    const [savedToWatch, setSavedToWatch] = useState<boolean>(
        Boolean(movie.is_saved)
    );

    const themeColor = getThemeTextColor(provider);
    useEffect(() => {
        const loadState = async () => {
            try {
                const [rating, saved] = await Promise.all([
                    getUserRating(movie.movie_id),
                    isInWantToWatch(movie.movie_id),
                ]);

                setSavedRating(rating);
                setSelectedRating(rating);
                setSavedToWatch(saved);
            } catch (error) {
                console.error('Failed to load movie detail state:', error);
            }
        };

        loadState();
    }, [movie.movie_id]);

    const starAssets = getStarAssets(provider);
    const saveAssets = getSaveAssets(provider);

    const genreList = movie.genres
        ? movie.genres.split(',').map((genre) => genre.trim()).filter(Boolean).slice(0, 3)
        : [];

    const keywordList = movie.keywords
        ? movie.keywords.split(',').map((keyword) => keyword.trim()).filter(Boolean).slice(0, 3)
        : [];

    const isFromRateMovies = source === 'rate-movies';
    const isRated = savedRating !== null;
    const hasPredictedRating =
        movie.predicted_rating !== undefined && movie.predicted_rating !== null;

    const displayRating =
        selectedRating !== null
            ? selectedRating
            : savedRating !== null
                ? savedRating
                : 0;

    const showSaveButton = !isFromRateMovies && !isRated;

    const handlePressStar = async (index: number, event: GestureResponderEvent) => {
        try {
            const { locationX } = event.nativeEvent;
            const isHalf = locationX < STAR_SIZE / 2;
            const nextRating = isHalf ? index + 0.5 : index + 1;

            setSelectedRating(nextRating);
            setSavedRating(nextRating);
            setSavedToWatch(false);

            await saveUserRatingAndRefreshPredictions(movie.movie_id, nextRating);
        } catch (error) {
            console.error('Failed to save rating:', error);
        }
    };

    const handleToggleSave = async () => {
        try {
            const nextSaved = await toggleWantToWatch(movie.movie_id);
            setSavedToWatch(nextSaved);
        } catch (error) {
            console.error('Failed to toggle want to watch:', error);
        }
    };

    const renderStar = (index: number) => {
        const starValue = index + 1;

        let sourceImage = starAssets.empty;

        if (displayRating >= starValue) {
            sourceImage = starAssets.full;
        } else if (displayRating >= starValue - 0.5) {
            sourceImage = starAssets.half;
        }

        return (
            <Pressable
                key={index}
                onPress={(event) => handlePressStar(index, event)}
                style={styles.starPressable}
            >
                <Image source={sourceImage} style={styles.star} />
            </Pressable>
        );
    };

    console.log('detail source:', source);
    console.log('detail predicted_rating:', movie.predicted_rating);
    console.log('detail movie:', movie);

    return (
        <View style={styles.screen}>
            <ScrollView
                style={styles.container}
                contentContainerStyle={styles.contentContainer}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.inner}>
                    <Pressable onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
                    </Pressable>

                    <Text style={styles.title}>
                        {movie.title}
                    </Text>

                    <Image
                        source={{ uri: movie.poster_url }}
                        resizeMode="cover"
                        style={styles.poster}
                    />

                    {!isFromRateMovies && hasPredictedRating && (
                        <Text style={[styles.scoreText, { color: themeColor }]}>
                            predicted{' '}
                            <Text style={[styles.scoreValue, { color: themeColor }]}>
                                ★ {Number(movie.predicted_rating).toFixed(1)}
                            </Text>
                            {movie.avg_rating !== null &&
                                movie.avg_rating !== undefined && (
                                    <Text style={[{ color: themeColor }]}>
                                        {' '}avg. {Number(movie.avg_rating).toFixed(1)}
                                    </Text>
                                )}
                        </Text>
                    )}

                    <View style={styles.genreRow}>
                        {genreList.map((genre, index) => (
                            <View key={`${genre}-${index}`} style={styles.genreChip}>
                                <Text style={styles.genreText}>{genre}</Text>
                            </View>
                        ))}
                    </View>

                    {keywordList.length > 0 && (
                        <Text style={styles.keywordText}>
                            {keywordList.map((keyword) => `# ${keyword}`).join('    ')}
                        </Text>
                    )}

                    <View style={styles.starRow}>
                        {[0, 1, 2, 3, 4].map(renderStar)}
                    </View>

                    <Text style={styles.sectionTitle}>OVERVIEW</Text>
                    <Text style={styles.bodyText}>
                        {movie.overview || 'No overview available.'}
                    </Text>

                    <Text style={styles.sectionTitle}>DIRECTOR</Text>
                    <Text style={styles.bodyText}>{movie.director || 'Unknown'}</Text>

                    <Text style={styles.sectionTitle}>CAST</Text>
                    <Text style={styles.bodyText}>{movie.cast || 'Unknown'}</Text>
                </View>
            </ScrollView>

            {showSaveButton && (
                <Pressable style={styles.saveFab} onPress={handleToggleSave}>
                    <Image
                        source={savedToWatch ? saveAssets.save : saveAssets.unsave}
                        style={styles.saveFabIcon}
                        resizeMode="contain"
                    />
                </Pressable>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#000000',
    },
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    contentContainer: {
        paddingBottom: 60,
    },
    inner: {
        paddingTop: 52,
        paddingHorizontal: 24,
        alignItems: 'center',
    },
    backButton: {
        alignSelf: 'flex-start',
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: '#1C1C1E',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
    },
    title: {
        color: '#FFFFFF',
        fontSize: 18,
        lineHeight: 28,
        textAlign: 'center',
        marginBottom: 20,
        paddingHorizontal: 18,
        alignSelf: 'center',
    },
    poster: {
        width: 200,
        height: 300,
        borderRadius: 22,
        backgroundColor: '#1A1A1A',
        marginBottom: 16,
        alignSelf: 'center',
    },
    scoreText: {
        fontSize: 12,
        textAlign: 'center',
        marginBottom: 16,
        alignSelf: 'center',
    },
    scoreValue: {
        fontWeight: '700',
    },
    genreRow: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        flexWrap: 'wrap',
        marginBottom: 14,
    },
    genreChip: {
        backgroundColor: '#242424',
        borderRadius: 999,
        minWidth: 92,
        height: 36,
        paddingHorizontal: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 6,
        marginBottom: 8,
    },
    genreText: {
        color: '#FFFFFF',
        fontSize: 12,
        textAlign: 'center',
    },
    keywordText: {
        color: '#FFFFFF',
        fontSize: 12,
        textAlign: 'center',
        marginBottom: 24,
        alignSelf: 'center',
        width: '100%',
    },
    starRow: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 34,
    },
    starPressable: {
        width: STAR_SIZE,
        height: STAR_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 3,
    },
    star: {
        width: STAR_SIZE,
        height: STAR_SIZE,
        resizeMode: 'contain',
    },
    sectionTitle: {
        color: '#FFFFFF',
        fontSize: 24,
        fontWeight: '800',
        textAlign: 'center',
        marginBottom: 14,
        marginTop: 8,
        alignSelf: 'center',
        width: '100%',
    },
    bodyText: {
        color: '#F0F0F0',
        fontSize: 13,
        lineHeight: 22,
        textAlign: 'center',
        marginBottom: 38,
        paddingHorizontal: 8,
        alignSelf: 'center',
        width: '100%',
    },
    saveFab: {
        position: 'absolute',
        right: 25,
        bottom: 32,
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#050505',
        borderWidth: 2,
        borderColor: '#1F1F1F',
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveFabIcon: {
        width: 38,
        height: 38,
    },
});