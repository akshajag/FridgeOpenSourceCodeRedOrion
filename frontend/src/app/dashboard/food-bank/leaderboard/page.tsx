import { CommunityBoard } from "@/components/community/community-board";
export const metadata = { title: "Community leaderboard · Nourish" };
export default function Page() {
  return <CommunityBoard leaderboardOnly />;
}
