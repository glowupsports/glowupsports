import React, { useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
import { StackActions } from "@react-navigation/native";
import { Colors } from "@/constants/theme";
import PlayerBookingWizard from "@/player/components/PlayerBookingWizard";
import { useAuth } from "@/coach/context/AuthContext";
import { useTrackFeature } from "@/player/hooks/useTrackFeature";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
export default function LessonBookingScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const track = useTrackFeature();

  useFocusEffect(useCallback(() => { track("screen:lesson_booking"); }, [track]));
  const sport: string | undefined = route.params?.sport;

  const handleClose = () => {
    navigation.goBack();
  };

  const handleBookingSuccess = () => {
    navigation.dispatch(StackActions.replace("PlayerTraining"));
  };

  return (
    <View style={styles.container}>
      <PlayerBookingWizard
        visible={true}
        onClose={handleClose}
        onBookingSuccess={handleBookingSuccess}
        playerId={user?.playerId || undefined}
        sport={sport}
      />
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
}));
