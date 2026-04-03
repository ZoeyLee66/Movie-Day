import { Image, View, PanResponder } from 'react-native';
import { useMemo } from 'react';

const emptyStar = require('../assets/images/icons/emptyStar.png');
const halfStar = require('../assets/images/icons/defaultHalf.png');
const fullStar = require('../assets/images/icons/defaultStar.png');

type StarRatingProps = {
    rating: number;
    onChange: (rating: number) => void;
    size?: number;
};

export default function StarRating({
    rating,
    onChange,
    size = 34,
}: StarRatingProps) {
    const starCount = 5;
    const gap = 4;
    const totalWidth = starCount * size + (starCount - 1) * gap;

    const clamp = (value: number, min: number, max: number) =>
        Math.max(min, Math.min(max, value));

    const getRatingFromX = (x: number) => {
        const clampedX = clamp(x, 0, totalWidth);
        const unit = size + gap;
        const rawRating = clampedX / unit;

        const rounded = Math.ceil(rawRating * 2) / 2;
        return clamp(rounded, 0, 5);
    };

    const panResponder = useMemo(
        () =>
            PanResponder.create({
                onStartShouldSetPanResponder: () => true,
                onMoveShouldSetPanResponder: () => true,

                onPanResponderGrant: (event) => {
                    onChange(getRatingFromX(event.nativeEvent.locationX));
                },

                onPanResponderMove: (event) => {
                    onChange(getRatingFromX(event.nativeEvent.locationX));
                },
            }),
        [onChange]
    );

    const renderStar = (index: number) => {
        const starValue = index + 1;

        let source = emptyStar;

        if (rating >= starValue) {
            source = fullStar;
        } else if (rating >= starValue - 0.5) {
            source = halfStar;
        }

        return (
            <Image
                key={index}
                source={source}
                style={{
                    width: size,
                    height: size,
                    marginRight: index === starCount - 1 ? 0 : gap,
                    resizeMode: 'contain',
                }}
            />
        );
    };

    return (
        <View
            {...panResponder.panHandlers}
            style={{
                width: totalWidth,
                flexDirection: 'row',
                alignSelf: 'center',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            {[0, 1, 2, 3, 4].map(renderStar)}
        </View>
    );
}