import React, { memo } from "react";
import { StyleSheet, View, ViewStyle, StyleProp, ImageStyle } from "react-native";
import { Image, ImageProps, ImageContentFit } from "expo-image";
import { Colors } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

const blurhash = "L6PZfSi_.AyE_3t7t7R**0o#DgR4";

interface OptimizedImageProps {
  source: ImageProps["source"];
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  placeholder?: string;
  transition?: number;
  priority?: "low" | "normal" | "high";
  cachePolicy?: "none" | "disk" | "memory" | "memory-disk";
  recyclingKey?: string;
}

function OptimizedImageComponent({
  source,
  style,
  contentFit = "cover",
  placeholder = blurhash,
  transition = 200,
  priority = "normal",
  cachePolicy = "memory-disk",
  recyclingKey,
}: OptimizedImageProps) {
  return (
    <Image
      source={source}
      style={style}
      contentFit={contentFit}
      placeholder={placeholder}
      placeholderContentFit="cover"
      transition={transition}
      priority={priority}
      cachePolicy={cachePolicy}
      recyclingKey={recyclingKey}
    />
  );
}

export const OptimizedImage = memo(OptimizedImageComponent);

interface AvatarProps {
  source?: ImageProps["source"] | null;
  size?: number;
  name?: string;
  style?: StyleProp<ImageStyle>;
}

function AvatarComponent({ source, size = 40, name = "?", style }: AvatarProps) {
  const initials = name.charAt(0).toUpperCase();
  
  if (!source) {
    return (
      <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }, style]}>
        <View style={[styles.avatarInitials, { width: size, height: size, borderRadius: size / 2 }]}>
          <View style={styles.avatarTextContainer}>
            <Image
              source={{ uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=1a1a1a&color=00E5CC&size=128` }}
              style={{ width: size, height: size, borderRadius: size / 2 }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={100}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <Image
      source={source}
      style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
      contentFit="cover"
      placeholder={blurhash}
      transition={150}
      cachePolicy="memory-disk"
    />
  );
}

export const OptimizedAvatar = memo(AvatarComponent);

const styles = makeReactiveStyles(() => StyleSheet.create({
  avatarFallback: {
    backgroundColor: Colors.dark.backgroundSecondary,
    overflow: "hidden",
  },
  avatarInitials: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
  },
  avatarTextContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
}));
