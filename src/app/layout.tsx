import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Reader",
  description: "Read PDFs and EPUBs with AI assistance.",
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
