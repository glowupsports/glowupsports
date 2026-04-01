const { createProxyMiddleware } = require("http-proxy-middleware");
const path = require("path");
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { getDefaultConfig } = require("expo/metro-config");

// During static/production builds (--no-dev), skip Sentry's source map
// serializer. It processes all 2400+ modules single-threaded and adds
// several minutes of overhead. Expo Go static deployments never upload
// source maps to Sentry anyway, so the work is wasted.
// Dev builds (no --no-dev flag) keep the full Sentry config as normal.
const isStaticBuild = process.argv.includes("--no-dev");
const config = isStaticBuild
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

config.resolver = {
  ...config.resolver,
  blockList: [
    new RegExp(`${path.resolve(__dirname, ".local")}.*`),
    new RegExp(`${path.resolve(__dirname, ".git")}.*`),
    new RegExp(`${path.resolve(__dirname, "scripts")}.*`),
  ],
  resolveRequest: (context, moduleName, platform) => {
    if (platform === "web" && moduleName === "react-native-pager-view") {
      return {
        filePath: path.resolve(
          __dirname,
          "client/shims/react-native-pager-view.web.tsx",
        ),
        type: "sourceFile",
      };
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
