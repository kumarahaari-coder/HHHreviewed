import type { Metadata } from "next";
import { Assistant } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const assistant = Assistant({
  variable: "--font-assistant",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HHH Partner Booking and Payout Dashboard",
  description: "Centralized partner tracking and payment portal for Hidden Honey Homes retreats.",
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
        className={`${assistant.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col bg-brand-bg text-brand-text">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
