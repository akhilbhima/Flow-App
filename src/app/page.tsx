"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Target, Clock, Flame, Brain, Zap, Coffee, Play, ArrowRight, Calendar } from "lucide-react";
import type { Project, Task } from "@/lib/db/schema";

// --- Types matching the Today page schedule format ---
interface ScheduledTask {
  task: Task;
  sortOrder: number;
}

interface ScheduledBlock {
  blockNumber: number;
  startTime: string;
  endTime: string;
  blockType: "deep_work" | "shallow_work" | "break" | "buffer";
  tasks: ScheduledTask[];
  totalMinutes: number;
}

interface DayPlan {
  date: string;
  hoursRequested: number;
  startTime?: string;
  wrapUpBy?: string | null;
  blockDuration?: number;
  breakDuration?: number;
  blocks: ScheduledBlock[];
  totalTasks: number;
  totalBlocks: number;
}

// --- Helper Components ---

function BlockDurationBadge({ project }: { project: Project }) {
  const mode = project.blockDurationMode || "120";
  if (mode === "auto") {
    return (
      <span className="flex items-center gap-1 text-xs text-purple-400">
        <Brain className="h-3 w-3" />
        Auto
      </span>
    );
  }
  if (mode === "custom") {
    return (
      <span className="flex items-center gap-1 text-xs text-blue-400">
        <Clock className="h-3 w-3" />
        {project.blockDuration}m
      </span>
    );
  }
  const mins = parseInt(mode) || 120;
  const Icon = mins <= 60 ? Zap : mins <= 90 ? Clock : Flame;
  const color = mins <= 60 ? "text-yellow-400" : mins <= 90 ? "text-blue-400" : "text-red-400";
  return (
    <span className={`flex items-center gap-1 text-xs ${color}`}>
      <Icon className="h-3 w-3" />
      {mins}m
    </span>
  );
}

