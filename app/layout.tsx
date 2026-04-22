import type { Metadata } from "next";
import { Literata, Sora } from "next/font/google";

import "./globals.css";
import "@aws-amplify/ui-react/styles.css";
import { ConfigureAmplify } from "@/components/configure-amplify";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  weight: ["400", "500", "600", "700"],
});

const literata = Literata({
  subsets: ["latin"],
  variable: "--font-literata",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Mind Harbor Companion",
  description: "Professional mental wellness support interface powered by FastAPI and AI SDK.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sora.variable} ${literata.variable}`}>
      <body>
        <ConfigureAmplify />
        {children}
      </body>
    </html>
  );
}
