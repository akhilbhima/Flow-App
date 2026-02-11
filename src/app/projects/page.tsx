"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, ExternalLink } from "lucide-react";
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
    critical: "bg-rust-50 text-rust-500 border-rust-200",
    high: "bg-copper-50 text-copper-600 border-copper-200",
    medium: "bg-amber-50 text-amber-500 border-amber-200",
    low: "bg-moss-50 text-moss-500 border-moss-200",
  };

  const statusColor: Record<string, string> = {
    active: "bg-moss-50 text-moss-500 border-moss-200",
    paused: "bg-amber-50 text-amber-500 border-amber-200",
    completed: "bg-slate-50 text-slate-500 border-slate-200",
    archived: "bg-slate-50 text-muted-foreground border-slate-200",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground mt-1">All your goals and projects</p>
        </div>
        <a href="/projects/new">
          <Button className="bg-copper-500 hover:bg-copper-600 text-white">
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        </a>
      </div>

      {loading ? (
        <div className="text-muted-foreground py-8 text-center">Loading...</div>
      ) : projects.length === 0 ? (
        <Card className="bg-card border-border border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              No projects yet. Describe what you want to achieve and AI will
              break it down into actionable targets.
            </p>
            <a href="/projects/new">
              <Button className="bg-copper-500 hover:bg-copper-600 text-white">
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
              <Card className="bg-card border-border hover:border-copper-200 transition-colors cursor-pointer">
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
                        className="p-1 text-muted-foreground hover:text-rust-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {project.description && (
                      <p className="truncate flex-1">{project.description}</p>
                    )}
                    {(project as Project & { notionPageUrl?: string }).notionPageUrl && (
                      <span
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          window.open((project as Project & { notionPageUrl?: string }).notionPageUrl!, "_blank");
                        }}
                        className="shrink-0 inline-flex items-center gap-1 text-copper-500 hover:text-copper-600 transition-colors"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M6.017 4.313l55.333-4.087c6.797-.583 8.543-.19 12.817 2.917l17.663 12.443c2.913 2.14 3.883 2.723 3.883 5.053v68.243c0 4.277-1.553 6.807-6.99 7.193L24.467 99.967c-4.08.193-6.023-.39-8.16-3.113L3.3 79.94c-2.333-3.113-3.3-5.443-3.3-8.167V11.113c0-3.497 1.553-6.413 6.017-6.8z" fill="currentColor"/>
                        </svg>
                        Notion
                        <ExternalLink className="h-3 w-3" />
                      </span>
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
