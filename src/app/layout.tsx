import type { Metadata } from 'next'
import { Roboto_Mono } from 'next/font/google'
import './globals.css'

const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-roboto-mono',
})

export const metadata: Metadata = {
  title: 'Modelling Framework',
  description: 'Electricity system unit commitment modelling tool',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`antialiased ${robotoMono.variable}`}>
        {children}
      </body>
    </html>
  )
}
