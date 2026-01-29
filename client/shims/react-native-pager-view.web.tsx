import React, { forwardRef, useState, useImperativeHandle, useCallback } from "react";
import { View, StyleSheet } from "react-native";

const PagerView = forwardRef((props: any, ref: any) => {
  const { style, initialPage = 0, onPageSelected, onPageScroll, children } = props;
  const [currentPage, setCurrentPage] = useState(initialPage);
  const childrenArray = React.Children.toArray(children);

  const changePage = useCallback((page: number) => {
    if (page >= 0 && page < childrenArray.length) {
      setCurrentPage(page);
      if (onPageSelected) {
        onPageSelected({ nativeEvent: { position: page } });
      }
      if (onPageScroll) {
        onPageScroll({ nativeEvent: { position: page, offset: 0 } });
      }
    }
  }, [childrenArray.length, onPageSelected, onPageScroll]);

  useImperativeHandle(ref, () => ({
    setPage: changePage,
    setPageWithoutAnimation: changePage,
  }), [changePage]);

  return (
    <View style={[styles.container, style]}>
      {childrenArray[currentPage]}
    </View>
  );
});

PagerView.displayName = "PagerView";

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default PagerView;
