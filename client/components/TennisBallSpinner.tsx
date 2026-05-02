import React, { useEffect } from "react";
import { Image, StyleProp, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

const SIZE_MAP = {
  small: 28,
  large: 52,
};

interface TennisBallSpinnerProps {
  size?: "small" | "large";
  style?: StyleProp<ViewStyle>;
  color?: string;
}

export function TennisBallSpinner({
  size = "large",
  style,
}: TennisBallSpinnerProps) {
  const px = SIZE_MAP[size];
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 900, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: px,
          height: px,
          borderRadius: px / 2,
          overflow: "hidden",
        },
        animatedStyle,
        style,
      ]}
    >
      <Image
        source={require("../../assets/images/tennis-ball-spinner.png")}
        style={{ width: px, height: px }}
        resizeMode="cover"
      />
    </Animated.View>
  );
}

export default TennisBallSpinner;
