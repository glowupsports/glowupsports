import React, { useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { useNavigation, useRoute, useFocusEffect , StackActions } from "@react-navigation/native";
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
  // Task #1037: A player tapping "Book a Lesson" from a public coach profile
  // navigates here with a preselected coachId (and optionally sessionId), so
  // the wizard can lock onto that coach — including coaches from another
  // academy — without forcing the player to re-pick from a list.
  const preselectedCoachId: string | undefined = route.params?.coachId;
  const preselectedSessionId: string | undefined = route.params?.sessionId;

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
        preselectedCoachId={preselectedCoachId}
        preselectedSessionId={preselectedSessionId}
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
