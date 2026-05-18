import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Colors } from "@/constants/theme";
import { BroadcastComposeSheet } from "@/admin/components/BroadcastComposeSheet";

export default function AdminBroadcastScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [visible] = useState(true);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <BroadcastComposeSheet
        visible={visible}
        onClose={() => navigation.goBack()}
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
