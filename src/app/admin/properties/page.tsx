"use client";

import React, { useEffect, useState } from "react";
import { db } from "@/lib/db/mockDb";
import { Property } from "@/lib/db/schema";
import { Card, Badge } from "@/components/ui/custom";
import { Home, MapPin, Clock, ArrowRight, CheckCircle2 } from "lucide-react";

export default function PropertiesListing() {
  const [properties, setProperties] = useState<Property[]>([]);

  useEffect(() => {
    setProperties(db.properties);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-brand-plum tracking-tight">HHH Properties</h1>
        <p className="text-zinc-500 font-serif italic text-sm mt-1">
          Retreat property registry retrieved from Hospitable API integrations.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {properties.map(prop => (
          <Card key={prop.id} className="flex flex-col sm:flex-row gap-6 p-4 items-stretch">
            {/* Image section */}
            <div className="w-full sm:w-48 h-36 bg-zinc-200 rounded-lg overflow-hidden relative shrink-0 shadow-xs border border-brand-blush/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={prop.imageUrl}
                alt={prop.name}
                className="object-cover w-full h-full hover:scale-105 transition-transform duration-300"
              />
            </div>

            {/* Info details */}
            <div className="flex-1 flex flex-col justify-between py-1">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono text-zinc-400 font-bold uppercase tracking-widest">{prop.hospitablePropertyId}</span>
                  <Badge type="success">Active</Badge>
                </div>
                <h3 className="text-xl font-bold text-brand-plum">{prop.name}</h3>
                
                <div className="space-y-1 text-xs text-zinc-500">
                  <p className="flex items-center gap-1.5">
                    <MapPin size={12} className="text-zinc-400" />
                    <span>{prop.location}</span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Clock size={12} className="text-zinc-400" />
                    <span>Timezone: {prop.timezone}</span>
                  </p>
                </div>
              </div>

              {/* API Integration details */}
              <div className="mt-4 pt-3 border-t border-brand-blush/60 flex items-center justify-between text-[11px] text-brand-wine font-medium">
                <span className="flex items-center gap-1">
                  <CheckCircle2 size={12} className="text-brand-sage" />
                  Synced with Hospitable
                </span>
                <span className="font-mono text-zinc-400">ID: {prop.id}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
