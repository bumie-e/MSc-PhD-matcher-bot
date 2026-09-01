// GitHub Pages serves this repo at /MSc-PhD-matcher-bot/, not the domain root.
const REPO_NAME = "MSc-PhD-matcher-bot";
const isProd = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath: isProd ? `/${REPO_NAME}` : "",
  assetPrefix: isProd ? `/${REPO_NAME}/` : "",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
