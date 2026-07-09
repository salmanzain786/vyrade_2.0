import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata = {
  title: 'Vyrade — Automation Blueprint',
  description: 'Describe an automation. Vyrade drafts the blueprint.',
  // The node mark, not the full lockup — the wordmark is illegible at 16px.
  icons: { icon: '/vyrade-mark.svg' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${plexMono.variable} ${plexSans.variable}`} suppressHydrationWarning>
      <body className="h-full overflow-hidden">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
