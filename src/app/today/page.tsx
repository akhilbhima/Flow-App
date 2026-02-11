"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Play,
  Pause,
  Check,
  Clock,
  Zap,
  Coffee,
  Flame,
  Timer,
  RotateCcw,
  UtensilsCrossed,
  ArrowRight,
} from "lucide-react";
import type { Task } from "@/lib/db/schema";

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
  startTime: string;
  wrapUpBy: string | null;
  blockDuration: number;
  breakDuration: number;
  blocks: ScheduledBlock[];
  totalTasks: number;
  totalBlocks: number;
}

type PlanMode = "hours" | "wrapUpBy";

export default function TodayPage() {
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [planMode, setPlanMode] = useState<PlanMode>("wrapUpBy");
  const [hours, setHours] = useState(6);
  const [startTime, setStartTime] = useState(() => {
    const now = new Date();
    const mins = Math.ceil(now.getMinutes() / 15) * 15;
    now.setMinutes(mins, 0, 0);
    return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  });
  const [wrapUpBy, setWrapUpBy] = useState("17:00");
  const [started, setStarted] = useState(false);
  const [activeBlock, setActiveBlock] = useState<number | null>(null);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [blockTimers, setBlockTimers] = useState<Record<number, number>>({});
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Break state
  const [onBreak, setOnBreak] = useState(false);
  const [breakStartedAt, setBreakStartedAt] = useState<Date | null>(null);
  const [breakElapsed, setBreakElapsed] = useState(0);
  const breakTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const generatePlan = useCallback(async () => {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { startTime };
      if (planMode === "wrapUpBy") {
        body.wrapUpBy = wrapUpBy;
      } else {
        body.hours = hours;
      }

      const res = await fetch("/api/ai/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.blocks) {
        setPlan(data);
      }
    } catch (err) {
      console.error("Failed to generate plan:", err);
    } finally {
      setLoading(false);
    }
  }, [hours, startTime, wrapUpBy, planMode]);

  const handleStart = () => {
    setStarted(true);
    if (plan && plan.blocks.length > 0) {
      startBlock(1);
    }
  };

  const startBlock = (blockNum: number) => {
    setActiveBlock(blockNum);
    const block = plan?.blocks.find((b) => b.blockNumber === blockNum);
    const blockMins = block?.totalMinutes || plan?.blockDuration || 120;
    setBlockTimers((prev) => ({ ...prev, [blockNum]: blockMins * 60 }));
    setTimerRunning(true);
  };

  const completeBlock = () => {
    setTimerRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
    setActiveBlock(null);
  };

  // --- BREAK SYSTEM ---
  const takeBreak = () => {
    // Pause the current block timer
    setTimerRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
    setOnBreak(true);
    setBreakStartedAt(new Date());
    setBreakElapsed(0);
  };

  const resumeFromBreak = async () => {
    setOnBreak(false);
    setBreakStartedAt(null);
    if (breakTimerRef.current) clearInterval(breakTimerRef.current);

    // Recalibrate: regenerate the remaining schedule from NOW
    // Keep completed tasks, shift remaining blocks forward
    if (plan && activeBlock !== null) {
      // Simply resume the timer on the current block
      setTimerRunning(true);
    }
  };

  // Break elapsed timer
  useEffect(() => {
    if (onBreak && breakStartedAt) {
      breakTimerRef.current = setInterval(() => {
        setBreakElapsed(Math.floor((Date.now() - breakStartedAt.getTime()) / 1000));
      }, 1000);
    }
    return () => {
      if (breakTimerRef.current) clearInterval(breakTimerRef.current);
    };
  }, [onBreak, breakStartedAt]);

  const toggleTask = async (taskId: string) => {
    setCompletedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });

    try {
      const isCompleting = !completedTasks.has(taskId);
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: isCompleting ? "completed" : "pending",
        }),
      });
    } catch (err) {
      console.error("Failed to update task:", err);
    }
  };

  // Timer effect
  useEffect(() => {
    if (timerRunning && activeBlock !== null) {
      timerRef.current = setInterval(() => {
        setBlockTimers((prev) => {
          const current = prev[activeBlock] || 0;
          if (current <= 0) {
            setTimerRunning(false);
            return prev;
          }
          return { ...prev, [activeBlock]: current - 1 };
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerRunning, activeBlock]);

  const formatTimer = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatTimeLabel = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
  };

  const blockTypeIcon = (type: string) => {
    switch (type) {
      case "deep_work":
        return <Zap className="h-4 w-4 text-copper-500" />;
      case "shallow_work":
        return <Coffee className="h-4 w-4 text-slate-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const blockTypeLabel = (type: string) => {
    switch (type) {
      case "deep_work": return "Deep Work";
      case "shallow_work": return "Shallow Work";
      default: return type;
    }
  };

  // Calculate timeline positions for calendar view
  const getTimelineData = () => {
    if (!plan || plan.blocks.length === 0) return null;

    const firstStart = plan.blocks[0].startTime;
    const lastBlock = plan.blocks[plan.blocks.length - 1];
    const lastEnd = lastBlock.endTime;

    const [sh, sm] = firstStart.split(":").map(Number);
    const [eh, em] = lastEnd.split(":").map(Number);
    const dayStartMin = sh * 60 + sm;
    const dayEndMin = eh * 60 + em;
    const totalSpan = dayEndMin - dayStartMin;

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

    return { dayStartMin, totalSpan, hourMarkers };
  };

  const getBlockPosition = (block: ScheduledBlock, dayStartMin: number, totalSpan: number) => {
    const [sh, sm] = block.startTime.split(":").map(Number);
    const [eh, em] = block.endTime.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    const left = ((startMin - dayStartMin) / totalSpan) * 100;
    const width = ((endMin - startMin) / totalSpan) * 100;
    return { left, width };
  };

  // --- ON BREAK OVERLAY ---
  if (onBreak) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">On Break</h1>
          <p className="text-muted-foreground mt-1">Take your time. Hit resume when you&apos;re ready.</p>
        </div>

        <Card className="bg-card border-amber-200">
          <CardContent className="py-12 text-center space-y-6">
            <div className="flex justify-center">
              <div className="p-6 rounded-full bg-amber-50">
                <UtensilsCrossed className="h-12 w-12 text-amber-500" />
              </div>
            </div>
            <div>
              <p className="text-4xl font-mono font-bold text-amber-500">
                {formatTimer(breakElapsed)}
              </p>
              <p className="text-sm text-muted-foreground mt-2">Break time (untimed)</p>
            </div>
            {activeBlock !== null && (
              <p className="text-sm text-muted-foreground">
                Block {activeBlock} is paused. Your schedule will continue when you resume.
              </p>
            )}
            <Button
              onClick={resumeFromBreak}
              className="bg-moss-400 hover:bg-moss-500 text-white px-8 py-6 text-lg"
            >
              <Play className="h-5 w-5 mr-2" />
              Resume Working
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- NOT STARTED: MORNING START SCREEN ---
  if (!started) {
    const timeline = plan ? getTimelineData() : null;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Today</h1>
          <p className="text-muted-foreground mt-1">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        {/* Morning Start Card */}
        <Card className="bg-card border-border">
          <CardContent className="py-8">
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div className="p-4 rounded-full bg-copper-50">
                  <Flame className="h-10 w-10 text-copper-500" />
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-bold">Ready to flow?</h2>
                <p className="text-muted-foreground mt-2">
                  Set when you want to wrap up and hit generate.
                </p>
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => setPlanMode("wrapUpBy")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    planMode === "wrapUpBy"
                      ? "bg-copper-50 text-copper-600 border border-copper-400"
                      : "bg-white text-muted-foreground border border-copper-200 hover:border-copper-300"
                  }`}
                >
                  Wrap up by time
                </button>
                <button
                  onClick={() => setPlanMode("hours")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    planMode === "hours"
                      ? "bg-copper-50 text-copper-600 border border-copper-400"
                      : "bg-white text-muted-foreground border border-copper-200 hover:border-copper-300"
                  }`}
                >
                  Set hours
                </button>
              </div>

              {/* Input Fields */}
              <div className="flex items-center justify-center gap-4 max-w-lg mx-auto">
                <div className="space-y-1 text-left">
                  <label className="text-xs text-muted-foreground">Start time</label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="bg-white border-copper-200 text-foreground w-32"
                  />
                </div>

                <div className="pt-5">
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>

                {planMode === "wrapUpBy" ? (
                  <div className="space-y-1 text-left">
                    <label className="text-xs text-muted-foreground">Wrap up by</label>
                    <Input
                      type="time"
                      value={wrapUpBy}
                      onChange={(e) => setWrapUpBy(e.target.value)}
                      className="bg-white border-copper-200 text-foreground w-32"
                    />
                  </div>
                ) : (
                  <div className="space-y-1 text-left">
                    <label className="text-xs text-muted-foreground">Hours to work</label>
                    <Input
                      type="number"
                      min={1}
                      max={16}
                      value={hours}
                      onChange={(e) => setHours(parseInt(e.target.value) || 6)}
                      className="bg-white border-copper-200 text-foreground w-20 text-center"
                    />
                  </div>
                )}
              </div>

              {/* Generate / Start buttons */}
              <div className="flex justify-center gap-3">
                {!plan ? (
                  <Button
                    onClick={generatePlan}
                    disabled={loading}
                    className="bg-copper-500 hover:bg-copper-600 text-white px-8 py-6 text-lg"
                  >
                    {loading ? (
                      <>
                        <RotateCcw className="h-5 w-5 mr-2 animate-spin" />
                        Generating plan...
                      </>
                    ) : (
                      <>
                        <Zap className="h-5 w-5 mr-2" />
                        Generate My Day
                      </>
                    )}
                  </Button>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {plan.totalBlocks} blocks &middot; {plan.totalTasks} tasks &middot;{" "}
                      {plan.wrapUpBy
                        ? `${formatTimeLabel(plan.startTime)} → ${formatTimeLabel(plan.wrapUpBy)}`
                        : `${plan.hoursRequested}h`}
                      {" "}&middot; {plan.blockDuration}m blocks
                    </p>
                    <div className="flex gap-3 justify-center">
                      <Button
                        onClick={handleStart}
                        className="bg-moss-400 hover:bg-moss-500 text-white px-8 py-6 text-lg"
                      >
                        <Play className="h-5 w-5 mr-2" />
                        Start Block 1
                      </Button>
                      <Button
                        onClick={() => { setPlan(null); }}
                        variant="outline"
                        className="border-copper-200 text-foreground hover:bg-muted"
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Regenerate
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Calendar Timeline View */}
        {plan && plan.blocks.length > 0 && timeline && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-foreground">Schedule Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative h-16 mb-2">
                {/* Hour markers */}
                {timeline.hourMarkers.map((marker, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full flex flex-col items-center"
                    style={{ left: `${marker.position}%` }}
                  >
                    <div className="w-px h-3 bg-copper-200" />
                    <span className="text-[10px] text-muted-foreground mt-0.5">{marker.time}</span>
                  </div>
                ))}

                {/* Blocks */}
                {plan.blocks.map((block) => {
                  const pos = getBlockPosition(block, timeline.dayStartMin, timeline.totalSpan);
                  const isDeep = block.blockType === "deep_work";
                  return (
                    <div
                      key={block.blockNumber}
                      className={`absolute top-6 h-8 rounded-md flex items-center justify-center text-[10px] font-medium border overflow-hidden ${
                        isDeep
                          ? "bg-copper-50 border-copper-200 text-copper-700"
                          : "bg-slate-50 border-slate-200 text-slate-500"
                      }`}
                      style={{
                        left: `${pos.left}%`,
                        width: `${Math.max(pos.width, 3)}%`,
                      }}
                      title={`Block ${block.blockNumber}: ${block.startTime} - ${block.endTime} (${blockTypeLabel(block.blockType)})`}
                    >
                      {pos.width > 8 && `B${block.blockNumber}`}
                    </div>
                  );
                })}

                {/* Break gaps */}
                {plan.blocks.slice(0, -1).map((block, idx) => {
                  const nextBlock = plan.blocks[idx + 1];
                  const [eh, em] = block.endTime.split(":").map(Number);
                  const [nh, nm] = nextBlock.startTime.split(":").map(Number);
                  const breakStart = eh * 60 + em;
                  const breakEnd = nh * 60 + nm;
                  const left = ((breakStart - timeline.dayStartMin) / timeline.totalSpan) * 100;
                  const width = ((breakEnd - breakStart) / timeline.totalSpan) * 100;
                  if (width <= 0) return null;
                  return (
                    <div
                      key={`break-${idx}`}
                      className="absolute top-6 h-8 rounded-md flex items-center justify-center text-[10px] bg-muted/50 border border-copper-200 text-muted-foreground"
                      style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
                      title={`Break: ${block.endTime} - ${nextBlock.startTime}`}
                    >
                      {width > 5 && <Coffee className="h-3 w-3" />}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Preview blocks list */}
        {plan && plan.blocks.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">
              Today&apos;s Plan
            </h3>
            {plan.blocks.map((block) => (
              <Card
                key={block.blockNumber}
                className="bg-card border-border"
              >
                <CardContent className="py-4">
                  <div className="flex items-center gap-3 mb-3">
                    {blockTypeIcon(block.blockType)}
                    <span className="font-medium">
                      Block {block.blockNumber}
                    </span>
                    <Badge
                      variant="outline"
                      className="bg-muted border-copper-200 text-muted-foreground text-xs"
                    >
                      {formatTimeLabel(block.startTime)} - {formatTimeLabel(block.endTime)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        block.blockType === "deep_work"
                          ? "bg-copper-50 border-copper-200 text-copper-700 text-xs"
                          : "bg-slate-50 border-slate-200 text-slate-600 text-xs"
                      }
                    >
                      {blockTypeLabel(block.blockType)}
                    </Badge>
                  </div>
                  <div className="space-y-1 ml-7">
                    {block.tasks.map((st, idx) => (
                      <div
                        key={st.task.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span className="text-muted-foreground w-5 text-right">
                          {idx + 1}.
                        </span>
                        <span className="text-foreground">{st.task.title}</span>
                        <span className="text-muted-foreground text-xs">
                          ({st.task.estimatedMinutes}m &middot; D:{st.task.difficulty})
                        </span>
                        {idx === 0 && (
                          <span className="text-xs text-moss-500">
                            ← warmup
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // --- ACTIVE SESSION ---
  if (!plan) return null;

  const timeline = getTimelineData();

  return (
    <div className="space-y-6">
      {/* Header with timer + break button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Today</h1>
          <p className="text-muted-foreground mt-1">
            {completedTasks.size} of {plan.totalTasks} tasks completed
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeBlock !== null && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Block {activeBlock}</p>
              <p className="text-2xl font-mono font-bold text-copper-500">
                {formatTimer(blockTimers[activeBlock] || 0)}
              </p>
            </div>
          )}
          {activeBlock !== null && (
            <>
              <Button
                onClick={() => setTimerRunning(!timerRunning)}
                size="sm"
                variant="outline"
                className="border-copper-200 text-foreground"
              >
                {timerRunning ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
              <Button
                onClick={takeBreak}
                size="sm"
                variant="outline"
                className="border-amber-200 text-amber-500 hover:bg-amber-50"
              >
                <UtensilsCrossed className="h-4 w-4 mr-1" />
                Break
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-secondary rounded-full h-2">
        <div
          className="bg-copper-500 h-2 rounded-full transition-all duration-500"
          style={{
            width: `${plan.totalTasks > 0 ? (completedTasks.size / plan.totalTasks) * 100 : 0}%`,
          }}
        />
      </div>

      {/* Calendar Timeline (compact, always visible during session) */}
      {timeline && (
        <div className="relative h-14">
          {/* Hour markers */}
          {timeline.hourMarkers.map((marker, i) => (
            <div
              key={i}
              className="absolute top-0 h-full flex flex-col items-center"
              style={{ left: `${marker.position}%` }}
            >
              <div className="w-px h-2 bg-copper-200" />
              <span className="text-[9px] text-muted-foreground">{marker.time}</span>
            </div>
          ))}

          {/* Blocks on timeline */}
          {plan.blocks.map((block) => {
            const pos = getBlockPosition(block, timeline.dayStartMin, timeline.totalSpan);
            const isActive = activeBlock === block.blockNumber;
            const isPast = activeBlock !== null && block.blockNumber < activeBlock;
            const allDone = block.tasks.every((st) => completedTasks.has(st.task.id));
            const isDeep = block.blockType === "deep_work";

            return (
              <div
                key={block.blockNumber}
                className={`absolute top-5 h-7 rounded-md flex items-center justify-center text-[10px] font-medium border transition-all ${
                  isActive
                    ? "bg-copper-100 border-copper-400 text-copper-700 ring-1 ring-copper-300"
                    : isPast || allDone
                      ? "bg-muted/50 border-copper-200 text-muted-foreground"
                      : isDeep
                        ? "bg-copper-50 border-copper-200 text-copper-700"
                        : "bg-slate-50 border-slate-200 text-slate-500"
                }`}
                style={{
                  left: `${pos.left}%`,
                  width: `${Math.max(pos.width, 3)}%`,
                }}
              >
                {pos.width > 8 && `B${block.blockNumber}`}
              </div>
            );
          })}

          {/* Break gaps */}
          {plan.blocks.slice(0, -1).map((block, idx) => {
            const nextBlock = plan.blocks[idx + 1];
            const [eh, em] = block.endTime.split(":").map(Number);
            const [nh, nm] = nextBlock.startTime.split(":").map(Number);
            const breakStart = eh * 60 + em;
            const breakEnd = nh * 60 + nm;
            const left = ((breakStart - timeline.dayStartMin) / timeline.totalSpan) * 100;
            const width = ((breakEnd - breakStart) / timeline.totalSpan) * 100;
            if (width <= 0) return null;
            return (
              <div
                key={`break-${idx}`}
                className="absolute top-5 h-7 rounded-md flex items-center justify-center text-[9px] bg-muted/30 border border-dashed border-copper-200 text-muted-foreground"
                style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
              />
            );
          })}
        </div>
      )}

      {/* Blocks list */}
      <div className="space-y-4">
        {plan.blocks.map((block) => {
          const isActive = activeBlock === block.blockNumber;
          const allTasksDone = block.tasks.every((st) =>
            completedTasks.has(st.task.id)
          );
          const isCompleted =
            allTasksDone ||
            (activeBlock !== null && activeBlock > block.blockNumber);
          const isPast =
            activeBlock !== null && block.blockNumber < activeBlock;
          const isNext =
            activeBlock !== null && block.blockNumber === activeBlock + 1;

          return (
            <Card
              key={block.blockNumber}
              className={`transition-all duration-300 ${
                isActive
                  ? "bg-card border-copper-300 ring-1 ring-copper-200"
                  : isCompleted || isPast
                  ? "bg-card/50 border-border opacity-60"
                  : "bg-card border-border"
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isCompleted || isPast ? (
                      <div className="p-1.5 rounded-full bg-moss-50">
                        <Check className="h-4 w-4 text-moss-500" />
                      </div>
                    ) : isActive ? (
                      <div className="p-1.5 rounded-full bg-copper-50 animate-pulse">
                        <Timer className="h-4 w-4 text-copper-500" />
                      </div>
                    ) : (
                      <div className="p-1.5 rounded-full bg-secondary">
                        {blockTypeIcon(block.blockType)}
                      </div>
                    )}
                    <CardTitle className="text-base">
                      Block {block.blockNumber}
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className="bg-muted border-copper-200 text-muted-foreground text-xs"
                    >
                      {formatTimeLabel(block.startTime)} - {formatTimeLabel(block.endTime)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        block.blockType === "deep_work"
                          ? "bg-copper-50 border-copper-200 text-copper-700 text-xs"
                          : "bg-slate-50 border-slate-200 text-slate-600 text-xs"
                      }
                    >
                      {blockTypeLabel(block.blockType)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {isActive && (
                      <Button
                        onClick={completeBlock}
                        size="sm"
                        className="bg-moss-400 hover:bg-moss-500 text-white text-xs"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Done
                      </Button>
                    )}
                    {isNext && !isActive && activeBlock !== null && (
                      <Button
                        onClick={() => startBlock(block.blockNumber)}
                        size="sm"
                        className="bg-copper-500 hover:bg-copper-600 text-white text-xs"
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Start
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2 ml-8">
                  {block.tasks.map((st, idx) => {
                    const isDone = completedTasks.has(st.task.id);
                    return (
                      <div
                        key={st.task.id}
                        className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-colors ${
                          isActive ? "hover:bg-muted/50" : ""
                        }`}
                      >
                        <button
                          onClick={() => toggleTask(st.task.id)}
                          className={`shrink-0 h-5 w-5 rounded border flex items-center justify-center transition-colors ${
                            isDone
                              ? "bg-moss-400 border-moss-400"
                              : "border-muted-foreground hover:border-muted-foreground"
                          }`}
                        >
                          {isDone && (
                            <Check className="h-3 w-3 text-white" />
                          )}
                        </button>
                        <span
                          className={`flex-1 text-sm ${
                            isDone
                              ? "text-muted-foreground line-through"
                              : "text-foreground"
                          }`}
                        >
                          {st.task.title}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{st.task.estimatedMinutes}m</span>
                          <span className="text-muted-foreground">
                            D:{st.task.difficulty}
                          </span>
                          {idx === 0 && !isDone && isActive && (
                            <Badge className="bg-moss-50 text-moss-500 border-moss-200 text-[10px]">
                              warmup
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>

              {/* Break indicator between blocks */}
              {block.blockNumber < plan.blocks.length && (
                <div className="flex items-center gap-2 px-6 py-3 text-xs text-muted-foreground border-t border-border/50">
                  <Coffee className="h-3 w-3" />
                  {plan.breakDuration || 15} min break
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Session complete */}
      {activeBlock === null && started && completedTasks.size > 0 && (
        <Card className="bg-card border-moss-200">
          <CardContent className="py-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="p-4 rounded-full bg-moss-50">
                <Flame className="h-10 w-10 text-moss-500" />
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold">Great session!</h2>
              <p className="text-muted-foreground mt-2">
                You completed {completedTasks.size} of {plan.totalTasks} tasks.
                <br />
                Keep this momentum going.
              </p>
            </div>
            <div className="flex justify-center gap-3">
              <a href="/review">
                <Button className="bg-copper-600 hover:bg-copper-600 text-white">
                  EOD Review
                </Button>
              </a>
              <Button
                onClick={() => {
                  setStarted(false);
                  setPlan(null);
                  setCompletedTasks(new Set());
                  setActiveBlock(null);
                  setBlockTimers({});
                }}
                variant="outline"
                className="border-copper-200 text-foreground hover:bg-muted"
              >
                Start New Session
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
