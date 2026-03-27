import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pendura",
  description: "Place your artwork on any wall.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
