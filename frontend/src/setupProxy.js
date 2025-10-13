const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:10000',  // Your backend runs on port 10000
      changeOrigin: true,
    })
  );
};