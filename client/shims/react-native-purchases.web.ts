// Web shim for react-native-purchases.
// The real package's web implementation (@revenuecat/purchases-js) fires
// internal Promise.reject(nonError) calls during module evaluation which
// React Native Web escalates to an `unhandlederror` event that Replit's
// canvas detects as a crash. Subscriptions are not available on web anyway,
// so we replace the entire module with an inert no-op stub.

const PurchasesStub: any = null;
export default PurchasesStub;
