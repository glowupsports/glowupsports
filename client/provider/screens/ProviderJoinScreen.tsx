import React from "react";
import { View, StyleSheet } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { Colors } from "@/constants/theme";
import ProviderInviteRegistrationScreen from "@/provider/screens/ProviderInviteRegistrationScreen";

type RouteParams = {
  token: string;
};

export default function ProviderJoinScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { token } = (route.params as RouteParams) || {};

  const handleSuccess = () => {
    navigation.reset({ index: 0, routes: [{ name: "Provider" as never }] });
  };

  const handleCancel = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.reset({ index: 0, routes: [{ name: "Login" as never }] });
    }
  };

  return (
    <View style={styles.container}>
      <ProviderInviteRegistrationScreen
        token={token || ""}
        onSuccess={handleSuccess}
        onCancel={handleCancel}
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
