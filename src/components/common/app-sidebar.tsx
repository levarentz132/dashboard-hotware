"use client";

import { Camera, Coffee, LogOut } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { usePathname } from "next/navigation";
import { useCameras } from "@/hooks/useNxAPI";

export default function AppSidebar() {
  const { cameras, error, loading, refetch } = useCameras();
  const { isMobile } = useSidebar();
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <div className="font-semibold">
                <div className="bg-teal-500 flex p-2 items-center justify-center rounded-md">
                  <Coffee className="size-4" />
                </div>
                WPU Cafe
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent className="flex flex-col gap-2">
            {/* Loading State */}
            {loading && <div className="p-4 text-center text-sm text-muted-foreground">Loading cameras...</div>}

            {/* Error State */}
            {error && <div className="p-4 text-center text-sm text-red-500">Failed to load cameras</div>}

            {/* Empty State */}
            {!loading && !error && cameras.length === 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground">No cameras available</div>
            )}

            {/* Camera List */}
            {!loading && !error && cameras.length > 0 && (
              <SidebarMenu>
                {cameras.map((camera) => (
                  <SidebarMenuItem key={camera.id}>
                    <SidebarMenuButton
                      size="lg"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData(
                          "camera",
                          JSON.stringify({
                            id: camera.id,
                            name: camera.name,
                          })
                        );
                        e.currentTarget.style.opacity = "0.5";
                      }}
                      onDragEnd={(e) => {
                        e.currentTarget.style.opacity = "1";
                      }}
                      onTouchStart={(e) => {
                        e.currentTarget.dataset.camera = JSON.stringify({
                          id: camera.id,
                          name: camera.name,
                        });
                        e.currentTarget.style.opacity = "0.5";
                      }}
                      onTouchEnd={(e) => {
                        e.currentTarget.style.opacity = "1";
                      }}
                      className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground cursor-grab active:cursor-grabbing hover:bg-accent transition-all touch-none"
                    >
                      <Camera className="mr-2 size-4" />
                      {camera.name}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src="" alt="" />
                    <AvatarFallback className="rounded-lg">A</AvatarFallback>
                  </Avatar>
                  <div className="leading-tight">
                    <h4 className="truncate font-medium">Avip Syaifulloh</h4>
                    <p className="text-muted-foreground truncate text-xs">Admin</p>
                  </div>
                  <Camera className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="min-w-56 rounded-lg"
                side={isMobile ? "bottom" : "right"}
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarImage src="" alt="" />
                      <AvatarFallback className="rounded-lg">A</AvatarFallback>
                    </Avatar>
                    <div className="leading-tight">
                      <h4 className="truncate font-medium">Avip Syaifulloh</h4>
                      <p className="text-muted-foreground truncate text-xs">Admin</p>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem>
                    <LogOut />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
