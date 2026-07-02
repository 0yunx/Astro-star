import type { SocialLinkId, SocialLinkItem } from "../types/social";

export const socialLinks: readonly SocialLinkItem[] = [
  {
    id: "mail",
    icon: "mail",
    name: "Mail",
    href: "w18736036475@gmail.com",
    handle: "w18736036475@gmail.com",
    enabled: true,
  },
  {
    id: "github",
    icon: "github",
    name: "GitHub",
    href: "https://github.com/0yunx",
    handle: "0yunx",
    enabled: true,
  },
  {
    id: "bilibili",
    icon: "bilibili",
    name: "Bilibili",
    href: "https://space.bilibili.com/1639097420",
    handle: "1639097420",
    enabled: true,
  },
  {
    id: "telegram",
    icon: "telegram",
    name: "Telegram",
    href: "https://t.me/your-name",
    handle: "your-name",
    enabled: false,
  },
] satisfies readonly SocialLinkItem[];

export const socialDisplay = {
  home: ["github", "mail"],
  about: ["mail", "github", "bilibili", "telegram"],
} as const satisfies Record<string, readonly SocialLinkId[]>;
