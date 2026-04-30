export type CatalogArtwork = {
  id: string;
  title: string;
  artist: string;
  imageUrl: string;
  widthCm: number;
  heightCm: number;
  aspectRatio: number; // widthCm / heightCm
};

export const CATALOG: CatalogArtwork[] = [
  {
    id: "starry-night",
    title: "The Starry Night",
    artist: "Vincent van Gogh",
    imageUrl: "/artworks/starry-night.jpg",
    widthCm: 92.1,
    heightCm: 73.7,
    aspectRatio: 1280 / 1014,
  },
  {
    id: "great-wave",
    title: "The Great Wave off Kanagawa",
    artist: "Katsushika Hokusai",
    imageUrl: "/artworks/great-wave.jpg",
    widthCm: 25.7,
    heightCm: 37.9,
    aspectRatio: 1280 / 860,
  },
  {
    id: "water-lilies",
    title: "Water Lilies",
    artist: "Claude Monet",
    imageUrl: "/artworks/water-lilies.jpg",
    widthCm: 89.5,
    heightCm: 92.5,
    aspectRatio: 1280 / 1230,
  },
  {
    id: "persistence-memory",
    title: "The Persistence of Memory",
    artist: "Salvador Dalí",
    imageUrl: "/artworks/persistence-memory.jpg",
    widthCm: 33,
    heightCm: 24,
    aspectRatio: 368 / 271,
  },
];
