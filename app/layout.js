import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata = {
  title: 'Vyrade AI — Automation Blueprint',
  description: 'You know the goal. We know the workflow.',
  icons: { icon: '/vyrade-mark.svg' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before paint to avoid a flash (dark default). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme')||'dark';document.documentElement.classList.toggle('dark',t!=='light');}catch(e){document.documentElement.classList.add('dark');}`,
          }}
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-right" richColors closeButton theme="dark" />
        </ThemeProvider>
      </body>
    </html>
  );
}
