import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDuration(seconds: number): string {
  if (!seconds) return "0m";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

export function scoreToColor(score: number): string {
  if (score >= 80) return "text-green-500";
  if (score >= 65) return "text-lime-500";
  if (score >= 50) return "text-yellow-500";
  if (score >= 35) return "text-orange-500";
  return "text-red-500";
}

export function scoreToLabel(score: number): string {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 55) return "Average";
  if (score >= 40) return "Below Average";
  return "Needs Work";
}

export function scoreToBgColor(score: number): string {
  if (score >= 80) return "bg-green-500/10 text-green-500 border-green-500/20";
  if (score >= 65) return "bg-lime-500/10 text-lime-500 border-lime-500/20";
  if (score >= 50) return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
  if (score >= 35) return "bg-orange-500/10 text-orange-500 border-orange-500/20";
  return "bg-red-500/10 text-red-500 border-red-500/20";
}

export function recommendationToLabel(rec: string): string {
  const map: Record<string, string> = {
    strong_yes: "Strong Hire",
    yes: "Hire",
    maybe: "Maybe",
    no: "No Hire",
    strong_no: "Strong No Hire",
  };
  return map[rec] || rec;
}

export function recommendationToColor(rec: string): string {
  const map: Record<string, string> = {
    strong_yes: "text-green-500",
    yes: "text-lime-500",
    maybe: "text-yellow-500",
    no: "text-orange-500",
    strong_no: "text-red-500",
  };
  return map[rec] || "text-muted-foreground";
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function interviewTypeLabel(type: string): string {
  const map: Record<string, string> = {
    hr: "HR / Behavioral",
    technical: "Technical",
    mixed: "Mixed",
    company_specific: "Company Specific",
    coding: "Coding",
  };
  return map[type] || capitalize(type);
}
