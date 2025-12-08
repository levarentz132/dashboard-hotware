"use client";

import { Camera, CameraIcon, LogOut, Wifi, WifiOff } from "lucide-react";
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
import { useRouter } from "next/navigation";
import { useCameras } from "@/hooks/useNxAPI";
import Image from "next/image";
import LogoImage from "@/images/image.png";

export default function AppSidebar() {
  const { cameras, error, loading, refetch } = useCameras();
  const { isMobile } = useSidebar();
  const router = useRouter();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <div className="flex p-1 items-center justify-center rounded-md">
                <Image src={LogoImage} alt="Hotware Logo" width={110} height={110} className="rounded-md" />
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
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Camera className="size-4 flex-shrink-0" />
                        <span className="truncate">{camera.name}</span>
                      </div>
                      {camera.status?.toLowerCase() === "online" ? (
                        <div className="flex items-center gap-1 flex-shrink-0" title="Online">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <Wifi className="size-3 text-green-500" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 flex-shrink-0" title="Offline">
                          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                          <WifiOff className="size-3 text-red-500" />
                        </div>
                      )}
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
                    <h4 className="truncate font-medium">Admin</h4>
                    {/* <p className="text-muted-foreground truncate text-xs">Admin</p> */}
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
                      <h4 className="truncate font-medium">Admin</h4>
                      {/* <p className="text-muted-foreground truncate text-xs">Admin</p> */}
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => router.push("/")} className="cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    Home
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
