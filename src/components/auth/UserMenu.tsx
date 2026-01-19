// User Menu Component
// Displays authenticated user info and logout option

"use client";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LogOut, User, Settings, Shield } from "lucide-react";

const roleLabels: Record<string, string> = {
  admin: "Administrator",
  operator: "Operator",
  viewer: "Viewer",
};

const roleColors: Record<string, string> = {
  admin: "bg-red-500/20 text-red-400 border-red-500/30",
  operator: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  viewer: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

export function UserMenu() {
  const { user, logout, isLoading } = useAuth();

  if (!user) return null;

  const initials = user.username
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="flex items-center gap-3 h-auto p-2 hover:bg-slate-700/50">
          <Avatar className="h-8 w-8 bg-gradient-to-br from-blue-500 to-indigo-600">
            <AvatarFallback className="bg-transparent text-white text-sm font-medium">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col items-start text-left">
            <span className="text-sm font-medium text-white">{user.username}</span>
            <span className="text-xs text-slate-400">{user.email}</span>
          </div>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56 bg-slate-800 border-slate-700">
        <DropdownMenuLabel className="text-slate-300">
          <div className="flex flex-col gap-2">
            <span className="font-medium">{user.username}</span>
            <Badge variant="outline" className={`w-fit text-xs ${roleColors[user.role]}`}>
              <Shield className="w-3 h-3 mr-1" />
              {roleLabels[user.role]}
            </Badge>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="bg-slate-700" />

        <DropdownMenuItem className="text-slate-300 hover:bg-slate-700 hover:text-white cursor-pointer">
          <User className="mr-2 h-4 w-4" />
          Profil
        </DropdownMenuItem>

        <DropdownMenuItem className="text-slate-300 hover:bg-slate-700 hover:text-white cursor-pointer">
          <Settings className="mr-2 h-4 w-4" />
          Pengaturan
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-slate-700" />

        <DropdownMenuItem
          onClick={() => logout()}
          disabled={isLoading}
          className="text-red-400 hover:bg-red-500/20 hover:text-red-300 cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
