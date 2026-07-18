import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "AI Engineering OS",
  description: "Protocol-driven software engineering system",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
