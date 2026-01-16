import React from "react";
import { View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { StackActions } from "@react-navigation/native";
import { Colors, Backgrounds, GlowColors } from "@/constants/theme";
import PlayerBookingWizard from "@/player/components/PlayerBookingWizard";
import { useAuth } from "@/coach/context/AuthContext";

export default function LessonBookingScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();

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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
});
