import nextConfig from "eslint-config-next/core-web-vitals";

const config = [{ ignores: ["dist/"] }, ...nextConfig];

export default config;

