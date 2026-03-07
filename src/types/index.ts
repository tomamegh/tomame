import { type LucideIcon } from "lucide-react"

export interface LinkItem {
  title: string
    url: string
    icon: LucideIcon
    isActive?: boolean
    items?: LinkItem[]
}