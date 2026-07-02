"use client";

import { useState } from "react";
import { RampInterface } from "@/components/RampInterface";
import { VelocityInterface } from "@/components/VelocityInterface";
import { LightsparkInterface } from "@/components/LightsparkInterface";

type Tab = "iron" | "velocity" | "lightspark";

export function RampTabs() {
  const [tab, setTab] = useState<Tab>("iron");

  return (
    <div className="w-full">
      {/* Tab bar */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-1 pt-2">
            {([
              { id: "iron", label: "Iron and direct offramps" },
              { id: "velocity", label: "Velocity" },
              { id: "lightspark", label: "LightSpark" },
            ] as const).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`px-5 py-2.5 text-sm font-medium rounded-t-md transition-colors cursor-pointer border-b-2 -mb-px ${
                  tab === id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4">
        {tab === "iron" && <RampInterface />}
        {tab === "velocity" && <VelocityInterface />}
        {tab === "lightspark" && <LightsparkInterface />}
      </div>
    </div>
  );
}
