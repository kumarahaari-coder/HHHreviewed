import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "HHH — Hidden Honey Homes Operational Platform",
  description: "Centralized partner tracking, reservation attribution, and payout portal for Hidden Honey Homes retreats.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className="h-full antialiased font-sans"
      >
        <body className="min-h-full flex flex-col bg-canvas text-primary">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
