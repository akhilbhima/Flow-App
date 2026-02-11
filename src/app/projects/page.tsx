"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import type { Project } from "@/lib/db/schema";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = () => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => {
        setProjects(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this project and all its tasks?")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    fetchProjects();
  };

  const priorityColor: Record<string, string> = {
    critical: "bg-red-500/20 text-red-400 border-red-500/30",
    high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    low: "bg-green-500/20 text-green-400 border-green-500/30",
  };

  const statusColor: Record<string, string> = {
    active: "bg-green-500/20 text-green-400 border-green-500/30",
    paused: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    completed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    archived: "bg-neutral-500/20 text-neutral-400 border-neutral-500/30",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-neutral-400 mt-1">All your goals and projects</p>
        </div>
        <a href="/projects/new">
          <Button className="bg-orange-600 hover:bg-orange-700 text-white">
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        </a>
      </div>

      {loading ? (
        <div className="text-neutral-400 py-8 text-center">Loading...</div>
      ) : projects.length === 0 ? (
        <Card className="bg-neutral-900 border-neutral-800 border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-neutral-400 mb-4">
              No projects yet. Describe what you want to achieve and AI will
              break it down into actionable targets.
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
          {projects.map((project) => (
            <a key={project.id} href={`/projects/${project.id}`}>
              <Card className="bg-neutral-900 border-neutral-800 hover:border-neutral-700 transition-colors cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{project.title}</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={statusColor[project.status]}
                      >
                        {project.status}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={priorityColor[project.priority]}
                      >
                        {project.priority}
                      </Badge>
                      <button
                        onClick={(e) => handleDelete(project.id, e)}
                        className="p-1 text-neutral-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-neutral-400">
                    {project.description && (
                      <p className="truncate flex-1">{project.description}</p>
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
  );
}
