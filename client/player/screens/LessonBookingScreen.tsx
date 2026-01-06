import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Colors } from "@/constants/theme";
import PlayerBookingWizard from "@/player/components/PlayerBookingWizard";
import { useAuth } from "@/coach/context/AuthContext";

export default function LessonBookingScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  const handleClose = () => {
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <PlayerBookingWizard
        visible={true}
        onClose={handleClose}
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
