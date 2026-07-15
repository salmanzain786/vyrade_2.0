'use client';

import React, { useState, useEffect } from 'react';
import {
  Search, Bot, Link, Workflow, Scan, Compass, Map, Languages, Eye,
  Radar, BarChart3, GitCompare, Filter, ListOrdered, Cpu, CheckSquare,
  GitMerge, Layers, Puzzle, Settings, Loader2, ClipboardCheck, Lightbulb, Sparkles,
} from 'lucide-react';

// Ported from chat-vyrade-ai-next-all's thinking.jsx — a stack of cards that
// cycles status messages while the blueprint is being drafted.
const STACK = [
  { icon: Search, title: 'Understanding your goal…' },
  { icon: Bot, title: 'Breaking down the requirement…' },
  { icon: Link, title: 'Connecting the dots…' },
  { icon: Workflow, title: 'Analyzing context and intent…' },
  { icon: Scan, title: 'Drafting the blueprint…' },
  { icon: Compass, title: 'Interpreting your request…' },
  { icon: Map, title: 'Mapping your needs…' },
  { icon: Languages, title: 'Translating the goal into steps…' },
  { icon: Eye, title: 'Reading between the lines…' },
  { icon: Radar, title: 'Scanning for hidden requirements…' },
  { icon: BarChart3, title: 'Evaluating possibilities…' },
  { icon: GitCompare, title: 'Comparing potential workflows…' },
  { icon: Filter, title: 'Filtering noise from signal…' },
  { icon: ListOrdered, title: 'Prioritizing the smartest options…' },
  { icon: Cpu, title: 'Processing data for insights…' },
  { icon: CheckSquare, title: 'Checking readiness…' },
  { icon: GitMerge, title: 'Aligning steps with your goal…' },
  { icon: Layers, title: 'Building the right workflow…' },
  { icon: Puzzle, title: 'Connecting systems intelligently…' },
  { icon: Settings, title: 'Matching tools to your intent…' },
  { icon: Loader2, title: 'Optimizing paths for efficiency…' },
  { icon: ClipboardCheck, title: 'Preparing the next question…' },
  { icon: Lightbulb, title: 'Finalizing…' },
  { icon: Sparkles, title: 'Almost there…' },
];

export default function Thinking() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setCurrent((p) => (p + 1) % STACK.length), 2000);
    return () => clearInterval(id);
  }, []);

  const positionOf = (index) => {
    const total = STACK.length;
    const diff = ((index - current) % total + total) % total;
    if (diff === 0) return { translateY: 0, scale: 1.1, zIndex: 10, opacity: 1, blur: 0 };
    if (diff === total - 1) return { translateY: -60, scale: 0.92, zIndex: 8, opacity: 1, blur: 3 };
    if (diff === 1) return { translateY: 60, scale: 0.92, zIndex: 8, opacity: 1, blur: 3 };
    return { translateY: diff < total / 2 ? -140 : 140, scale: 0.85, zIndex: 5, opacity: 0, blur: 0 };
  };

  return (
    <div className="w-full">
      <div className="text-center mb-2">
        <h2 className="text-xl font-bold text-foreground">We’re on it…</h2>
        <p className="text-muted-foreground text-sm">Hang tight — drafting your blueprint.</p>
      </div>

      <div className="relative h-56 flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center">
          {STACK.map((card, index) => {
            const Icon = card.icon;
            const p = positionOf(index);
            return (
              <div
                key={index}
                className="absolute bg-foreground/5 dark:bg-white/10 backdrop-blur border border-border rounded-xl shadow-lg transition-all [transition-duration:2500ms] ease-in-out"
                style={{
                  transform: `translateY(${p.translateY}px) scale(${p.scale})`,
                  zIndex: p.zIndex,
                  opacity: p.opacity,
                  filter: `blur(${p.blur}px)`,
                }}
              >
                <div className="p-4 w-80">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-foreground/10 text-foreground">
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="font-semibold text-foreground text-sm">{card.title}</h3>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
