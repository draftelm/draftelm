import type { Metadata } from "next";
import "./globals.css";
import { ProjectProvider } from "../state/ProjectContext";

export const metadata: Metadata = {
  title: "DRAFTELM",
  description: "Intelligent Design & Manufacturing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ProjectProvider>{children}</ProjectProvider>
      </body>
    </html>
  );
}
