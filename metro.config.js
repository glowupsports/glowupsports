const { getDefaultConfig } = require('expo/metro-config');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => {
    return (req, res, next) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/auth')) {
        const proxy = createProxyMiddleware({
          target: 'http://localhost:5000',
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
  resolveRequest: (context, moduleName, platform) => {
    if (platform === 'web' && moduleName === 'react-native-pager-view') {
      return {
        filePath: path.resolve(__dirname, 'client/shims/react-native-pager-view.web.tsx'),
        type: 'sourceFile',
      };
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
