import type { Metadata, Viewport } from "next";
import { Geist, Roboto_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistrar } from "../ui/ServiceWorkerRegistrar";
import { ErrorOverlay } from "../ui/ErrorOverlay";

// Geist for sans, Roboto Mono for the in-game UI's JRPG-style
// monospace. Vietnamese needs the `vietnamese` subset on both —
// Geist Mono (the original choice for monospace) doesn't ship
// Vietnamese glyphs at all, so when Vietnamese characters
// rendered with it, the browser fell back to a generic mono
// and the diacritic stacking broke. Roboto Mono has full
// Vietnamese support and reads close enough to Geist Mono in
// the cozy-pixel-art context that the swap is invisible to
// English players. The CSS variable name stays
// `--font-geist-mono` for now to avoid touching every consumer
// site; future cleanup could rename to `--font-mono`.
const geistSans = Geist({
  variable: "--font-geist-sans",
  // Geist on Next.js doesn't ship a `vietnamese` subset, but
  // `latin-ext` covers almost every common Vietnamese letter
  // (precomposed). The remaining handful of chars fall back to
  // the OS sans, which on every modern platform has full
  // Vietnamese — visible mismatch is rare and minor. The
  // monospace font (Roboto Mono) handles the heavier Vietnamese
  // load since it's used for the cutscene + dialogue text.
  subsets: ["latin", "latin-ext"],
});

const geistMono = Roboto_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext", "vietnamese"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#1a1a2e",
};

export const metadata: Metadata = {
  title: "Lingo Map",
  description: "A cozy 2.5D pixel-art exploration game",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Lingo Map",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-black">
        {/* Pre-React error catcher — runs before any framework code so a
            syntax error or top-level throw in the bundle still shows
            something to the user instead of a black screen. Writes
            into a plain DOM node that React doesn't touch. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  function s(){var d=document.getElementById('boot-err');if(d)return d;d=document.createElement('div');d.id='boot-err';d.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(20,0,0,0.95);color:#ffb4b4;font:11px/1.4 monospace;padding:14px;overflow:auto;white-space:pre-wrap;word-break:break-word;-webkit-user-select:text;user-select:text';d.innerHTML='<div style=\\"font-size:14px;margin-bottom:8px;color:#ffeaea\\">Boot error</div>';document.body.appendChild(d);return d;}
  function add(m){var d=s();var p=document.createElement('div');p.style.cssText='margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid rgba(255,180,180,.2)';p.textContent=m;d.appendChild(p);}
  window.addEventListener('error',function(e){add('Error: '+e.message+(e.filename?(' @ '+e.filename+':'+e.lineno+':'+e.colno):''));});
  window.addEventListener('unhandledrejection',function(e){var r=e.reason;add('Unhandled: '+(r&&r.message?r.name+': '+r.message+'\\n'+(r.stack||''):String(r)));});
})();`,
          }}
        />
        {children}
        <ServiceWorkerRegistrar />
        <ErrorOverlay />
      </body>
    </html>
  );
}
