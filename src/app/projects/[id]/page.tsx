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
    critical: "bg-red-500/20 text-red-400 border-red-500/30",
    high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    low: "bg-green-500/20 text-green-400 border-green-500/30",
  };

  if (loading) {
    return <div className="text-neutral-400 py-8 text-center">Loading...</div>;
  }

  if (!project) {
    return (
      <div className="text-neutral-400 py-8 text-center">
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
          className="text-neutral-400 hover:text-neutral-50 transition-colors mt-1"
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
            <p className="text-neutral-400 mt-2">{project.description}</p>
          )}
          {project.deadline && (
            <p className="text-neutral-500 text-sm mt-1">
              <Clock className="h-3 w-3 inline mr-1" />
              Due: {new Date(project.deadline).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {/* Block Duration Setting */}
      <Card className="bg-neutral-900 border-neutral-800">
        <CardContent className="py-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">Work Block Duration</p>
              <span className="text-xs text-neutral-500">
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
                      ? "border-orange-500 bg-orange-500/10 text-orange-300"
                      : "border-neutral-700 bg-neutral-800 text-neutral-500 hover:border-neutral-600"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${project.blockDurationMode === mode ? "text-orange-400" : ""}`} />
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
                    ? "border-orange-500 bg-orange-500/10 text-orange-300"
                    : "border-neutral-700 bg-neutral-800 text-neutral-500 hover:border-neutral-600"
                }`}
              >
                <Clock className={`h-3.5 w-3.5 ${project.blockDurationMode === "custom" ? "text-orange-400" : ""}`} />
                <span className="font-medium">Custom</span>
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Breakdown Button */}
      <Card className="bg-neutral-900 border-neutral-800">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">AI Task Breakdown</p>
              <p className="text-sm text-neutral-400">
                Let Claude analyze your project and generate milestones + tasks
              </p>
            </div>
            <Button
              onClick={handleAiBreakdown}
              disabled={aiLoading}
              className="bg-purple-600 hover:bg-purple-700 text-white"
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
              className="bg-neutral-900 border-neutral-800"
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => toggleMilestone(milestone.id)}
                    className="flex items-center gap-2 text-left hover:text-neutral-300 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-neutral-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-neutral-500" />
                    )}
                    <CardTitle className="text-base">
                      {milestone.title}
                    </CardTitle>
                    {milestone.aiGenerated && (
                      <Sparkles className="h-3 w-3 text-purple-400" />
                    )}
                  </button>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-neutral-500">
                      {completedCount}/{milestoneTasks.length} tasks
                    </span>
                    {milestone.targetDate && (
                      <span className="text-xs text-neutral-500">
                        {new Date(milestone.targetDate).toLocaleDateString()}
                      </span>
                    )}
                    <button
                      onClick={() => deleteMilestone(milestone.id)}
                      className="p-1 text-neutral-500 hover:text-red-400 transition-colors"
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
                        className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-neutral-800/50 group"
                      >
                        <button
                          onClick={() => toggleTaskStatus(task)}
                          className={`shrink-0 h-5 w-5 rounded border flex items-center justify-center transition-colors ${
                            task.status === "completed"
                              ? "bg-green-600 border-green-600"
                              : "border-neutral-600 hover:border-neutral-400"
                          }`}
                        >
                          {task.status === "completed" && (
                            <Check className="h-3 w-3 text-white" />
                          )}
                        </button>
                        <span
                          className={`flex-1 text-sm ${
                            task.status === "completed"
                              ? "text-neutral-500 line-through"
                              : "text-neutral-200"
                          }`}
                        >
                          {task.title}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-neutral-500">
                          {task.aiGenerated && (
                            <Sparkles className="h-3 w-3 text-purple-400" />
                          )}
                          <span>{task.estimatedMinutes}m</span>
                          <span>D:{task.difficulty}</span>
                          <button
                            onClick={() => deleteTask(task.id)}
                            className="p-1 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
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
                        className="bg-neutral-800 border-neutral-700 text-sm h-8 text-neutral-50 placeholder:text-neutral-500"
                      />
                      <Button
                        size="sm"
                        onClick={() => addTask(milestone.id)}
                        className="bg-neutral-700 hover:bg-neutral-600 h-8 text-neutral-200"
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
          <Card className="bg-neutral-900 border-neutral-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-neutral-400">
                Ungrouped Tasks
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {ungroupedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-neutral-800/50 group"
                  >
                    <button
                      onClick={() => toggleTaskStatus(task)}
                      className={`shrink-0 h-5 w-5 rounded border flex items-center justify-center transition-colors ${
                        task.status === "completed"
                          ? "bg-green-600 border-green-600"
                          : "border-neutral-600 hover:border-neutral-400"
                      }`}
                    >
                      {task.status === "completed" && (
                        <Check className="h-3 w-3 text-white" />
                      )}
                    </button>
                    <span
                      className={`flex-1 text-sm ${
                        task.status === "completed"
                          ? "text-neutral-500 line-through"
                          : "text-neutral-200"
                      }`}
                    >
                      {task.title}
                    </span>
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="p-1 opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 transition-all"
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
        <Separator className="bg-neutral-800" />
        <div className="flex gap-2">
          <Input
            placeholder="Add a milestone..."
            value={newMilestoneTitle}
            onChange={(e) => setNewMilestoneTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addMilestone();
            }}
            className="bg-neutral-800 border-neutral-700 text-neutral-50 placeholder:text-neutral-500"
          />
          <Button
            onClick={addMilestone}
            className="bg-neutral-700 hover:bg-neutral-600 text-neutral-200"
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
            className="bg-neutral-800 border-neutral-700 text-neutral-50 placeholder:text-neutral-500"
          />
          <Button
            onClick={() => addTask(null)}
            className="bg-neutral-700 hover:bg-neutral-600 text-neutral-200"
          >
            <Plus className="h-4 w-4 mr-2" />
            Task
          </Button>
        </div>
      </div>
    </div>
  );
}
