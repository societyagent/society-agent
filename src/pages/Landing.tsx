import { ThemeProvider } from '@/lib/theme'
import { DarkLanding } from '@/landing/DarkLanding'

export default function Landing() {
  return <ThemeProvider><DarkLanding /></ThemeProvider>
}
