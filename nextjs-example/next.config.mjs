/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    // @coinbase/cdp-sdk (pulled in by the Base Account connector) imports its
    // optional @x402/* peers, which this example never uses or installs.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@x402/core': false,
      '@x402/evm': false,
      '@x402/svm': false,
      '@x402/extensions': false,
    };
    return config;
  },
};

export default nextConfig;
