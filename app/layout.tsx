import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Local Docs Chatbot",
  description: "A fully local documentation chatbot.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
