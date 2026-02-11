"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Moon } from "lucide-react";

export default function ReviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">EOD Review</h1>
        <p className="text-muted-foreground mt-1">
          End-of-day review and activation energy prep for tomorrow
        </p>
      </div>

      <Card className="bg-card border-border border-dashed">
        <CardContent className="py-16 text-center space-y-4">
          <div className="flex justify-center">
            <div className="p-3 rounded-full bg-slate-50">
              <Moon className="h-8 w-8 text-slate-500" />
            </div>
          </div>
          <div>
            <p className="text-lg font-medium text-foreground">
              EOD Review coming in Phase 4
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              This will include:
              <br />
              • Task completion summary
              <br />
              • Energy rating for the day
              <br />
              • Activation energy checklist (workspace clean? files ready?)
              <br />
              • Tomorrow&apos;s tentative plan preview
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
