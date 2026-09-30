import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: process.env.NEXT_PUBLIC_APP_NAME || "Restaurant Manager", short_name: (process.env.NEXT_PUBLIC_APP_NAME || "Restaurant").split(" ")[0], start_url: "/", display: "standalone",
    background_color: "#fdf8f2", theme_color: "#9a1c1f",
    icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }],
  };
}
