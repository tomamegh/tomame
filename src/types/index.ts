import { type LucideIcon } from "lucide-react"

export interface LinkItem {
  title: string
    url: string
    icon: LucideIcon
    isActive?: boolean
    items?: LinkItem[]
}

export type Testimonial = {
  quote: string;
  name: string;
  role: string;
  initials: string;
};