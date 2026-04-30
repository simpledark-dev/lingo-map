import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistrar } from "../ui/ServiceWorkerRegistrar";
import { ErrorOverlay } from "../ui/ErrorOverlay";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
