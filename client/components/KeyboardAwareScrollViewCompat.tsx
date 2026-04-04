import { Platform, ScrollView, ScrollViewProps } from "react-native";

type Props = ScrollViewProps & {
  keyboardShouldPersistTaps?: "always" | "never" | "handled";
  [key: string]: any;
};

// On web, react-native-keyboard-controller's NativeEventEmitter is unavailable
// and causes a 6000ms timeout crash. Only load the native module on iOS/Android.
let KeyboardAwareScrollViewNative: React.ComponentType<any> | null = null;
if (Platform.OS !== "web") {
  KeyboardAwareScrollViewNative =
    require("react-native-keyboard-controller").KeyboardAwareScrollView;
}

/**
 * KeyboardAwareScrollView that falls back to ScrollView on web.
 * Use this for any screen containing text inputs.
 */
export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = "handled",
  ...props
}: Props) {
  if (Platform.OS === "web" || !KeyboardAwareScrollViewNative) {
    return (
      <ScrollView
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        {...props}
      >
        {children}
      </ScrollView>
    );
  }

  const KAScrollView = KeyboardAwareScrollViewNative;
  return (
    <KAScrollView
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      {...props}
    >
      {children}
    </KAScrollView>
  );
}
