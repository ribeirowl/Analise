import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import Header from "@/components/Header";
import Disclaimer from "@/components/Disclaimer";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Análise Futebol | Estatísticas e Odds",
  description: "Análise estatística de futebol com odds em tempo real. Identificação de apostas com valor baseada em dados.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body className={`${inter.className} min-h-screen bg-background`}>
        <Providers>
          <Header />
          <main className="container mx-auto max-w-7xl px-4 py-6">{children}</main>
          <Disclaimer />
        </Providers>
      </body>
    </html>
  );
}
