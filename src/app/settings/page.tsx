"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, MapPin, Globe, Loader2, Check } from "lucide-react";

/**
 * Get ALL valid IANA timezones from the browser, grouped by region.
 * Falls back to a manual list if the browser doesn't support it.
 */
function getAllTimezones(): { group: string; zones: string[] }[] {
  let allZones: string[];
  try {
    // Modern browsers support this (Chrome 93+, Firefox 93+, Safari 15.4+)
    allZones = (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf("timeZone");
  } catch {
    // Fallback for older browsers
    allZones = [
      "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
      "America/Anchorage", "America/Phoenix", "America/Toronto", "America/Vancouver",
      "America/Sao_Paulo", "America/Mexico_City", "America/Bogota", "America/Argentina/Buenos_Aires",
      "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid",
      "Europe/Rome", "Europe/Amsterdam", "Europe/Moscow", "Europe/Istanbul",
      "Asia/Dubai", "Asia/Kolkata", "Asia/Calcutta", "Asia/Shanghai", "Asia/Tokyo",
      "Asia/Singapore", "Asia/Hong_Kong", "Asia/Seoul", "Asia/Bangkok",
      "Pacific/Auckland", "Pacific/Fiji", "Australia/Sydney", "Australia/Melbourne",
      "Australia/Perth", "Africa/Cairo", "Africa/Lagos", "Africa/Johannesburg", "Africa/Nairobi",
    ];
  }

  // Group by region (first part of the timezone string)
  const groups: Record<string, string[]> = {};
  for (const tz of allZones) {
    const parts = tz.split("/");
    if (parts.length < 2) continue; // skip "UTC", "GMT", etc.
    const region = parts[0];
    if (!groups[region]) groups[region] = [];
    groups[region].push(tz);
  }

  // Sort regions in a nice order, then sort zones within each
  const regionOrder = ["America", "Europe", "Asia", "Pacific", "Australia", "Africa", "Atlantic", "Indian", "Antarctica"];
  const sorted = regionOrder
    .filter((r) => groups[r])
    .map((r) => ({ group: r, zones: groups[r].sort() }));

  // Add any remaining regions not in the order
  for (const [region, zones] of Object.entries(groups)) {
    if (!regionOrder.includes(region)) {
      sorted.push({ group: region, zones: zones.sort() });
    }
  }

  return sorted;
}

function formatTimezoneLabel(tz: string): string {
  // Get the city name from the timezone (last part after /)
  const parts = tz.split("/");
  const city = parts[parts.length - 1].replace(/_/g, " ");
  // If there are 3 parts (e.g. America/Indiana/Indianapolis), show the sub-region
  const subRegion = parts.length > 2 ? parts.slice(1).join(" / ").replace(/_/g, " ") : city;

  try {
    const now = new Date();
    const offset = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value || "";
    return `${subRegion} (${offset})`;
  } catch {
    return subRegion;
  }
}

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    wakeNotificationTime: "08:00",
    breakDuration: 15,
    eodReminderTime: "21:00",
    timezone: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [timezoneDetected, setTimezoneDetected] = useState(false);
  const [showTimezonePrompt, setShowTimezonePrompt] = useState(false);
  const [detectedTimezone, setDetectedTimezone] = useState("");

  // Get all available timezones (computed once)
  const timezoneOptions = useMemo(() => getAllTimezones(), []);

  // Load settings from DB on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();

        // Always detect browser timezone
        const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        setDetectedTimezone(browserTz);

        if (data && data.id) {
          // Settings exist in DB — load them
          setSettings({
            wakeNotificationTime: data.wakeNotificationTime || "08:00",
            breakDuration: data.breakDuration || 15,
            eodReminderTime: data.eodReminderTime || "21:00",
            timezone: data.timezone || browserTz,
          });

          // If DB timezone differs from browser timezone, prompt user
          // This catches the case where DB has the schema default (America/New_York)
          // but the user is actually somewhere else
          if (data.timezone && data.timezone !== browserTz) {
            setShowTimezonePrompt(true);
          } else {
            setTimezoneDetected(true);
          }
        } else {
          // No settings saved yet — auto-detect timezone
          setShowTimezonePrompt(true);
          setSettings((s) => ({ ...s, timezone: browserTz }));
        }
      } catch (error) {
        console.error("Error loading settings:", error);
        const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        setDetectedTimezone(browserTz);
        setSettings((s) => ({ ...s, timezone: browserTz }));
        setShowTimezonePrompt(true);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleAcceptTimezone = useCallback(async () => {
    setShowTimezonePrompt(false);
    setTimezoneDetected(true);
    setSettings((s) => ({ ...s, timezone: detectedTimezone }));
    // Auto-save the detected timezone immediately
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: detectedTimezone }),
      });
    } catch (error) {
      console.error("Error saving timezone:", error);
    }
  }, [detectedTimezone]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimezoneDetected(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Error saving settings:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-copper-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Configure your flow preferences</p>
      </div>

      {/* Timezone auto-detection prompt */}
      {showTimezonePrompt && (
        <Card className="bg-copper-50 border-copper-200">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-copper-100 rounded-lg">
                <MapPin className="h-5 w-5 text-copper-500" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="font-semibold text-copper-700">Timezone Detected</h3>
                  <p className="text-sm text-copper-600/80 mt-1">
                    Your browser says you&apos;re in <strong className="text-copper-700">{formatTimezoneLabel(detectedTimezone)}</strong>.
                    {settings.timezone && settings.timezone !== detectedTimezone && (
                      <> Your current setting is {formatTimezoneLabel(settings.timezone)}.</>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleAcceptTimezone}
                    size="sm"
                    className="bg-copper-500 hover:bg-copper-600 text-white"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Use {formatTimezoneLabel(detectedTimezone)}
                  </Button>
                  <Button
                    onClick={() => {
                      setShowTimezonePrompt(false);
                      setTimezoneDetected(true);
                    }}
                    size="sm"
                    variant="outline"
                    className="border-copper-300 text-copper-600 hover:bg-copper-50"
                  >
                    Keep Current
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-copper-500" />
            Timezone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Your timezone determines when notifications arrive and how your schedule is displayed.
          </p>
          <select
            value={settings.timezone}
            onChange={(e) =>
              setSettings((s) => ({ ...s, timezone: e.target.value }))
            }
            className="w-full bg-white border border-border text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-copper-400 focus:border-transparent"
          >
            {/* If the current timezone isn't in any group, show it at the top */}
            {settings.timezone &&
              !timezoneOptions.some((g) => g.zones.includes(settings.timezone)) && (
                <option value={settings.timezone}>
                  {formatTimezoneLabel(settings.timezone)} ← current
                </option>
              )}
            {timezoneOptions.map((group) => (
              <optgroup key={group.group} label={group.group}>
                {group.zones.map((tz) => (
                  <option key={tz} value={tz}>
                    {formatTimezoneLabel(tz)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {timezoneDetected && !showTimezonePrompt && (
            <p className="text-xs text-moss-500/70 flex items-center gap-1">
              <Check className="h-3 w-3" />
              Timezone set to {formatTimezoneLabel(settings.timezone)}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Morning Notification Time</Label>
              <Input
                type="time"
                value={settings.wakeNotificationTime}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    wakeNotificationTime: e.target.value,
                  }))
                }
                className="bg-white border-border text-foreground"
              />
              <p className="text-xs text-muted-foreground">
                When the &quot;Ready to flow?&quot; Telegram message arrives
              </p>
            </div>
            <div className="space-y-2">
              <Label>EOD Reminder Time</Label>
              <Input
                type="time"
                value={settings.eodReminderTime}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    eodReminderTime: e.target.value,
                  }))
                }
                className="bg-white border-border text-foreground"
              />
              <p className="text-xs text-muted-foreground">
                When the EOD review + activation prep reminder arrives
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Break Duration (minutes)</Label>
            <div className="flex items-center gap-2">
              {[10, 15, 20].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, breakDuration: mins }))}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                    settings.breakDuration === mins
                      ? "border-copper-400 bg-copper-50 text-copper-700"
                      : "border-border bg-white text-muted-foreground hover:border-copper-300"
                  }`}
                >
                  {mins} min
                </button>
              ))}
              <Input
                type="number"
                value={settings.breakDuration}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    breakDuration: Math.max(5, Math.min(60, parseInt(e.target.value) || 15)),
                  }))
                }
                className="bg-white border-border text-foreground w-20"
                min={5}
                max={60}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Telegram Bot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your Telegram bot is connected. Chat with it to manage tasks, generate plans, and get coaching.
          </p>
          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <p className="text-sm text-foreground">
              <strong>Quick tip:</strong> Just chat naturally with your bot — say things like
              &quot;add a new project called X&quot; or &quot;I want to work 4 hours today&quot;.
              No special commands needed!
            </p>
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={handleSave}
        disabled={saving}
        className="bg-copper-500 hover:bg-copper-600 text-white"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Save className="h-4 w-4 mr-2" />
        )}
        {saved ? "Saved!" : saving ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
