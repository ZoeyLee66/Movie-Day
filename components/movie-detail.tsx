import { useState } from 'react';
import { View, Text, Image, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import StarRating from './star-rating';

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

export default function MovieDetail({ movie }: MovieDetailProps) {
    const [selectedRating, setSelectedRating] = useState<number | null>(null);

    const genreList = movie.genres
        ? movie.genres
            .split(',')
            .map((genre) => genre.trim())
            .filter(Boolean)
            .slice(0, 3)
        : [];

    const keywordList = movie.keywords
        ? movie.keywords
            .split(',')
            .map((keyword) => keyword.trim())
            .filter(Boolean)
            .slice(0, 3)
        : [];

    const hasPredictedRating =
        movie.predicted_rating !== undefined && movie.predicted_rating !== null;

    const displayRating =
        selectedRating !== null ? selectedRating : movie.predicted_rating ?? 0;

    return (
        <ScrollView
            className="flex-1 bg-black"
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
        >
            <View className="px-7 pt-14">
                <Pressable
                    onPress={() => router.back()}
                    className="w-8 h-8 rounded-full bg-[#1A1A1A] items-center justify-center mb-4"
                >
                    <Ionicons name="chevron-back" size={18} color="white" />
                </Pressable>

                <Text className="text-white text-[18px] text-center leading-6 mb-6">
                    {movie.title}
                </Text>

                <Image
                    source={{ uri: movie.poster_url }}
                    resizeMode="cover"
                    className="w-[160px] h-[240px] self-center rounded-[18px] bg-[#1A1A1A] mb-4"
                />

                <Text className="text-white text-[13px] font-semibold text-center mb-1">
                    release: {movie.release_year}
                </Text>

                {hasPredictedRating && (
                    <Text className="text-[#CFCFCF] text-[11px] text-center mb-4">
                        predicted{' '}
                        <Text className="text-white">
                            ★ {movie.predicted_rating!.toFixed(1)}
                        </Text>
                    </Text>
                )}

                <View className="flex-row flex-wrap justify-center mb-3">
                    {genreList.map((genre, index) => (
                        <View
                            key={`${genre}-${index}`}
                            className="bg-[#242424] px-4 py-2 rounded-full mx-1 mb-2"
                        >
                            <Text className="text-white text-[12px]">{genre}</Text>
                        </View>
                    ))}
                </View>

                {keywordList.length > 0 && (
                    <Text className="text-white text-[12px] text-center mb-5">
                        {keywordList.map((keyword) => `# ${keyword}`).join('   ')}
                    </Text>
                )}

                <View className="mb-2">
                    <StarRating
                        rating={displayRating}
                        onChange={setSelectedRating}
                        size={36}
                    />
                </View>

                {selectedRating !== null && (
                    <Text className="text-white text-[13px] text-center mb-8">
                        Your rating: {selectedRating.toFixed(1)}
                    </Text>
                )}

                <Text className="text-white text-[18px] font-bold text-center mb-3">
                    OVERVIEW
                </Text>

                <Text className="text-[#E3E3E3] text-[13px] leading-5 text-center mb-8">
                    {movie.overview || 'No overview available.'}
                </Text>

                <Text className="text-white text-[18px] font-bold text-center mb-3">
                    DIRECTOR
                </Text>

                <Text className="text-[#E3E3E3] text-[13px] leading-5 text-center mb-8">
                    {movie.director || 'Unknown'}
                </Text>

                <Text className="text-white text-[18px] font-bold text-center mb-3">
                    CAST
                </Text>

                <Text className="text-[#E3E3E3] text-[13px] leading-5 text-center">
                    {movie.cast || 'Unknown'}
                </Text>
            </View>
        </ScrollView>
    );
}