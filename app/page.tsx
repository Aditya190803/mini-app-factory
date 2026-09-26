import { HomeExperience } from '@/components/landing/home-experience'

/**
 * The home page.
 *
 * The composer is the page. Signed-in visitors get their recent work beside
 * it. Signed-out visitors get the same box, plus the proof of what it makes.
 * The layout lives in HomeExperience because it has to know who is looking.
 */
export default function HomePage() {
  return <HomeExperience />
}
