"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2, Zap, Clock, Flame, Brain } from "lucide-react";

export default function NewProjectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    deadline: "",
    priority: "medium",
    blockDurationMode: "120" as string,
    blockDuration: 120,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          deadline: form.deadline || null,
          priority: form.priority,
          blockDurationMode: form.blockDurationMode,
          blockDuration: form.blockDurationMode === "custom"
            ? form.blockDuration
            : form.blockDurationMode === "auto"
              ? 120
              : parseInt(form.blockDurationMode) || 120,
        }),
      });

      if (res.ok) {
        const project = await res.json();
        router.push(`/projects/${project.id}`);
      }
    } catch (error) {
      console.error("Error creating project:", error);
    } finally {
      setLoading(false);
    }
  };

  const blockDurationOptions = [
    { mode: "60", label: "60 min", desc: "Sprint", icon: Zap },
    { mode: "90", label: "90 min", desc: "Focused", icon: Clock },
    { mode: "120", label: "120 min", desc: "Deep Work", icon: Flame },
    { mode: "auto", label: "Auto", desc: "AI decides", icon: Brain },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <a
          href="/projects"
          className="text-neutral-400 hover:text-neutral-50 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </a>
        <div>
          <h1 className="text-3xl font-bold">New Project</h1>
          <p className="text-neutral-400 mt-1">
            Describe your goal. AI will break it into milestones and tasks.
          </p>
        </div>
      </div>

      <Card className="bg-neutral-900 border-neutral-800">
        <CardHeader>
          <CardTitle>Project Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">
                What&apos;s the goal? <span className="text-red-400">*</span>
              </Label>
              <Input
                id="title"
                placeholder="e.g., Launch my portfolio website by March 15"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                className="bg-neutral-800 border-neutral-700 text-neutral-50 placeholder:text-neutral-500"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">
                Describe it in more detail (optional but helps AI break it down
                better)
              </Label>
              <Textarea
                id="description"
                placeholder="e.g., I want to build a personal portfolio using Next.js with a blog section, project showcase, and contact form. I have intermediate web dev skills..."
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={4}
                className="bg-neutral-800 border-neutral-700 text-neutral-50 placeholder:text-neutral-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="deadline">Deadline (optional)</Label>
                <Input
                  id="deadline"
                  type="date"
                  value={form.deadline}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, deadline: e.target.value }))
                  }
                  className="bg-neutral-800 border-neutral-700 text-neutral-50"
                />
              </div>

              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(val) =>
                    setForm((f) => ({ ...f, priority: val }))
                  }
                >
                  <SelectTrigger className="bg-neutral-800 border-neutral-700 text-neutral-50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-neutral-800 border-neutral-700">
                    <SelectItem value="critical">🔴 Critical</SelectItem>
                    <SelectItem value="high">🟠 High</SelectItem>
                    <SelectItem value="medium">🟡 Medium</SelectItem>
                    <SelectItem value="low">🟢 Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Block Duration Selector */}
            <div className="space-y-3">
              <Label>Work Block Duration</Label>
              <p className="text-xs text-neutral-500">
                How long each focused work block should be for this project
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {blockDurationOptions.map(({ mode, label, desc, icon: Icon }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setForm((f) => ({
                        ...f,
                        blockDurationMode: mode,
                        blockDuration: mode === "auto" || mode === "custom"
                          ? f.blockDuration
                          : parseInt(mode),
                      }));
                    }}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all ${
                      form.blockDurationMode === mode
                        ? "border-orange-500 bg-orange-500/10 text-orange-300"
                        : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600"
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${form.blockDurationMode === mode ? "text-orange-400" : ""}`} />
                    <span className="font-semibold text-sm">{label}</span>
                    <span className="text-xs opacity-70">{desc}</span>
                  </button>
                ))}
              </div>
              {form.blockDurationMode === "auto" && (
                <p className="text-xs text-orange-300/70 flex items-center gap-1">
                  <Brain className="h-3 w-3" />
                  Starts at 120 min, then adapts based on your energy patterns, task sizes, and completion history.
                </p>
              )}
              {/* Custom entry option */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, blockDurationMode: "custom" }))}
                  className={`text-xs px-2 py-1 rounded border transition-all ${
                    form.blockDurationMode === "custom"
                      ? "border-orange-500 bg-orange-500/10 text-orange-300"
                      : "border-neutral-700 text-neutral-500 hover:border-neutral-600"
                  }`}
                >
                  Custom
                </button>
                {form.blockDurationMode === "custom" && (
                  <Input
                    type="number"
                    value={form.blockDuration}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        blockDuration: Math.max(15, Math.min(240, parseInt(e.target.value) || 120)),
                      }))
                    }
                    className="bg-neutral-800 border-neutral-700 text-neutral-50 w-24"
                    min={15}
                    max={240}
                  />
                )}
                {form.blockDurationMode === "custom" && (
                  <span className="text-xs text-neutral-500">minutes (15-240)</span>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                disabled={loading || !form.title.trim()}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Project"
                )}
              </Button>
              <a href="/projects">
                <Button
                  type="button"
                  variant="outline"
                  className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                >
                  Cancel
                </Button>
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
