/** Next.js configuration for LEO Portfolio OS. */
/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: '/blog/nigerian-freelancers-ai-10x', destination: '/blog/freelancers-ai-10x', permanent: true },
      { source: '/blog/leo-vs-chatgpt-nigeria', destination: '/blog/leo-vs-chatgpt', permanent: true },
    ];
  },
  images: { remotePatterns: [{ protocol: 'https', hostname: 'source.unsplash.com' }, { protocol: 'https', hostname: 'images.unsplash.com' }, { protocol: 'https', hostname: 'localhost' }] },
};
module.exports = nextConfig;
