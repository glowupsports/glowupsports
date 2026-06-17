const { createProxyMiddleware } = require("http-proxy-middleware");
const path = require("path");
const fs = require("fs");
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { getDefaultConfig } = require("expo/metro-config");

// react-native-health and react-native-health-connect are native-only packages
// that require a custom dev build (not available in Expo Go). If they are not
// installed in node_modules, Metro cannot resolve them even inside a guarded
// dynamic import — this crashes the iOS/Android bundle request from Expo Go.
// Detect their absence once at config-load time and shim them unconditionally
// when missing. A real native dev build that installs them will find them in
// node_modules and skip the shim.
const healthInstalled = fs.existsSync(
  path.resolve(__dirname, "node_modules/react-native-health"),
);
const healthConnectInstalled = fs.existsSync(
  path.resolve(__dirname, "node_modules/react-native-health-connect"),
);

// During static/production builds (--no-dev), skip Sentry's source map
// serializer. It processes all 2400+ modules single-threaded and adds
// several minutes of overhead. Expo Go static deployments never upload
// source maps to Sentry anyway, so the work is wasted.
// In the Replit dev container (REPLIT_DEV_DOMAIN is set), skip Sentry to
// reduce cold-start bundle time by ~8 minutes.
const isStaticBuild = process.argv.includes("--no-dev");
const isReplitDev = !!process.env.REPLIT_DEV_DOMAIN;
const config = (isStaticBuild || isReplitDev)
  ? getDefaultConfig(__dirname)
  : getSentryExpoConfig(__dirname);

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      if (req.url.startsWith("/api") || req.url.startsWith("/auth")) {
        const proxy = createProxyMiddleware({
          target: "http://localhost:5000",
          changeOrigin: true,
        });
        return proxy(req, res, next);
      }
      return middleware(req, res, next);
    };
  },
};

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const existingBlockList = Array.isArray(config.resolver?.blockList)
  ? config.resolver.blockList
  : config.resolver?.blockList
    ? [config.resolver.blockList]
    : [];

config.resolver = {
  ...config.resolver,
  blockList: [
    ...existingBlockList,
    new RegExp(`${escapeRegex(path.resolve(__dirname, ".local"))}.*`),
    new RegExp(`${escapeRegex(path.resolve(__dirname, ".git"))}.*`),
    new RegExp(`${escapeRegex(path.resolve(__dirname, "scripts"))}.*`),
  ],
  resolveRequest: (context, moduleName, platform) => {
    if (platform === "web" && moduleName === "react-native-purchases") {
      return {
        filePath: path.resolve(
          __dirname,
          "client/shims/react-native-purchases.web.ts",
        ),
        type: "sourceFile",
      };
    }
    if (platform === "web" && moduleName === "expo-notifications") {
      return {
        filePath: path.resolve(
          __dirname,
          "client/shims/expo-notifications.web.ts",
        ),
        type: "sourceFile",
      };
    }
    if (platform === "web" && moduleName === "react-native-pager-view") {
      return {
        filePath: path.resolve(
          __dirname,
          "client/shims/react-native-pager-view.web.tsx",
        ),
        type: "sourceFile",
      };
    }
    if (platform === "web" && moduleName === "react-native-maps") {
      return {
        filePath: path.resolve(
          __dirname,
          "client/shims/react-native-maps.web.tsx",
        ),
        type: "sourceFile",
      };
    }
    if (!healthInstalled && moduleName === "react-native-health") {
      return {
        filePath: path.resolve(
          __dirname,
          "client/shims/react-native-health.web.ts",
        ),
        type: "sourceFile",
      };
    }
    if (!healthConnectInstalled && moduleName === "react-native-health-connect") {
      return {
        filePath: path.resolve(
          __dirname,
          "client/shims/react-native-health-connect.web.ts",
        ),
        type: "sourceFile",
      };
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

// Metro cache lives in /tmp by default, which is wiped on every Replit
// container restart. Point it to a workspace directory so it persists
// across sessions and cuts subsequent cold starts by ~5 minutes.
const { FileStore } = require("metro-cache");
config.cacheStores = [
  new FileStore({ root: path.resolve(__dirname, ".metro-cache") }),
];

module.exports = config;
