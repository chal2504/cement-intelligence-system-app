import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cement Intelligence System · Edición semanal",
  description: "Dashboard semanal de inteligencia del sector cementero del Caribe para Argos PR y Domicem.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Cement Intel",
  },
};

export const viewport: Viewport = {
  themeColor: "#2a78d6",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
