import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { PausarBrilhoForaDaTela } from "@/components/pausar-brilho";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Ospinabiz | Dashboard",
  description: "Dashboard interno da Ospinabiz",
  robots: { index: false, follow: false },
};

const outfit = Outfit({
  variable: "--font-outfit",
  display: "swap",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${outfit.variable} font-sans antialiased overflow-x-clip`}>
        <div className="aurora-bg" aria-hidden>
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="blob blob-3" />
        </div>
        {children}
        <PausarBrilhoForaDaTela />
      </body>
    </html>
  );
}
