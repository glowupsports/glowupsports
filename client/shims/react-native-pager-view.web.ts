import React, { forwardRef, useState, useImperativeHandle, useEffect } from "react";
import { View, StyleSheet, ViewStyle } from "react-native";

interface PagerViewProps {
  style?: ViewStyle;
  initialPage?: number;
  onPageSelected?: (e: { nativeEvent: { position: number } }) => void;
  onPageScroll?: (e: { nativeEvent: { position: number; offset: number } }) => void;
  children?: React.ReactNode;
  overdrag?: boolean;
  overScrollMode?: string;
}

interface PagerViewRef {
  setPage: (page: number) => void;
  setPageWithoutAnimation: (page: number) => void;
}

const PagerView = forwardRef<PagerViewRef, PagerViewProps>(
  ({ style, initialPage = 0, onPageSelected, onPageScroll, children }, ref) => {
    const [currentPage, setCurrentPage] = useState(initialPage);
    const childrenArray = React.Children.toArray(children);

    useImperativeHandle(ref, () => ({
      setPage: (page: number) => {
        if (page >= 0 && page < childrenArray.length) {
          setCurrentPage(page);
        }
      },
      setPageWithoutAnimation: (page: number) => {
        if (page >= 0 && page < childrenArray.length) {
          setCurrentPage(page);
        }
      },
    }));

    useEffect(() => {
      if (onPageSelected) {
        onPageSelected({ nativeEvent: { position: currentPage } });
      }
      if (onPageScroll) {
        onPageScroll({ nativeEvent: { position: currentPage, offset: 0 } });
      }
    }, [currentPage]);

    return (
      <View style={[styles.container, style]}>
        {childrenArray[currentPage]}
      </View>
    );
  }
);

PagerView.displayName = "PagerView";

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default PagerView;
