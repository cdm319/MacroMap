import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import './recipes.css';

export const metadata: Metadata = {
  description: 'Weekly meal planning around individual macro targets',
  title: 'MacroMap',
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
