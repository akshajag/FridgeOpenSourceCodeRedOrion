import type { Role } from "@/types";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  MapPinned,
  Network,
  CalendarRange,
  Flag,
  Activity,
  Boxes,
  BellRing,
  Link2,
  ScanLine,
  Trophy,
  Coins,
  Compass,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Exact match for overview pages so they are not highlighted on nested routes. */
  exact?: boolean;
}

export const NAV: Record<
  Role,
  { title: string; home: string; items: NavItem[] }
> = {
  food_bank: {
    title: "Food bank",
    home: "/dashboard/food-bank",
    items: [
      {
        href: "/dashboard/food-bank",
        label: "Overview",
        icon: LayoutDashboard,
        exact: true,
      },
      {
        href: "/dashboard/food-bank/community",
        label: "Community map",
        icon: MapPinned,
      },
      {
        href: "/dashboard/food-bank/leaderboard",
        label: "Impact leaderboard",
        icon: Trophy,
      },
      {
        href: "/dashboard/food-bank/nearby",
        label: "Nearby fridges",
        icon: MapPinned,
      },
      { href: "/dashboard/food-bank/network", label: "Network", icon: Network },
      {
        href: "/dashboard/food-bank/inventory",
        label: "Inside the fridges",
        icon: Boxes,
      },
      {
        href: "/dashboard/food-bank/missions",
        label: "Rescue missions",
        icon: Flag,
      },
      {
        href: "/dashboard/food-bank/events",
        label: "Community events",
        icon: CalendarRange,
      },
      { href: "/dashboard/food-bank/rewards", label: "Rewards", icon: Coins },
    ],
  },
  operator: {
    title: "Fridge operator",
    home: "/dashboard/operator",
    items: [
      {
        href: "/dashboard/operator",
        label: "Overview",
        icon: LayoutDashboard,
        exact: true,
      },
      {
        href: "/dashboard/operator/community",
        label: "Community map",
        icon: MapPinned,
      },
      {
        href: "/dashboard/operator/leaderboard",
        label: "Impact leaderboard",
        icon: Trophy,
      },
      {
        href: "/dashboard/operator/monitoring",
        label: "Live monitoring",
        icon: Activity,
      },
      {
        href: "/dashboard/operator/inventory",
        label: "Inventory",
        icon: Boxes,
      },
      {
        href: "/dashboard/operator/scan",
        label: "Camera scan",
        icon: ScanLine,
      },
      { href: "/dashboard/operator/alerts", label: "Alerts", icon: BellRing },
      {
        href: "/dashboard/operator/connections",
        label: "Connected food banks",
        icon: Link2,
      },
    ],
  },
  donor: {
    title: "Donor",
    home: "/dashboard/donor",
    items: [
      {
        href: "/dashboard/donor",
        label: "Overview",
        icon: LayoutDashboard,
        exact: true,
      },
      { href: "/dashboard/donor/find", label: "Community map", icon: Compass },
      { href: "/dashboard/donor/inventory", label: "Inside the fridges", icon: Boxes },
      { href: "/dashboard/donor/missions", label: "Missions", icon: Flag },
      {
        href: "/dashboard/donor/leaderboard",
        label: "Impact leaderboard",
        icon: Trophy,
      },
      { href: "/dashboard/donor/rewards", label: "Rewards", icon: Coins },
    ],
  },
};

export function roleFromPath(pathname: string): Role | null {
  if (pathname.startsWith("/dashboard/food-bank")) return "food_bank";
  if (pathname.startsWith("/dashboard/operator")) return "operator";
  if (pathname.startsWith("/dashboard/donor")) return "donor";
  return null;
}
