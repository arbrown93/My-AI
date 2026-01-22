import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Llama 3.1 70B Chat',
  description: 'Chat with Llama 3.1 70B running on Lambda Labs',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
