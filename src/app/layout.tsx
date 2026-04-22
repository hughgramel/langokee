import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Single UI family (Plus Jakarta Sans) for every hierarchy level — matches
// the LangoBee design-overhaul spec. next/font self-hosts the family and
// exposes it as a CSS variable that `--font-ui` (in globals.css) resolves.
const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "langokee",
  description:
    "Open-source karaoke-style YouTube player for language learners. Transcribe with Whisper, clip moments, export Anki cards.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={plusJakarta.variable}>
      <body>{children}</body>
    </html>
  );
}
