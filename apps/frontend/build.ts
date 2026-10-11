import tailwind from "bun-plugin-tailwind";
import { rm } from "node:fs/promises";
import path from "node:path";

// The API URL is baked into the bundle. Without it the site would call
// localhost, so CI builds (Cloudflare Pages, Netlify, ...) refuse to continue.
if (!process.env.BUN_PUBLIC_BACKEND_URL) {
  const message = "BUN_PUBLIC_BACKEND_URL is not set, so this build will call http://localhost:3001.";
  if (process.env.CI) {
    console.error(`${message} Set it to the API's public URL.`);
    process.exit(1);
  }
  console.warn(`Warning: ${message}`);
}

const outdir = path.join(process.cwd(), "dist");
await rm(outdir, { recursive: true, force: true });

const entrypoints = [...new Bun.Glob("src/**/*.html").scanSync()];

const result = await Bun.build({
  entrypoints,
  outdir,
  plugins: [tailwind],
  minify: true,
  target: "browser",
  sourcemap: "linked",
  // Absolute asset URLs: with relative ones, a deep link like /result/:id
  // requests /result/chunk.js and gets index.html back.
  publicPath: "/",
  env: "BUN_PUBLIC_*",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

for (const output of result.outputs) {
  console.log(` ${path.relative(process.cwd(), output.path)}  ${(output.size / 1024).toFixed(1)} KB`);
}
