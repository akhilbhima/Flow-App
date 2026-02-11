"use client";

import { useEffect, useState, use } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Check,
  Clock,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Loader2,
  Zap,
  Flame,
  Brain,
  ExternalLink,
} from "lucide-react";
import type { Project, Milestone, Task } from "@/lib/db/schema";

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMilestones, setExpandedMilestones] = useState<Set<string>>(
    new Set()
  );
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState<Record<string, string>>({});
  const [newUngroupedTaskTitle, setNewUngroupedTaskTitle] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const fetchData = async () => {
    try {
      const [projRes, milestonesRes, tasksRes] = await Promise.all([
        fetch(`/api/projects/${id}`),
        fetch(`/api/milestones?projectId=${id}`),
        fetch(`/api/tasks?projectId=${id}`),
      ]);
      const proj = await projRes.json();
      const mils = await milestonesRes.json();
      const tsks = await tasksRes.json();
      setProject(proj);
      setMilestones(Array.isArray(mils) ? mils : []);
      setTasks(Array.isArray(tsks) ? tsks : []);
      // Auto-expand all milestones
      setExpandedMilestones(
        new Set((Array.isArray(mils) ? mils : []).map((m: Milestone) => m.id))
      );
    } catch (error) {
      console.error("Error fetching project data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const toggleMilestone = (milestoneId: string) => {
    setExpandedMilestones((prev) => {
      const next = new Set(prev);
      if (next.has(milestoneId)) {
        next.delete(milestoneId);
      } else {
        next.add(milestoneId);
      }
      return next;
    });
  };

  const addMilestone = async () => {
    if (!newMilestoneTitle.trim()) return;
    await fetch("/api/milestones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: id,
        title: newMilestoneTitle.trim(),
        sortOrder: milestones.length,
      }),
    });
    setNewMilestoneTitle("");
    fetchData();
  };

  const addTask = async (milestoneId: string | null) => {
    const title = milestoneId
      ? newTaskTitle[milestoneId]
      : newUngroupedTaskTitle;
    if (!title?.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: id,
        milestoneId,
        title: title.trim(),
        sortOrder: tasks.filter((t) => t.milestoneId === milestoneId).length,
      }),
    });
    if (milestoneId) {
      setNewTaskTitle((prev) => ({ ...prev, [milestoneId]: "" }));
    } else {
      setNewUngroupedTaskTitle("");
    }
    fetchData();
  };

  const toggleTaskStatus = async (task: Task) => {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchData();
  };

  const deleteTask = async (taskId: string) => {
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    fetchData();
  };

  const deleteMilestone = async (milestoneId: string) => {
    if (!confirm("Delete this milestone and all its tasks?")) return;
    await fetch(`/api/milestones/${milestoneId}`, { method: "DELETE" });
    fetchData();
  };

  const handleAiBreakdown = async () => {
    if (!project) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai/decompose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          title: project.title,
          description: project.description,
          deadline: project.deadline,
        }),
      });
      if (res.ok) {
        await fetchData();
      } else {
        const err = await res.json();
        alert(err.error || "AI breakdown failed. Check your API key.");
      }
    } catch {
      alert("AI breakdown failed. Make sure ANTHROPIC_API_KEY is set.");
    } finally {
      setAiLoading(false);
    }
  };

  const getTasksForMilestone = (milestoneId: string) =>
    tasks.filter((t) => t.milestoneId === milestoneId);

  const ungroupedTasks = tasks.filter((t) => !t.milestoneId);

  const priorityColor: Record<string, string> = {
    critical: "bg-rust-50 text-rust-500 border-rust-200",
    high: "bg-copper-50 text-copper-600 border-copper-200",
    medium: "bg-amber-50 text-amber-500 border-amber-200",
    low: "bg-moss-50 text-moss-500 border-moss-200",
  };

  if (loading) {
    return <div className="text-muted-foreground py-8 text-center">Loading...</div>;
  }

  if (!project) {
    return (
      <div className="text-muted-foreground py-8 text-center">
        Project not found.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <a
          href="/projects"
          className="text-muted-foreground hover:text-foreground transition-colors mt-1"
        >
          <ArrowLeft className="h-5 w-5" />
        </a>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{project.title}</h1>
            <Badge
              variant="outline"
              className={priorityColor[project.priority]}
            >
              {project.priority}
            </Badge>
          </div>
          {project.description && (
            <p className="text-muted-foreground mt-2">{project.description}</p>
          )}
          {project.deadline && (
            <p className="text-muted-foreground text-sm mt-1">
              <Clock className="h-3 w-3 inline mr-1" />
              Due: {new Date(project.deadline).toLocaleDateString()}
            </p>
          )}
          {(project as Project & { notionPageUrl?: string }).notionPageUrl && (
            <a
              href={(project as Project & { notionPageUrl?: string }).notionPageUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-copper-500 hover:text-copper-600 mt-2 transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6.017 4.313l55.333-4.087c6.797-.583 8.543-.19 12.817 2.917l17.663 12.443c2.913 2.14 3.883 2.723 3.883 5.053v68.243c0 4.277-1.553 6.807-6.99 7.193L24.467 99.967c-4.08.193-6.023-.39-8.16-3.113L3.3 79.94c-2.333-3.113-3.3-5.443-3.3-8.167V11.113c0-3.497 1.553-6.413 6.017-6.8z" fill="currentColor"/>
                <path d="M61.35.227l-55.333 4.087C1.57 4.7.017 7.617.017 11.113v60.66c0 2.723.967 5.053 3.3 8.167l12.993 16.913c2.137 2.723 4.08 3.307 8.16 3.113l64.257-3.89c5.433-.387 6.99-2.917 6.99-7.193V20.64c0-2.21-.81-2.93-3.303-4.757l-.58-.297-17.663-12.443C70.893.037 69.147-.357 62.35.227z" fill="currentColor"/>
                <path fillRule="evenodd" clipRule="evenodd" d="M28.89 19.217c-5.15.387-6.33.477-9.27-1.84l-6.6-5.063c-.78-.587-1.17-1.363-.39-1.75.78-.387 2.723-1.363 5.247-1.56l52.81-3.887c4.467-.39 5.437.583 4.27 1.553l-8.16 5.833c-1.17.78-1.94 1.17-4.08 1.363L28.89 19.217z" fill="white"/>
                <path fillRule="evenodd" clipRule="evenodd" d="M18.89 30.637v55.72c0 2.913 1.56 4.083 5.053 3.887l58.717-3.497c3.497-.193 3.887-2.333 3.887-4.86V26.943c0-2.53-.97-3.887-3.11-3.693l-61.44 3.693c-2.333.193-3.107 1.363-3.107 3.693z" fill="white"/>
                <path d="M69.77 33.403c.39 1.753 0 3.5-1.753 3.697l-2.917.58v43.133c-2.527 1.363-4.857 2.14-6.797 2.14-3.107 0-3.887-.973-6.213-3.887l-19.03-29.887v28.917l6.017 1.363s0 3.5-4.857 3.5l-13.38.78c-.39-.78 0-2.723 1.363-3.11l3.5-.973v-38.28l-4.86-.39c-.39-1.753.583-4.277 3.3-4.47l14.357-.97 19.807 30.47v-27.06l-5.053-.583c-.39-2.14 1.167-3.693 3.107-3.887l13.41-.78z" fill="currentColor"/>
              </svg>
              View in Notion
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {/* Block Duration Setting */}
      <Card className="bg-card border-border">
        <CardContent className="py-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">Work Block Duration</p>
              <span className="text-xs text-muted-foreground">
                {project.blockDurationMode === "auto"
                  ? "AI-Adaptive"
                  : project.blockDurationMode === "custom"
                    ? `${project.blockDuration} min (custom)`
                    : `${project.blockDurationMode} min`}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {[
                { mode: "60", label: "60m", icon: Zap },
                { mode: "90", label: "90m", icon: Clock },
                { mode: "120", label: "120m", icon: Flame },
                { mode: "auto", label: "Auto", icon: Brain },
              ].map(({ mode, label, icon: Icon }) => (
                <button
                  key={mode}
                  onClick={async () => {
                    const newDuration = mode === "auto" || mode === "custom" ? project.blockDuration : parseInt(mode);
                    await fetch(`/api/projects/${id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ blockDurationMode: mode, blockDuration: newDuration }),
                    });
                    fetchData();
                  }}
                  className={`flex flex-col items-center gap-1 py-2 px-1 rounded-md border text-xs transition-all ${
                    project.blockDurationMode === mode
                      ? "border-copper-400 bg-copper-50 text-copper-700"
                      : "border-border bg-white text-muted-foreground hover:border-copper-300"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${project.blockDurationMode === mode ? "text-copper-500" : ""}`} />
                  <span className="font-medium">{label}</span>
                </button>
              ))}
              <button
                onClick={async () => {
                  const custom = prompt("Enter block duration in minutes (15-240):", String(project.blockDuration));
                  if (custom) {
                    const mins = Math.max(15, Math.min(240, parseInt(custom) || 120));
                    await fetch(`/api/projects/${id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ blockDurationMode: "custom", blockDuration: mins }),
                    });
                    fetchData();
                  }
                }}
                className={`flex flex-col items-center gap-1 py-2 px-1 rounded-md border text-xs transition-all ${
                  project.blockDurationMode === "custom"
                    ? "border-copper-400 bg-copper-50 text-copper-700"
                    : "border-border bg-white text-muted-foreground hover:border-copper-300"
                }`}
              >
                <Clock className={`h-3.5 w-3.5 ${project.blockDurationMode === "custom" ? "text-copper-500" : ""}`} />
                <span className="font-medium">Custom</span>
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Breakdown Button */}
      <Card className="bg-card border-border">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">AI Task Breakdown</p>
              <p className="text-sm text-muted-foreground">
                Let Claude analyze your project and generate milestones + tasks
              </p>
            </div>
            <Button
              onClick={handleAiBreakdown}
              disabled={aiLoading}
              className="bg-copper-500 hover:bg-copper-600 text-white"
            >
              {aiLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Breaking down...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate with AI
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Milestones */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Milestones & Tasks</h2>

        {milestones.map((milestone) => {
          const milestoneTasks = getTasksForMilestone(milestone.id);
          const completedCount = milestoneTasks.filter(
            (t) => t.status === "completed"
          ).length;
          const isExpanded = expandedMilestones.has(milestone.id);

          return (
            <Card
              key={milestone.id}
              className="bg-card border-border"
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => toggleMilestone(milestone.id)}
                    className="flex items-center gap-2 text-left hover:text-foreground transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <CardTitle className="text-base">
                      {milestone.title}
                    </CardTitle>
                    {milestone.aiGenerated && (
                      <Sparkles className="h-3 w-3 text-copper-500" />
                    )}
                  </button>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                      {completedCount}/{milestoneTasks.length} tasks
                    </span>
                    {milestone.targetDate && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(milestone.targetDate).toLocaleDateString()}
                      </span>
                    )}
                    <button
                      onClick={() => deleteMilestone(milestone.id)}
                      className="p-1 text-muted-foreground hover:text-rust-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {milestoneTasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 group"
                      >
                        <button
                          onClick={() => toggleTaskStatus(task)}
                          className={`shrink-0 h-5 w-5 rounded border flex items-center justify-center transition-colors ${
                            task.status === "completed"
                              ? "bg-moss-400 border-moss-400"
                              : "border-border hover:border-copper-300"
                          }`}
                        >
                          {task.status === "completed" && (
                            <Check className="h-3 w-3 text-white" />
                          )}
                        </button>
                        <span
                          className={`flex-1 text-sm ${
                            task.status === "completed"
                              ? "text-muted-foreground line-through"
                              : "text-foreground"
                          }`}
                        >
                          {task.title}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {task.aiGenerated && (
                            <Sparkles className="h-3 w-3 text-copper-500" />
                          )}
                          <span>{task.estimatedMinutes}m</span>
                          <span>D:{task.difficulty}</span>
                          <button
                            onClick={() => deleteTask(task.id)}
                            className="p-1 opacity-0 group-hover:opacity-100 hover:text-rust-500 transition-all"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Add task inline */}
                    <div className="flex gap-2 mt-2">
                      <Input
                        placeholder="Add a task..."
                        value={newTaskTitle[milestone.id] || ""}
                        onChange={(e) =>
                          setNewTaskTitle((prev) => ({
                            ...prev,
                            [milestone.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addTask(milestone.id);
                        }}
                        className="bg-white border-border text-sm h-8 text-foreground placeholder:text-muted-foreground"
                      />
                      <Button
                        size="sm"
                        onClick={() => addTask(milestone.id)}
                        className="bg-copper-500 hover:bg-copper-600 h-8 text-white"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}

        {/* Ungrouped Tasks */}
        {ungroupedTasks.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-muted-foreground">
                Ungrouped Tasks
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {ungroupedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 group"
                  >
                    <button
                      onClick={() => toggleTaskStatus(task)}
                      className={`shrink-0 h-5 w-5 rounded border flex items-center justify-center transition-colors ${
                        task.status === "completed"
                          ? "bg-moss-400 border-moss-400"
                          : "border-border hover:border-copper-300"
                      }`}
                    >
                      {task.status === "completed" && (
                        <Check className="h-3 w-3 text-white" />
                      )}
                    </button>
                    <span
                      className={`flex-1 text-sm ${
                        task.status === "completed"
                          ? "text-muted-foreground line-through"
                          : "text-foreground"
                      }`}
                    >
                      {task.title}
                    </span>
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rust-500 transition-all"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add Milestone */}
        <Separator className="bg-border" />
        <div className="flex gap-2">
          <Input
            placeholder="Add a milestone..."
            value={newMilestoneTitle}
            onChange={(e) => setNewMilestoneTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addMilestone();
            }}
            className="bg-white border-border text-foreground placeholder:text-muted-foreground"
          />
          <Button
            onClick={addMilestone}
            className="bg-copper-500 hover:bg-copper-600 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Milestone
          </Button>
        </div>

        {/* Add ungrouped task */}
        <div className="flex gap-2">
          <Input
            placeholder="Add a quick task (no milestone)..."
            value={newUngroupedTaskTitle}
            onChange={(e) => setNewUngroupedTaskTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTask(null);
            }}
            className="bg-white border-border text-foreground placeholder:text-muted-foreground"
          />
          <Button
            onClick={() => addTask(null)}
            className="bg-copper-500 hover:bg-copper-600 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Task
          </Button>
        </div>
      </div>
    </div>
  );
}