function formatTimeLabel(time: string) {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function blockTypeLabel(type: string) {
  switch (type) {
    case "deep_work": return "Deep Work";
    case "shallow_work": return "Shallow Work";
    default: return type;
  }
}

// --- Schedule Timeline Component ---

function ScheduleTimeline({ plan }: { plan: DayPlan }) {
  if (!plan || plan.blocks.length === 0) return null;

  const firstStart = plan.blocks[0].startTime;
  const lastBlock = plan.blocks[plan.blocks.length - 1];
  const lastEnd = lastBlock.endTime;

  const [sh, sm] = firstStart.split(":").map(Number);
  const [eh, em] = lastEnd.split(":").map(Number);
  const dayStartMin = sh * 60 + sm;
  const dayEndMin = eh * 60 + em;
  const totalSpan = dayEndMin - dayStartMin;

  if (totalSpan <= 0) return null;

  // Generate hour markers
  const hourMarkers: { time: string; position: number }[] = [];
  const startHour = Math.floor(sh);
  const endHour = Math.ceil(eh);
  for (let h = startHour; h <= endHour; h++) {
    const pos = ((h * 60 - dayStartMin) / totalSpan) * 100;
    if (pos >= 0 && pos <= 100) {
      hourMarkers.push({
        time: `${h % 12 || 12}${h >= 12 ? "p" : "a"}`,
        position: pos,
      });
    }
  }

  const getBlockPosition = (block: ScheduledBlock) => {
    const [bsh, bsm] = block.startTime.split(":").map(Number);
    const [beh, bem] = block.endTime.split(":").map(Number);
    const startMin = bsh * 60 + bsm;
    const endMin = beh * 60 + bem;
    const left = ((startMin - dayStartMin) / totalSpan) * 100;
    const width = ((endMin - startMin) / totalSpan) * 100;
    return { left, width };
  };

  return (
    <Card className="bg-neutral-900 border-neutral-800">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base text-neutral-300 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-orange-400" />
            Today&apos;s Schedule
          </CardTitle>
          <div className="flex items-center gap-3 text-xs text-neutral-500">
            <span>{plan.totalBlocks} blocks</span>
            <span>&middot;</span>
            <span>{plan.totalTasks} tasks</span>
            {plan.startTime && (
              <>
                <span>&middot;</span>
                <span>
                  {formatTimeLabel(plan.startTime)}
                  {plan.wrapUpBy && ` \u2192 ${formatTimeLabel(plan.wrapUpBy)}`}
                </span>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        {/* Timeline bar */}
        <div className="relative h-20 mb-1">
          {/* Hour markers */}
          {hourMarkers.map((marker, i) => (
            <div
              key={i}
              className="absolute top-0 h-full flex flex-col items-center"
              style={{ left: `${marker.position}%` }}
            >
              <div className="w-px h-3 bg-neutral-700" />
              <span className="text-[10px] text-neutral-600 mt-0.5">{marker.time}</span>
            </div>
          ))}

          {/* Work blocks */}
          {plan.blocks.map((block) => {
            const pos = getBlockPosition(block);
            const isDeep = block.blockType === "deep_work";
            return (
              <div
                key={block.blockNumber}
                className={`absolute top-7 h-10 rounded-md flex items-center justify-center text-[10px] font-medium border cursor-default transition-all hover:brightness-125 ${
                  isDeep
                    ? "bg-orange-500/20 border-orange-500/40 text-orange-300"
                    : "bg-blue-500/20 border-blue-500/40 text-blue-300"
                }`}
                style={{
                  left: `${pos.left}%`,
                  width: `${Math.max(pos.width, 3)}%`,
                }}
                title={`Block ${block.blockNumber}: ${formatTimeLabel(block.startTime)} - ${formatTimeLabel(block.endTime)} (${blockTypeLabel(block.blockType)}) - ${block.tasks.length} tasks`}
              >
                {pos.width > 12 ? (
                  <span className="truncate px-1">
                    B{block.blockNumber} &middot; {block.tasks.length}t
                  </span>
                ) : pos.width > 6 ? (
                  `B${block.blockNumber}`
                ) : null}
              </div>
            );
          })}

          {/* Break gaps */}
          {plan.blocks.slice(0, -1).map((block, idx) => {
            const nextBlock = plan.blocks[idx + 1];
            const [beh, bem] = block.endTime.split(":").map(Number);
            const [bnh, bnm] = nextBlock.startTime.split(":").map(Number);
            const breakStart = beh * 60 + bem;
            const breakEnd = bnh * 60 + bnm;
            const left = ((breakStart - dayStartMin) / totalSpan) * 100;
            const width = ((breakEnd - breakStart) / totalSpan) * 100;
            if (width <= 0) return null;
            return (
              <div
                key={`break-${idx}`}
                className="absolute top-7 h-10 rounded-md flex items-center justify-center text-[10px] bg-neutral-800/50 border border-neutral-700/30 text-neutral-600"
                style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
                title={`Break: ${formatTimeLabel(block.endTime)} - ${formatTimeLabel(nextBlock.startTime)}`}
              >
                {width > 5 && <Coffee className="h-3 w-3" />}
              </div>
            );
          })}
        </div>

        {/* Legend + CTA */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-4 text-[10px] text-neutral-500">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-orange-500/30 border border-orange-500/50" />
              Deep Work
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-500/30 border border-blue-500/50" />
              Shallow Work
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-neutral-800 border border-neutral-700/50" />
              Break
            </span>
          </div>
          <a href="/today">
            <Button
              size="sm"
              className="bg-orange-600 hover:bg-orange-700 text-white text-xs h-7"
            >
              <Play className="h-3 w-3 mr-1" />
              Go to Today
            </Button>
          </a>
        </div>

        {/* Block details (compact list) */}
        <div className="mt-4 space-y-1.5">
          {plan.blocks.map((block) => (
            <div
              key={block.blockNumber}
              className="flex items-center gap-2 text-xs"
            >
              <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${
                block.blockType === "deep_work" ? "bg-orange-400" : "bg-blue-400"
              }`} />
              <span className="text-neutral-500 w-14 shrink-0">
                {formatTimeLabel(block.startTime)}
              </span>
              <span className="text-neutral-300 font-medium">
                Block {block.blockNumber}
              </span>
              <span className="text-neutral-600">&middot;</span>
              <span className="text-neutral-400 truncate">
                {block.tasks.map((st) => st.task.title).join(", ")}
              </span>
              <span className="ml-auto shrink-0 text-neutral-600">
                {block.totalMinutes}m
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// --- Main Dashboard ---

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayPlan, setTodayPlan] = useState<DayPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);

  useEffect(() => {
    // Fetch projects only — schedule is loaded on demand
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => {
        setProjects(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const loadSchedulePreview = () => {
    setPlanLoading(true);
    const now = new Date();
    const mins = Math.ceil(now.getMinutes() / 15) * 15;
    now.setMinutes(mins, 0, 0);
    const startTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    fetch(`/api/ai/plan?startTime=${startTime}&hours=6`)
      .then((res) => res.json())
      .then((data) => {
        if (data.blocks && data.blocks.length > 0) {
          setTodayPlan(data);
        }
        setPlanLoading(false);
      })
      .catch(() => setPlanLoading(false));
  };

  const activeProjects = projects.filter((p) => p.status === "active");

  const priorityColor: Record<string, string> = {
    critical: "bg-red-500/20 text-red-400 border-red-500/30",
    high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    low: "bg-green-500/20 text-green-400 border-green-500/30",
  };

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-neutral-400">
          Your anti-procrastination command center. Targets, not outcomes.
        </p>
      </div>

      {/* Today's Schedule Timeline */}
      {todayPlan ? (
        <ScheduleTimeline plan={todayPlan} />
      ) : (
        <Card className="bg-neutral-900 border-neutral-800 border-dashed">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <Calendar className="h-5 w-5 text-orange-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-300">Today&apos;s Schedule</p>
                  <p className="text-xs text-neutral-500">
                    Preview your day or head to Today to start working
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={loadSchedulePreview}
                  disabled={planLoading}
                  className="border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                >
                  {planLoading ? (
                    <>
                      <Calendar className="h-4 w-4 mr-1 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Calendar className="h-4 w-4 mr-1" />
                      Preview Schedule
                    </>
                  )}
                </Button>
                <a href="/today">
                  <Button
                    size="sm"
                    className="bg-orange-600 hover:bg-orange-700 text-white"
                  >
                    <ArrowRight className="h-4 w-4 mr-1" />
                    Plan My Day
                  </Button>
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-neutral-900 border-neutral-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/20">
                <Target className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeProjects.length}</p>
                <p className="text-sm text-neutral-400">Active Projects</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-neutral-900 border-neutral-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/20">
                <Flame className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {todayPlan ? todayPlan.totalBlocks : "--"}
                </p>
                <p className="text-sm text-neutral-400">
                  {todayPlan ? "Blocks Scheduled" : "Flow Sessions Today"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Projects */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Active Projects</h2>
          <a href="/projects/new">
            <Button className="bg-orange-600 hover:bg-orange-700 text-white">
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </a>
        </div>

        {loading ? (
          <div className="text-neutral-400 py-8 text-center">Loading...</div>
        ) : activeProjects.length === 0 ? (
          <Card className="bg-neutral-900 border-neutral-800 border-dashed">
            <CardContent className="py-12 text-center">
              <p className="text-neutral-400 mb-4">
                No projects yet. Add your first goal to get started.
              </p>
              <a href="/projects/new">
                <Button className="bg-orange-600 hover:bg-orange-700 text-white">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Project
                </Button>
              </a>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {activeProjects.map((project) => (
              <a key={project.id} href={`/projects/${project.id}`}>
                <Card className="bg-neutral-900 border-neutral-800 hover:border-neutral-700 transition-colors cursor-pointer">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{project.title}</CardTitle>
                      <div className="flex items-center gap-2">
                        <BlockDurationBadge project={project} />
                        <Badge
                          variant="outline"
                          className={priorityColor[project.priority]}
                        >
                          {project.priority}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-neutral-400">
                      {project.description && (
                        <p className="truncate flex-1">
                          {project.description}
                        </p>
                      )}
                      {project.deadline && (
                        <span className="shrink-0">
                          Due: {new Date(project.deadline).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
