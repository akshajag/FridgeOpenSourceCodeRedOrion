"use client";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader, PanelBody } from "@/components/shared/panel";
type Account = {
  points: number;
  leaderboard: {
    user_id: string;
    username: string;
    points: number;
    pickups: number;
  }[];
};
type Pass = {
  code: string;
  username: string;
  expires_at: string;
  mission_title: string | null;
  points_on_verified_pickup: number;
};
export function MissionPickup({
  leaderboardOnly = false,
}: {
  leaderboardOnly?: boolean;
}) {
  const [pass, setPass] = useState<Pass | null>(null);
  const stats = useQuery<Account>({
    queryKey: ["mission-pickup-points"],
    queryFn: async () => {
      const r = await fetch("/api/pickups", { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      return b;
    },
    refetchInterval: 5000,
    retry: false,
  });
  const issue = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/pickups", { method: "POST" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      return b as Pass;
    },
    onSuccess: setPass,
  });
  return (
    <Panel>
      <PanelHeader
        title={
          leaderboardOnly
            ? "Verified mission pickup leaderboard"
            : "Fridge pickup authorization"
        }
        description="Food-bank employees and signed-in volunteers only. Camera-verified pickup points are separate from delivery completion and SOL rewards."
      />
      <PanelBody className="space-y-4">
        {stats.error && (
          <p className="text-sm text-muted-foreground" role="alert">
            {stats.error.message}
          </p>
        )}
        {stats.data && (
          <p className="text-sm">
            Your mission pickup points: <strong>{stats.data.points}</strong>
          </p>
        )}
        {!leaderboardOnly && (
          <>
            <p className="text-sm text-muted-foreground">
              Start a chilled-food transfer mission, tell Nourish your username
              and the six-digit code, then follow its pickup instructions.
              Volunteers receive 10 points once the shelf camera verifies
              removal. Employees record collections without points.
            </p>
            <Button
              disabled={issue.isPending || !!stats.error}
              onClick={() => issue.mutate()}
            >
              {issue.isPending
                ? "Creating code…"
                : "Start transfer / get pickup code"}
            </Button>
            {issue.error && (
              <p role="alert" className="text-sm text-critical">
                {issue.error.message}
              </p>
            )}
            {pass && (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <p>
                  Username: <strong>{pass.username}</strong>
                </p>
                <p
                  className="readout text-3xl tracking-widest"
                  aria-label={`Pickup code ${pass.code}`}
                >
                  {pass.code}
                </p>
                <p className="text-xs text-muted-foreground">
                  Expires at {new Date(pass.expires_at).toLocaleTimeString()}.
                  One verified pickup per code.{" "}
                  {pass.mission_title ?? "Employee collection"}.
                </p>
              </div>
            )}
          </>
        )}
        {stats.data && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Mission pickup leaders</h3>
            {stats.data.leaderboard.length ? (
              stats.data.leaderboard.map((r, i) => (
                <div
                  key={r.user_id}
                  className="flex justify-between rounded-lg border p-3 text-sm"
                >
                  <span>
                    {i + 1}. {r.username}
                  </span>
                  <span>
                    {r.points} points · {r.pickups} pickups
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No verified mission pickups yet.
              </p>
            )}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
