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
import { getUserRating, saveUserRatingAndRefreshPredictions } from '../db/database';

const emptyStar = require('../assets/images/icons/emptyStar.png');
const halfStar = require('../assets/images/icons/defaultHalf.png');
const fullStar = require('../assets/images/icons/defaultStar.png');

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
        avg_rating?: number;
        predicted_rating?: number;
        rating_count?: number;
        poster_url: string;
    };
};

const STAR_SIZE = 52;

export default function MovieDetail({ movie }: MovieDetailProps) {
    const [selectedRating, setSelectedRating] = useState<number | null>(null);
    const [savedRating, setSavedRating] = useState<number | null>(null);

    useEffect(() => {
        const loadSavedRating = async () => {
            try {
                const rating = await getUserRating(movie.movie_id);
                setSavedRating(rating);
                setSelectedRating(rating);
            } catch (error) {
                console.error('Failed to load saved rating:', error);
            }
        };

        loadSavedRating();
    }, [movie.movie_id]);

    const genreList = movie.genres
        ? movie.genres.split(',').map((genre) => genre.trim()).filter(Boolean).slice(0, 3)
        : [];

    const keywordList = movie.keywords
        ? movie.keywords.split(',').map((keyword) => keyword.trim()).filter(Boolean).slice(0, 3)
        : [];

    const hasPredictedRating =
        movie.predicted_rating !== undefined && movie.predicted_rating !== null;

    const displayRating =
        selectedRating !== null
            ? selectedRating
            : savedRating !== null
                ? savedRating
                : movie.predicted_rating ?? 0;

    const handlePressStar = async (index: number, event: GestureResponderEvent) => {
        try {
            const { locationX } = event.nativeEvent;
            const isHalf = locationX < STAR_SIZE / 2;
            const nextRating = isHalf ? index + 0.5 : index + 1;

            setSelectedRating(nextRating);
            setSavedRating(nextRating);

            await saveUserRatingAndRefreshPredictions(movie.movie_id, nextRating);
        } catch (error) {
            console.error('Failed to save rating:', error);
        }
    };

    const renderStar = (index: number) => {
        const starValue = index + 1;

        let source = emptyStar;

        if (displayRating >= starValue) {
            source = fullStar;
        } else if (displayRating >= starValue - 0.5) {
            source = halfStar;
        }

        return (
            <Pressable
                key={index}
                onPress={(event) => handlePressStar(index, event)}
                style={styles.starPressable}
            >
                <Image source={source} style={styles.star} />
            </Pressable>
        );
    };

    return (
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

                {hasPredictedRating && savedRating === null && (
                    <Text style={styles.predictedText}>
                        predicted{' '}
                        <Text style={styles.predictedValue}>
                            ★ {movie.predicted_rating!.toFixed(1)}
                        </Text>
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
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    contentContainer: {
        paddingBottom: 40,
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
        marginBottom: 24,
        paddingHorizontal: 18,
        alignSelf: 'center',
    },
    poster: {
        width: 300,
        height: 420,
        borderRadius: 22,
        backgroundColor: '#1A1A1A',
        marginBottom: 22,
        alignSelf: 'center',
    },
    predictedText: {
        color: '#CFCFCF',
        fontSize: 12,
        textAlign: 'center',
        marginBottom: 16,
        alignSelf: 'center',
    },
    predictedValue: {
        color: '#FFFFFF',
        fontWeight: '600',
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
        minWidth: 116,
        height: 38,
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
});