"use client";

import React from "react";
import VideoXwareMain from "../videoxware/VideoXwareMain";

export default function VideoXwareDashboard() {
  return (
    <div className="w-full h-full min-h-screen bg-[#090d16] text-slate-100 rounded-2xl overflow-y-auto shadow-2xl border border-slate-800 flex flex-col">
      <VideoXwareMain />
    </div>
  );
}
