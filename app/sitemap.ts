import { MetadataRoute } from "next";

const BASE_URL = "https://pendura.me";
const locales = ["en", "pt"];

export default function sitemap(): MetadataRoute.Sitemap {
  return locales.map((locale) => ({
    url: `${BASE_URL}/${locale}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 1,
  }));
}
