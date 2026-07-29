"use client";

import React, { useEffect, useState } from "react";
import { ArrowUpRight, Clock, MapPin, Users } from "lucide-react";
import { db } from "@/lib/db/mockDb";
import type { Property } from "@/lib/db/schema";
import { Card, Badge } from "@/components/ui/custom";

export default function PropertiesListing() {
  const [properties, setProperties] = useState<Property[]>(() => db.properties);

  useEffect(() => {
    const onStorage = () => setProperties(db.properties);
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-brand-plum tracking-tight">HHH Stays</h1>
        <p className="text-zinc-500 font-serif italic text-sm mt-1">
          Public Hidden Honey Homes stay details, enriched with live Hospitable IDs after a secure sync.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {properties.map(property => {
          const isSynced = property.syncStatus === "HOSPITABLE_SYNCED" && Boolean(property.hospitablePropertyId);
          return (
            <Card key={property.id} className="flex flex-col gap-5 p-4">
              <div className="h-52 bg-zinc-200 rounded-xl overflow-hidden relative border border-brand-blush/60">
                {property.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={property.imageUrl}
                    alt={property.name}
                    className="object-cover w-full h-full hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-zinc-400">Image not available</div>
                )}
                <div className="absolute top-3 right-3">
                  <Badge type={isSynced ? "success" : "warning"}>
                    {isSynced ? "Hospitable Synced" : "Public Site Data"}
                  </Badge>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-brand-wine">{property.mood || "Hidden Honey Home"}</p>
                  <h2 className="text-xl font-bold text-brand-plum mt-1">{property.name}</h2>
                </div>

                <p className="text-sm text-zinc-600 leading-relaxed">{property.summary || "Stay details will be completed after the Hospitable sync."}</p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-zinc-500">
                  <span className="flex items-center gap-1.5"><MapPin size={13} /> {property.location}</span>
                  <span className="flex items-center gap-1.5"><Clock size={13} /> {property.timezone}</span>
                  <span className="flex items-center gap-1.5"><Users size={13} /> Up to {property.maximumOccupancy || 2} guests</span>
                </div>

                <div className="rounded-lg bg-brand-bg/70 border border-brand-blush p-3 text-[11px] text-zinc-500">
                  <span className="font-bold text-brand-plum">Hospitable Property ID:</span>{" "}
                  <span className="font-mono">{property.hospitablePropertyId || "Awaiting secure API sync"}</span>
                </div>

                <div className="flex flex-wrap gap-3 pt-1">
                  {property.websiteUrl ? (
                    <a href={property.websiteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand-plum hover:underline">
                      View stay page <ArrowUpRight size={13} />
                    </a>
                  ) : null}
                  {property.bookingUrl ? (
                    <a href={property.bookingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand-wine hover:underline">
                      View booking page <ArrowUpRight size={13} />
                    </a>
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
