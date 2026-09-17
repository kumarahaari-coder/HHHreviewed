"use client";

import React, { useEffect, useState } from "react";
import { db } from "@/lib/db/mockDb";
import { Property } from "@/lib/db/schema";
import {
  Card,
  StatusBadge,
  PageHeader,
  LoadingState,
  EmptyState,
  ErrorBanner
} from "@/components/ui";
import { MapPin, Clock, Building2, CheckCircle2, CalendarDays } from "lucide-react";
import { formatStatusLabel, getStatusTypeForState } from "@/lib/status-mapper";

export default function PropertiesListing() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setProperties(db.properties || []);
  }, []);

  if (loading) {
    return <LoadingState message="Loading HHH Property registry..." />;
  }

  return (
    <div className="space-y-6 font-sans pb-8">
      {/* 1. Page Header */}
      <PageHeader
        title="Properties"
        description="Canonical HHH retreat properties and provider ingestion mappings."
      />

      {/* 2. Operational Property Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {properties.length === 0 ? (
          <div className="col-span-2">
            <EmptyState
              title="No properties registered"
              description="No retreat properties currently match the operational registry."
            />
          </div>
        ) : (
          properties.map(prop => (
            <Card key={prop.id} variant="default" className="p-4 sm:p-5 flex flex-col sm:flex-row gap-5">
              {/* Property Image Container */}
              <div className="w-full sm:w-48 h-36 bg-surface-muted rounded-lg overflow-hidden relative shrink-0 border border-divider-soft">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={prop.imageUrl}
                  alt={prop.name}
                  className="object-cover w-full h-full hover:scale-105 transition-transform duration-300"
                />
              </div>

              {/* Property Operational Details */}
              <div className="flex-1 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge variant="success">
                      Active
                    </StatusBadge>
                  </div>

                  <h3 className="text-lg font-bold text-primary tracking-tight">
                    {prop.name}
                  </h3>

                  <div className="space-y-1 text-xs text-secondary">
                    <p className="flex items-center gap-1.5">
                      <MapPin size={14} className="text-tertiary shrink-0" />
                      <span>{prop.location}</span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Clock size={14} className="text-tertiary shrink-0" />
                      <span>Timezone: {prop.timezone}</span>
                    </p>
                  </div>
                </div>

                {/* Integration Health Footer */}
                <div className="mt-4 pt-3 border-t border-divider-soft flex items-center justify-between text-xs text-secondary font-medium">
                  <span className="flex items-center gap-1.5 text-success">
                    <CheckCircle2 size={14} />
                    <span>Provider Synced</span>
                  </span>
                  <span className="text-xs text-tertiary font-sans">
                    Hospitable & OwnerRez Mapped
                  </span>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
