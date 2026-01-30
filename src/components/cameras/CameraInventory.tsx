"use client";

import {
  Search,
  Grid,
  List,
  Camera,
  Wifi,
  WifiOff,
  Settings,
  RefreshCw,
  AlertCircle,
  Plus,
  Trash2,
  Cloud,
  Server,
  ChevronDown,
  ChevronRight,
  Filter,
  MapPin,
  LogIn,
  Eye,
  EyeOff,
  X,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useCameras, useDeviceType } from "@/hooks/useNxAPI-camera";
import { useServers } from "@/hooks/useNxAPI-server";
import { useSystemInfo } from "@/hooks/useNxAPI-system";
import { fetchCloudSystems as getCachedCloudSystems } from "@/hooks/use-async-data";
import nxAPI, { NxSystemInfo } from "@/lib/nxapi";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";

interface CloudSystem {
  id: string;
  name: string;
  stateOfHealth: string;
  accessRole: string;
  version?: string;
}

interface CameraDevice {
  id: string;
  name: string;
  physicalId: string;
  url: string;
  typeId: string;
  mac: string;
  serverId: string;
  vendor: string;
  model: string;
  logicalId: string;
  status: string;
  ip?: string;
  location?: string;
  type?: string;
  resolution?: string;
  fps?: number;
  group?: { id: string; name: string };
  credentials?: { user: string; password: string };
}

// Location interfaces
interface Province {
  id: string;
  name: string;
}

interface Regency {
  id: string;
  province_id: string;
  name: string;
}

interface District {
  id: string;
  regency_id: string;
  name: string;
}

interface Village {
  id: string;
  district_id: string;
  name: string;
}

// Camera location cache interface
interface CameraLocationCache {
  [cameraName: string]: {
    province_name?: string;
    regency_name?: string;
    district_name?: string;
    village_name?: string;
    detail_address?: string;
  } | null;
}

interface CamerasBySystem {
  systemId: string;
  systemName: string;
  cameras: CameraDevice[];
  stateOfHealth: string;
}

export default function CameraInventory() {
  const [viewMode, setViewMode] = useState<"grid" | "list" | "cloud">("cloud");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSystemId, setSelectedSystemId] = useState<string>("");

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterVendor, setFilterVendor] = useState<string>("all");
  const [filterProvince, setFilterProvince] = useState<string>("all");
  const [filterDistrict, setFilterDistrict] = useState<string>("all");
  const [filterVillage, setFilterVillage] = useState<string>("all");

  const systemId = selectedSystemId;

  // API hooks
  const { cameras, loading: loadingCameras, error: camerasError, refetch } = useCameras(systemId);
  const { connected, testConnection } = useSystemInfo(systemId);
  const { servers, loading: loadingServers, error: serversError } = useServers(systemId);
  const { deviceType } = useDeviceType(systemId);

  const loading = loadingCameras || loadingServers;
  const error = camerasError || serversError;

  // Cloud systems state
  const [cloudSystems, setCloudSystems] = useState<CloudSystem[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [camerasBySystem, setCamerasBySystem] = useState<CamerasBySystem[]>([]);
  const [expandedSystems, setExpandedSystems] = useState<Set<string>>(new Set());

  const isLoadingContent = loading || (viewMode === "cloud" && loadingCloud);


  // Set default system
  useEffect(() => {
    const getSystems = async () => {
      try {
        setLoadingCloud(true);
        const systems = await getCachedCloudSystems();
        setCloudSystems(systems);
        if (systems.length > 0 && !selectedSystemId) {
          const onlineSystem = systems.find(s => s.stateOfHealth === "online") || systems[0];
          setSelectedSystemId(onlineSystem.id);
        }
      } catch (err) {
        console.error("Error fetching systems:", err);
      } finally {
        setLoadingCloud(false);
      }
    };
    getSystems();
  }, [selectedSystemId]);

  // Location state
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [regencies, setRegencies] = useState<Regency[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [villages, setVillages] = useState<Village[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);

  // Edit location state (separate for edit modal)
  const [editRegencies, setEditRegencies] = useState<Regency[]>([]);
  const [editDistricts, setEditDistricts] = useState<District[]>([]);
  const [editVillages, setEditVillages] = useState<Village[]>([]);

  // Camera location cache for cloud cameras
  const [cameraLocations, setCameraLocations] = useState<CameraLocationCache>({});

  // Get status description
  const getStatusDescription = (status: string): string => {
    const statusLower = status?.toLowerCase();
    switch (statusLower) {
      case "offline":
        return "The Device is inaccessible.";
      case "unauthorized":
        return "The Device does not have correct credentials in the database.";
      case "recording":
        return "The Camera is online and recording the video stream.";
      case "online":
        return "The Device is online and accessible.";
      case "notdefined":
        return "The Device status is unknown. It may show up while Servers synchronize status information.";
      case "incompatible":
        return "The Server is incompatible (different System name or incompatible protocol version).";
      case "mismatchedcertificate":
        return "Server's DB certificate doesn't match the SSL handshake certificate.";
      default:
        return "Status unknown";
    }
  };

  // Get status color based on status type
  const getStatusBadgeStyle = (status: string): string => {
    const statusLower = status?.toLowerCase();
    switch (statusLower) {
      case "online":
      case "recording":
        return "bg-green-100 text-green-800 border-green-200";
      case "offline":
        return "bg-red-100 text-red-800 border-red-200";
      case "unauthorized":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "notdefined":
        return "bg-gray-100 text-gray-800 border-gray-200";
      case "incompatible":
      case "mismatchedcertificate":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default:
        return "bg-gray-100 text-gray-600 border-gray-200";
    }
  };

  // Format location display (short version for cards)
  const formatCameraLocation = (cameraName: string): string => {
    const location = cameraLocations[cameraName];
    if (!location) return "Lokasi belum diatur";

    const parts: string[] = [];

    if (location.village_name) parts.push(location.village_name);
    if (location.district_name) parts.push(location.district_name);
    if (location.regency_name) parts.push(location.regency_name);

    if (parts.length === 0) return "Lokasi belum diatur";

    return parts.join(", ");
  };

  // Format location display (full version for tooltip/details)
  const formatCameraLocationFull = (cameraName: string): string => {
    const location = cameraLocations[cameraName];
    if (!location) return "Lokasi belum diatur";

    const lines: string[] = [];

    if (location.detail_address) lines.push(`📍 ${location.detail_address}`);
    if (location.village_name) lines.push(`🏘️ Kel. ${location.village_name}`);
    if (location.district_name) lines.push(`🏛️ Kec. ${location.district_name}`);
    if (location.regency_name) lines.push(`🏙️ ${location.regency_name}`);
    if (location.province_name) lines.push(`🗺️ ${location.province_name}`);

    if (lines.length === 0) return "Lokasi belum diatur";

    return lines.join("\n");
  };

  // Fetch camera locations for cloud cameras
  const fetchCameraLocations = useCallback(
    async (cameraNames: string[]) => {
      const uncachedNames = cameraNames.filter((name) => !(name in cameraLocations));
      if (uncachedNames.length === 0) return;

      try {
        const locationPromises = uncachedNames.map(async (name) => {
          try {
            const response = await fetch(`/api/camera-location?camera_name=${encodeURIComponent(name)}`);
            if (response.ok) {
              const data = await response.json();
              return { name, data };
            }
            return { name, data: null };
          } catch {
            return { name, data: null };
          }
        });

        const results = await Promise.all(locationPromises);

        setCameraLocations((prev) => {
          const updated = { ...prev };
          results.forEach(({ name, data }) => {
            updated[name] = data;
          });
          return updated;
        });
      } catch (err) {
        console.error("Failed to fetch camera locations:", err);
      }
    },
    [cameraLocations],
  );

  // Fetch available systems once and set default
  useEffect(() => {
    const getSystems = async () => {
      try {
        setLoadingCloud(true);
        const systems = await getCachedCloudSystems();
        setCloudSystems(systems);

        // Default to first online system if available
        if (systems.length > 0 && !selectedSystemId) {
          const onlineSystem = systems.find(s => s.stateOfHealth === "online") || systems[0];
          setSelectedSystemId(onlineSystem.id);
        }
      } catch (err) {
        console.error("Error fetching systems:", err);
      } finally {
        setLoadingCloud(false);
      }
    };

    getSystems();
  }, [selectedSystemId]);

  // Fetch cameras from a specific cloud system
  const fetchCloudCameras = useCallback(async (system: CloudSystem): Promise<CameraDevice[]> => {
    if (system.stateOfHealth !== "online") return [];

    try {
      const response = await fetch(
        `/api/nx/devices?systemId=${encodeURIComponent(system.id)}&systemName=${encodeURIComponent(system.name)}`,
        {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        },
      );

      if (!response.ok) return [];

      const devices = await response.json();
      const cameraDevices = Array.isArray(devices) ? devices : [];

      return cameraDevices.map((device: any) => ({
        ...device,
        systemId: system.id,
        systemName: system.name,
      }));
    } catch (err) {
      console.error(`Error fetching cameras from ${system.name}:`, err);
      return [];
    }
  }, []);

  const fetchAllCloudCameras = useCallback(async () => {
    try {
      setLoadingCloud(true);
      const systems = await getCachedCloudSystems();
      setCloudSystems(systems);

      const cloudPromises = systems.map(async (system) => {
        const cameras = await fetchCloudCameras(system);
        return {
          systemId: system.id,
          systemName: system.name,
          cameras,
          stateOfHealth: system.stateOfHealth,
        };
      });

      const results = await Promise.all(cloudPromises);
      setCamerasBySystem(results);

      // Auto-expand the first system if nothing is expanded yet
      if (results.length > 0) {
        setExpandedSystems((prev) => {
          if (prev.size === 0) {
            return new Set([results[0].systemId]);
          }
          return prev;
        });
      }
    } catch (err) {
      console.error("Error fetching all cloud cameras:", err);
    } finally {
      setLoadingCloud(false);
    }
  }, [fetchCloudCameras]);

  // Toggle system expansion
  const toggleSystemExpansion = (systemId: string) => {
    setExpandedSystems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(systemId)) {
        newSet.delete(systemId);
      } else {
        newSet.add(systemId);
      }
      return newSet;
    });
  };

  // Cloud-only system handling
  useEffect(() => {
    if (viewMode === "cloud") {
      fetchAllCloudCameras();
    } else if (systemId) {
      refetch();
    }
  }, [systemId, refetch, viewMode, fetchAllCloudCameras]);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCamera, setSelectedCamera] = useState<CameraDevice | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create form state
  const [createForm, setCreateForm] = useState({
    name: "",
    physicalId: "",
    url: "",
    typeId: "",
    mac: "",
    serverId: "",
    vendor: "",
    model: "",
    logicalId: "",
    groupId: "",
    groupName: "",
    credentialsUser: "",
    credentialsPassword: "",
    // Location fields
    provinceId: "",
    regencyId: "",
    districtId: "",
    villageId: "",
    detailAddress: "",
  });

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: "",
    physicalId: "",
    url: "",
    typeId: "",
    mac: "",
    serverId: "",
    vendor: "",
    model: "",
    logicalId: "",
    // Location fields
    provinceId: "",
    regencyId: "",
    districtId: "",
    villageId: "",
    detailAddress: "",
    groupId: "",
    groupName: "",
    credentialsUser: "",
    credentialsPassword: "",
  });

  // Form error states
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // Auto-retry connection when component mounts
  useEffect(() => {
    if (!connected && !loading) {
      testConnection();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set default serverId when servers load
  useEffect(() => {
    if (servers.length > 0 && !createForm.serverId) {
      setCreateForm((prev) => ({ ...prev, serverId: servers[0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers]);

  // Fetch provinces on mount
  useEffect(() => {
    const fetchProvinces = async () => {
      try {
        setLoadingLocations(true);
        const response = await fetch("/api/locations/provinces");
        if (response.ok) {
          const data = await response.json();
          setProvinces(data);
        }
      } catch (err) {
        console.error("Failed to fetch provinces:", err);
      } finally {
        setLoadingLocations(false);
      }
    };
    fetchProvinces();
  }, []);

  // Location change handlers for Create form
  const handleCreateProvinceChange = async (provinceId: string) => {
    setCreateForm((prev) => ({
      ...prev,
      provinceId,
      regencyId: "",
      districtId: "",
      villageId: "",
    }));
    setRegencies([]);
    setDistricts([]);
    setVillages([]);

    if (provinceId) {
      try {
        const response = await fetch(`/api/locations/regencies?province_id=${provinceId}`);
        if (response.ok) {
          setRegencies(await response.json());
        }
      } catch (err) {
        console.error("Failed to fetch regencies:", err);
      }
    }
  };

  const handleCreateRegencyChange = async (regencyId: string) => {
    setCreateForm((prev) => ({
      ...prev,
      regencyId,
      districtId: "",
      villageId: "",
    }));
    setDistricts([]);
    setVillages([]);

    if (regencyId) {
      try {
        const response = await fetch(`/api/locations/districts?regency_id=${regencyId}`);
        if (response.ok) {
          setDistricts(await response.json());
        }
      } catch (err) {
        console.error("Failed to fetch districts:", err);
      }
    }
  };

  const handleCreateDistrictChange = async (districtId: string) => {
    setCreateForm((prev) => ({
      ...prev,
      districtId,
      villageId: "",
    }));
    setVillages([]);

    if (districtId) {
      try {
        const response = await fetch(`/api/locations/villages?district_id=${districtId}`);
        if (response.ok) {
          setVillages(await response.json());
        }
      } catch (err) {
        console.error("Failed to fetch villages:", err);
      }
    }
  };

  // Location change handlers for Edit form
  const handleEditProvinceChange = async (provinceId: string) => {
    setEditForm((prev) => ({
      ...prev,
      provinceId,
      regencyId: "",
      districtId: "",
      villageId: "",
    }));
    setEditRegencies([]);
    setEditDistricts([]);
    setEditVillages([]);

    if (provinceId) {
      try {
        const response = await fetch(`/api/locations/regencies?province_id=${provinceId}`);
        if (response.ok) {
          setEditRegencies(await response.json());
        }
      } catch (err) {
        console.error("Failed to fetch regencies:", err);
      }
    }
  };

  const handleEditRegencyChange = async (regencyId: string) => {
    setEditForm((prev) => ({
      ...prev,
      regencyId,
      districtId: "",
      villageId: "",
    }));
    setEditDistricts([]);
    setEditVillages([]);

    if (regencyId) {
      try {
        const response = await fetch(`/api/locations/districts?regency_id=${regencyId}`);
        if (response.ok) {
          setEditDistricts(await response.json());
        }
      } catch (err) {
        console.error("Failed to fetch districts:", err);
      }
    }
  };

  const handleEditDistrictChange = async (districtId: string) => {
    setEditForm((prev) => ({
      ...prev,
      districtId,
      villageId: "",
    }));
    setEditVillages([]);

    if (districtId) {
      try {
        const response = await fetch(`/api/locations/villages?district_id=${districtId}`);
        if (response.ok) {
          setEditVillages(await response.json());
        }
      } catch (err) {
        console.error("Failed to fetch villages:", err);
      }
    }
  };

  const displayCameras = useMemo(() => {
    if (viewMode === "cloud") {
      return camerasBySystem.flatMap((sys) => sys.cameras);
    }
    return (cameras as CameraDevice[]) || [];
  }, [viewMode, camerasBySystem, cameras]);

  // Fetch locations for cameras when they load
  useEffect(() => {
    if (displayCameras.length > 0) {
      const cameraNames = displayCameras.map((c) => c.name);
      fetchCameraLocations(cameraNames);
    }
  }, [displayCameras, fetchCameraLocations]);

  const getStatusIcon = (status: string) => {
    return status?.toLowerCase() === "online" ? (
      <Wifi className="w-4 h-4 text-green-600" />
    ) : (
      <WifiOff className="w-4 h-4 text-red-600" />
    );
  };

  // Helper to search in location data
  const searchInLocation = (cameraName: string, term: string): boolean => {
    const loc = cameraLocations[cameraName];
    if (!loc) return false;
    const lowerTerm = term.toLowerCase();
    return (
      loc.detail_address?.toLowerCase().includes(lowerTerm) ||
      false ||
      loc.village_name?.toLowerCase().includes(lowerTerm) ||
      false ||
      loc.district_name?.toLowerCase().includes(lowerTerm) ||
      false ||
      loc.regency_name?.toLowerCase().includes(lowerTerm) ||
      false ||
      loc.province_name?.toLowerCase().includes(lowerTerm) ||
      false
    );
  };

  // Get unique vendors for filter
  const uniqueVendors = Array.from(new Set(displayCameras.map((c) => c.vendor).filter(Boolean))).sort() as string[];

  // Get unique provinces from camera locations
  const uniqueProvinces = Array.from(
    new Set(
      Object.values(cameraLocations)
        .map((loc) => loc?.province_name)
        .filter(Boolean),
    ),
  ).sort() as string[];

  // Get unique districts (kecamatan) - filtered by selected province
  const uniqueDistricts = Array.from(
    new Set(
      Object.values(cameraLocations)
        .filter((loc) => filterProvince === "all" || loc?.province_name === filterProvince)
        .map((loc) => loc?.district_name)
        .filter(Boolean),
    ),
  ).sort() as string[];

  // Get unique villages (kelurahan) - filtered by selected district
  const uniqueVillages = Array.from(
    new Set(
      Object.values(cameraLocations)
        .filter(
          (loc) =>
            (filterProvince === "all" || loc?.province_name === filterProvince) &&
            (filterDistrict === "all" || loc?.district_name === filterDistrict),
        )
        .map((loc) => loc?.village_name)
        .filter(Boolean),
    ),
  ).sort() as string[];

  const filteredCameras = displayCameras.filter((camera) => {
    // Search filter
    const matchesSearch =
      !searchTerm ||
      camera.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (camera.location || camera.ip || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      camera.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      camera.vendor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      camera.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      searchInLocation(camera.name, searchTerm);

    // Status filter
    const matchesStatus = filterStatus === "all" || camera.status?.toLowerCase() === filterStatus.toLowerCase();

    // Vendor filter
    const matchesVendor = filterVendor === "all" || camera.vendor?.toLowerCase() === filterVendor.toLowerCase();

    // Province filter
    const matchesProvince = filterProvince === "all" || cameraLocations[camera.name]?.province_name === filterProvince;

    // District filter
    const matchesDistrict = filterDistrict === "all" || cameraLocations[camera.name]?.district_name === filterDistrict;

    // Village filter
    const matchesVillage = filterVillage === "all" || cameraLocations[camera.name]?.village_name === filterVillage;

    return matchesSearch && matchesStatus && matchesVendor && matchesProvince && matchesDistrict && matchesVillage;
  });

  // Calculate stats based on displayCameras
  const statsSourceCameras = displayCameras;

  const totalCameras = statsSourceCameras.length;
  const onlineCameras = statsSourceCameras.filter((c) => c.status?.toLowerCase() === "online").length;
  const offlineCameras = statsSourceCameras.filter((c) => c.status?.toLowerCase() === "offline").length;
  const recordingCameras = statsSourceCameras.filter((c) => c.status?.toLowerCase() === "recording").length;
  const unauthorizedCameras = statsSourceCameras.filter((c) => c.status?.toLowerCase() === "unauthorized").length;
  const notDefinedCameras = statsSourceCameras.filter((c) => c.status?.toLowerCase() === "notdefined").length;
  const incompatibleCameras = statsSourceCameras.filter((c) => c.status?.toLowerCase() === "incompatible").length;
  const mismatchedCertCameras = statsSourceCameras.filter(
    (c) => c.status?.toLowerCase() === "mismatchedcertificate",
  ).length;

  // Handle Edit Camera
  const handleEditCamera = async (camera: CameraDevice) => {
    setSelectedCamera(camera);

    // Fetch existing location data from database
    let locationData = {
      provinceId: "",
      regencyId: "",
      districtId: "",
      villageId: "",
      detailAddress: "",
    };

    try {
      const response = await fetch(`/api/camera-location?camera_name=${encodeURIComponent(camera.name)}`);
      if (response.ok) {
        const data = await response.json();
        if (data) {
          locationData = {
            provinceId: data.province_id || "",
            regencyId: data.regency_id || "",
            districtId: data.district_id || "",
            villageId: data.village_id || "",
            detailAddress: data.detail_address || "",
          };

          // Load dependent dropdowns
          if (data.province_id) {
            const regRes = await fetch(`/api/locations/regencies?province_id=${data.province_id}`);
            if (regRes.ok) setEditRegencies(await regRes.json());
          }
          if (data.regency_id) {
            const distRes = await fetch(`/api/locations/districts?regency_id=${data.regency_id}`);
            if (distRes.ok) setEditDistricts(await distRes.json());
          }
          if (data.district_id) {
            const vilRes = await fetch(`/api/locations/villages?district_id=${data.district_id}`);
            if (vilRes.ok) setEditVillages(await vilRes.json());
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch camera location:", err);
    }

    setEditForm({
      name: camera.name || "",
      physicalId: camera.physicalId || "",
      url: camera.url || "",
      typeId: camera.typeId || "",
      mac: camera.mac || "",
      serverId: camera.serverId || "",
      vendor: camera.vendor || "",
      model: camera.model || "",
      logicalId: camera.logicalId || "",
      groupId: camera.group?.id || "",
      groupName: camera.group?.name || "",
      credentialsUser: camera.credentials?.user || "",
      credentialsPassword: camera.credentials?.password || "",
      ...locationData,
    });
    setShowEditModal(true);
  };

  // Handle Create Camera
  const handleCreateCamera = async () => {
    try {
      // Clear previous errors
      setCreateErrors({});
      const errors: Record<string, string> = {};

      if (!createForm.name) errors.name = "Camera Name is required";
      if (!createForm.url) errors.url = "URL is required";
      if (!createForm.serverId) errors.serverId = "Server is required";
      if (!createForm.typeId) errors.typeId = "Device Type is required";
      if (!createForm.physicalId) errors.physicalId = "Physical ID is required";

      if (Object.keys(errors).length > 0) {
        setCreateErrors(errors);
        return;
      }

      setIsSubmitting(true);

      const payload = {
        name: createForm.name,
        physicalId: createForm.physicalId,
        url: createForm.url,
        typeId: createForm.typeId,
        mac: createForm.mac,
        serverId: createForm.serverId,
        vendor: createForm.vendor,
        model: createForm.model,
        logicalId: createForm.logicalId,
        group:
          createForm.groupId || createForm.groupName
            ? {
              id: createForm.groupId,
              name: createForm.groupName,
            }
            : undefined,
        credentials: {
          user: createForm.credentialsUser || "",
          password: createForm.credentialsPassword || "",
        },
      };

      const result = await nxAPI.addCamera(payload);

      if (result) {
        // Also save location to database
        try {
          await fetch("/api/camera-location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              camera_name: createForm.name,
              detail_address: createForm.detailAddress,
              province_id: createForm.provinceId || null,
              regency_id: createForm.regencyId || null,
              district_id: createForm.districtId || null,
              village_id: createForm.villageId || null,
            }),
          });
        } catch (locErr) {
          console.error("Failed to save camera location:", locErr);
        }

        alert("Camera created successfully!");
        setShowCreateModal(false);
        // Reset form
        setCreateForm({
          name: "",
          physicalId: "",
          url: "",
          typeId: "",
          mac: "",
          serverId: servers.length > 0 ? servers[0].id : "",
          vendor: "",
          model: "",
          logicalId: "",
          groupId: "",
          groupName: "",
          credentialsUser: "",
          credentialsPassword: "",
          provinceId: "",
          regencyId: "",
          districtId: "",
          villageId: "",
          detailAddress: "",
        });
        // Reset location dropdowns
        setRegencies([]);
        setDistricts([]);
        setVillages([]);
        refetch();
      }
    } catch (error: unknown) {
      console.error("[CameraInventory] Failed to create camera:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      alert(`Failed to create camera: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Update Camera
  const handleUpdateCamera = async () => {
    try {
      if (!selectedCamera) return;

      // Clear previous errors
      setEditErrors({});
      const errors: Record<string, string> = {};

      if (!editForm.name) errors.name = "Camera Name is required";
      if (!editForm.url) errors.url = "URL is required";
      if (!editForm.serverId) errors.serverId = "Server is required";
      if (!editForm.typeId) errors.typeId = "Device Type is required";
      if (!editForm.physicalId) errors.physicalId = "Physical ID is required";

      if (Object.keys(errors).length > 0) {
        setEditErrors(errors);
        return;
      }

      setIsSubmitting(true);

      const payload = {
        id: selectedCamera.id,
        name: editForm.name,
        physicalId: editForm.physicalId,
        url: editForm.url,
        typeId: editForm.typeId,
        mac: editForm.mac,
        serverId: editForm.serverId,
        vendor: editForm.vendor,
        model: editForm.model,
        logicalId: editForm.logicalId,
        group:
          editForm.groupId || editForm.groupName
            ? {
              id: editForm.groupId,
              name: editForm.groupName,
            }
            : undefined,
        credentials: {
          user: editForm.credentialsUser,
          password: editForm.credentialsPassword,
        },
      };

      const result = await nxAPI.updateCamera(selectedCamera.id, payload);

      if (result) {
        // Also save/update location in database
        try {
          await fetch("/api/camera-location", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              camera_name: editForm.name,
              detail_address: editForm.detailAddress,
              province_id: editForm.provinceId || null,
              regency_id: editForm.regencyId || null,
              district_id: editForm.districtId || null,
              village_id: editForm.villageId || null,
            }),
          });
        } catch (locErr) {
          console.error("Failed to update camera location:", locErr);
        }

        alert("Camera updated successfully!");
        setShowEditModal(false);
        setSelectedCamera(null);
        // Reset edit location dropdowns
        setEditRegencies([]);
        setEditDistricts([]);
        setEditVillages([]);
        refetch();
      }
    } catch (error: unknown) {
      console.error("[CameraInventory] Failed to update camera:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      alert(`Failed to update camera: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Camera
  const handleDeleteCamera = async (camera: CameraDevice) => {
    const confirmDelete = confirm(
      `Are you sure you want to delete camera "${camera.name}"?\n\nThis action cannot be undone.`,
    );

    if (!confirmDelete) return;

    try {
      setIsSubmitting(true);
      await nxAPI.deleteCamera(camera.id);
      alert("Camera deleted successfully!");
      // Force refresh the camera list
      await refetch();
    } catch (error: unknown) {
      console.error("[CameraInventory] Failed to delete camera:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      // If it's a JSON parse error but the delete might have succeeded, still refresh
      if (errorMessage.includes("JSON") || errorMessage.includes("Unexpected end")) {
        alert("Camera may have been deleted. Refreshing list...");
        await refetch();
      } else {
        alert(`Failed to delete camera: ${errorMessage}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render Create Modal Content (now moved into main render)
  const renderCreateModal = () => {
    return (
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-4 md:p-6 custom-scrollbar">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl font-semibold text-gray-900">Create New Camera</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 md:space-y-4 py-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                Camera Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${createErrors.name ? "border-red-500 focus:ring-red-500" : "border-gray-300"
                  }`}
                placeholder="Camera 1"
              />
              {createErrors.name && <p className="text-xs text-red-500 mt-1">{createErrors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                URL <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={createForm.url}
                onChange={(e) => setCreateForm({ ...createForm, url: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${createErrors.url ? "border-red-500 focus:ring-red-500" : "border-gray-300"
                  }`}
                placeholder="rtsp://192.168.1.100:554/stream"
              />
              {createErrors.url && <p className="text-xs text-red-500 mt-1">{createErrors.url}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                Server <span className="text-red-500">*</span>
              </label>
              <select
                value={createForm.serverId}
                onChange={(e) => setCreateForm({ ...createForm, serverId: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${createErrors.serverId ? "border-red-500 focus:ring-red-500" : "border-gray-300"
                  }`}
              >
                <option value="">Select Server</option>
                {servers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name || server.id}
                  </option>
                ))}
              </select>
              {createErrors.serverId && <p className="text-xs text-red-500 mt-1">{createErrors.serverId}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                Device Type <span className="text-red-500">*</span>
              </label>
              <select
                value={createForm.typeId}
                onChange={(e) => setCreateForm({ ...createForm, typeId: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${createErrors.typeId ? "border-red-500 focus:ring-red-500" : "border-gray-300"
                  }`}
              >
                <option value="">Select Device Type</option>
                {deviceType.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name} - {type.manufacturer}
                  </option>
                ))}
              </select>
              {createErrors.typeId && <p className="text-xs text-red-500 mt-1">{createErrors.typeId}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                  Physical ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={createForm.physicalId}
                  onChange={(e) => setCreateForm({ ...createForm, physicalId: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${createErrors.physicalId ? "border-red-500 focus:ring-red-500" : "border-gray-300"
                    }`}
                />
                {createErrors.physicalId && <p className="text-xs text-red-500 mt-1">{createErrors.physicalId}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">MAC Address</label>
                <input
                  type="text"
                  value={createForm.mac}
                  onChange={(e) => setCreateForm({ ...createForm, mac: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                <input
                  type="text"
                  value={createForm.vendor}
                  onChange={(e) => setCreateForm({ ...createForm, vendor: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                <input
                  type="text"
                  value={createForm.model}
                  onChange={(e) => setCreateForm({ ...createForm, model: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Logical ID</label>
              <input
                type="text"
                value={createForm.logicalId}
                onChange={(e) => setCreateForm({ ...createForm, logicalId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div className="border-t pt-3 md:pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2 md:mb-3">Credentials</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                  <input
                    type="text"
                    value={createForm.credentialsUser}
                    onChange={(e) => setCreateForm({ ...createForm, credentialsUser: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={createForm.credentialsPassword}
                    onChange={(e) => setCreateForm({ ...createForm, credentialsPassword: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Location Section */}
            <div className="border-t pt-3 md:pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2 md:mb-3 flex items-center">
                <MapPin className="w-4 h-4 mr-2" />
                Location
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Province</label>
                  <select
                    value={createForm.provinceId}
                    onChange={(e) => handleCreateProvinceChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    disabled={loadingLocations}
                  >
                    <option value="">Select Province</option>
                    {provinces.map((prov) => (
                      <option key={prov.id} value={prov.id}>
                        {prov.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Regency/City</label>
                  <select
                    value={createForm.regencyId}
                    onChange={(e) => handleCreateRegencyChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    disabled={!createForm.provinceId}
                  >
                    <option value="">Select Regency/City</option>
                    {regencies.map((reg) => (
                      <option key={reg.id} value={reg.id}>
                        {reg.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 mt-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">District</label>
                  <select
                    value={createForm.districtId}
                    onChange={(e) => handleCreateDistrictChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    disabled={!createForm.regencyId}
                  >
                    <option value="">Select District</option>
                    {districts.map((dist) => (
                      <option key={dist.id} value={dist.id}>
                        {dist.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Village</label>
                  <select
                    value={createForm.villageId}
                    onChange={(e) => setCreateForm({ ...createForm, villageId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    disabled={!createForm.districtId}
                  >
                    <option value="">Select Village</option>
                    {villages.map((vil) => (
                      <option key={vil.id} value={vil.id}>
                        {vil.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Detail Address</label>
                <textarea
                  value={createForm.detailAddress}
                  onChange={(e) => setCreateForm({ ...createForm, detailAddress: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  rows={2}
                  placeholder="Street name, building number, etc."
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3 mt-4">
            <Button
              onClick={() => setShowCreateModal(false)}
              disabled={isSubmitting}
              variant="outline"
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button onClick={handleCreateCamera} disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting && <RefreshCw className="w-4 h-4 animate-spin mr-2" />}
              {isSubmitting ? "Creating..." : "Create Camera"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  // Render Edit Modal Content (now moved into main render)
  const renderEditModal = () => {
    if (!selectedCamera) return null;

    return (
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-lg max-h-[95vh] overflow-y-auto p-4 md:p-6 custom-scrollbar">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl font-semibold text-gray-900">Edit Camera</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 md:space-y-4 py-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Camera ID</label>
              <input
                type="text"
                value={selectedCamera.id}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500 font-mono text-xs sm:text-sm truncate"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                Camera Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${editErrors.name ? "border-red-500 focus:ring-red-500" : "border-gray-300"
                  }`}
              />
              {editErrors.name && <p className="text-xs text-red-500 mt-1">{editErrors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                URL <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={editForm.url}
                onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${editErrors.url ? "border-red-500 focus:ring-red-500" : "border-gray-300"
                  }`}
              />
              {editErrors.url && <p className="text-xs text-red-500 mt-1">{editErrors.url}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                Server <span className="text-red-500">*</span>
              </label>
              <select
                value={editForm.serverId}
                onChange={(e) => setEditForm({ ...editForm, serverId: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${editErrors.serverId ? "border-red-500 focus:ring-red-500" : "border-gray-300"
                  }`}
              >
                <option value="">Select Server</option>
                {servers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name || server.id}
                  </option>
                ))}
              </select>
              {editErrors.serverId && <p className="text-xs text-red-500 mt-1">{editErrors.serverId}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                Device Type <span className="text-red-500">*</span>
              </label>
              <select
                value={editForm.typeId}
                onChange={(e) => setEditForm({ ...editForm, typeId: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${editErrors.typeId ? "border-red-500 focus:ring-red-500" : "border-gray-300"
                  }`}
              >
                <option value="">Select Device Type</option>
                {deviceType.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name} - {type.manufacturer}
                  </option>
                ))}
              </select>
              {editErrors.typeId && <p className="text-xs text-red-500 mt-1">{editErrors.typeId}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                  Physical ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editForm.physicalId}
                  onChange={(e) => setEditForm({ ...editForm, physicalId: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${editErrors.physicalId ? "border-red-500 focus:ring-red-500" : "border-gray-300"
                    }`}
                />
                {editErrors.physicalId && <p className="text-xs text-red-500 mt-1">{editErrors.physicalId}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">MAC Address</label>
                <input
                  type="text"
                  value={editForm.mac}
                  onChange={(e) => setEditForm({ ...editForm, mac: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                <input
                  type="text"
                  value={editForm.vendor}
                  onChange={(e) => setEditForm({ ...editForm, vendor: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                <input
                  type="text"
                  value={editForm.model}
                  onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Logical ID</label>
              <input
                type="text"
                value={editForm.logicalId}
                onChange={(e) => setEditForm({ ...editForm, logicalId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div className="border-t pt-3 md:pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2 md:mb-3">Credentials</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                  <input
                    type="text"
                    value={editForm.credentialsUser}
                    onChange={(e) => setEditForm({ ...editForm, credentialsUser: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={editForm.credentialsPassword}
                    onChange={(e) => setEditForm({ ...editForm, credentialsPassword: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Location Section */}
            <div className="border-t pt-3 md:pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2 md:mb-3 flex items-center">
                <MapPin className="w-4 h-4 mr-2" />
                Location
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Province</label>
                  <select
                    value={editForm.provinceId}
                    onChange={(e) => handleEditProvinceChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value="">Select Province</option>
                    {provinces.map((prov) => (
                      <option key={prov.id} value={prov.id}>
                        {prov.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Regency/City</label>
                  <select
                    value={editForm.regencyId}
                    onChange={(e) => handleEditRegencyChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    disabled={!editForm.provinceId}
                  >
                    <option value="">Select Regency/City</option>
                    {editRegencies.map((reg) => (
                      <option key={reg.id} value={reg.id}>
                        {reg.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 mt-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">District</label>
                  <select
                    value={editForm.districtId}
                    onChange={(e) => handleEditDistrictChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    disabled={!editForm.regencyId}
                  >
                    <option value="">Select District</option>
                    {editDistricts.map((dist) => (
                      <option key={dist.id} value={dist.id}>
                        {dist.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Village</label>
                  <select
                    value={editForm.villageId}
                    onChange={(e) => setEditForm({ ...editForm, villageId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    disabled={!editForm.districtId}
                  >
                    <option value="">Select Village</option>
                    {editVillages.map((vil) => (
                      <option key={vil.id} value={vil.id}>
                        {vil.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Detail Address</label>
                <textarea
                  value={editForm.detailAddress}
                  onChange={(e) => setEditForm({ ...editForm, detailAddress: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  rows={2}
                  placeholder="Street name, building number, etc."
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3 mt-4">
            <Button
              onClick={() => {
                setShowEditModal(false);
                setSelectedCamera(null);
              }}
              disabled={isSubmitting}
              variant="outline"
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateCamera} disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting && <RefreshCw className="w-4 h-4 animate-spin mr-2" />}
              {isSubmitting ? "Updating..." : "Update Camera"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };


  return (
    <div className="space-y-4 md:space-y-6">
      {/* Modals */}
      {renderCreateModal()}
      {renderEditModal()}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Camera Inventory</h1>
          <div className="flex items-center space-x-2">
            <Select
              value={selectedSystemId}
              onValueChange={setSelectedSystemId}
              disabled={loadingCloud}
            >
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder="Select system" />
              </SelectTrigger>
              <SelectContent>
                {cloudSystems.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <div className="flex items-center">
                      <div className={`w-2 h-2 rounded-full mr-2 ${s.stateOfHealth === "online" ? "bg-green-500" : "bg-red-500"}`} />
                      {s.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}></div>
            <span className="text-xs sm:text-sm text-gray-600">{connected ? "Connected" : "Disconnected"}</span>
            {error && <AlertCircle className="w-4 h-4 text-red-500" />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowCreateModal(true)}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-3 py-2 rounded-lg"
            variant="outline"
          >
            <Plus className="w-4 h-4" />
            <span>Add</span>
          </Button>

          <Button
            onClick={() => {
              if (viewMode === "cloud") {
                fetchAllCloudCameras();
              } else {
                refetch();
              }
              testConnection();
            }}
            disabled={loading || loadingCloud}
            className="flex items-center space-x-2 px-3 py-2 border rounded-lg hover:bg-gray-50"
            variant="outline"
          >
            {loading || loadingCloud ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <div className="flex items-center bg-white rounded-lg border p-1">
            <button
              onClick={() => setViewMode("cloud")}
              className={`p-2 rounded ${viewMode === "cloud" ? "bg-blue-100 text-blue-600" : "text-gray-600"}`}
              title="Systems View"
            >
              <Cloud className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 rounded ${viewMode === "grid" ? "bg-blue-100 text-blue-600" : "text-gray-600"}`}
              title="Grid View"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 rounded ${viewMode === "list" ? "bg-blue-100 text-blue-600" : "text-gray-600"}`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search cameras, location, vendor..."
            className="pl-10 pr-4 py-2 w-full border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Popover open={showFilters} onOpenChange={setShowFilters}>
          <PopoverTrigger asChild>
            <button
              className={`flex items-center justify-center space-x-2 px-4 py-2 border rounded-lg hover:bg-gray-50 ${filterStatus !== "all" ||
                filterVendor !== "all" ||
                filterProvince !== "all" ||
                filterDistrict !== "all" ||
                filterVillage !== "all"
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : ""
                }`}
            >
              <Filter className="w-4 h-4" />
              <span>Filters</span>
              {(filterStatus !== "all" ||
                filterVendor !== "all" ||
                filterProvince !== "all" ||
                filterDistrict !== "all" ||
                filterVillage !== "all") && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-600 text-white rounded-full">
                    {
                      [
                        filterStatus !== "all",
                        filterVendor !== "all",
                        filterProvince !== "all",
                        filterDistrict !== "all",
                        filterVillage !== "all",
                      ].filter(Boolean).length
                    }
                  </span>
                )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="end">
            <div className="space-y-3 max-h-[70vh] overflow-y-auto">
              <div className="flex items-center justify-between sticky top-0 bg-white pb-2">
                <h4 className="font-semibold text-gray-900">Filters</h4>
                {(filterStatus !== "all" ||
                  filterVendor !== "all" ||
                  filterProvince !== "all" ||
                  filterDistrict !== "all" ||
                  filterVillage !== "all") && (
                    <button
                      onClick={() => {
                        setFilterStatus("all");
                        setFilterVendor("all");
                        setFilterProvince("all");
                        setFilterDistrict("all");
                        setFilterVillage("all");
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Clear all
                    </button>
                  )}
              </div>

              {/* Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Status</option>
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                  <option value="recording">Recording</option>
                  <option value="unauthorized">Unauthorized</option>
                </select>
              </div>

              {/* Vendor Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                <select
                  value={filterVendor}
                  onChange={(e) => setFilterVendor(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Vendors</option>
                  {uniqueVendors.map((vendor) => (
                    <option key={vendor} value={vendor.toLowerCase()}>
                      {vendor}
                    </option>
                  ))}
                </select>
              </div>

              {/* Province Filter */}
              {uniqueProvinces.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Provinsi</label>
                  <select
                    value={filterProvince}
                    onChange={(e) => {
                      setFilterProvince(e.target.value);
                      setFilterDistrict("all");
                      setFilterVillage("all");
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">Semua Provinsi</option>
                    {uniqueProvinces.map((province) => (
                      <option key={province} value={province}>
                        {province}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* District Filter */}
              {uniqueDistricts.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kecamatan</label>
                  <select
                    value={filterDistrict}
                    onChange={(e) => {
                      setFilterDistrict(e.target.value);
                      setFilterVillage("all");
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">Semua Kecamatan</option>
                    {uniqueDistricts.map((district) => (
                      <option key={district} value={district}>
                        {district}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Village Filter */}
              {uniqueVillages.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kelurahan</label>
                  <select
                    value={filterVillage}
                    onChange={(e) => setFilterVillage(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">Semua Kelurahan</option>
                    {uniqueVillages.map((village) => (
                      <option key={village} value={village}>
                        {village}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={() => setShowFilters(false)}
                className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 sticky bottom-0"
              >
                Apply Filters
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3">
        <div className="bg-white p-2 md:p-3 rounded-lg border">
          <div className="text-lg md:text-xl font-bold text-gray-900">{totalCameras}</div>
          <div className="text-xs text-gray-600">Total</div>
        </div>
        <div className="p-2 md:p-3 rounded-lg border border-green-200 bg-green-50">
          <div className="text-lg md:text-xl font-bold text-green-600">{onlineCameras}</div>
          <div className="text-xs text-gray-600">Online</div>
        </div>
        <div className="p-2 md:p-3 rounded-lg border border-red-200 bg-red-50">
          <div className="text-lg md:text-xl font-bold text-red-600">{offlineCameras}</div>
          <div className="text-xs text-gray-600">Offline</div>
        </div>
        <div className="p-2 md:p-3 rounded-lg border border-blue-200 bg-blue-50">
          <div className="text-lg md:text-xl font-bold text-blue-600">{recordingCameras}</div>
          <div className="text-xs text-gray-600">Recording</div>
        </div>
        <div className="p-2 md:p-3 rounded-lg border border-yellow-200 bg-yellow-50">
          <div className="text-lg md:text-xl font-bold text-yellow-600">{unauthorizedCameras}</div>
          <div className="text-xs text-gray-600">Unauthorized</div>
        </div>
        <div className="p-2 md:p-3 rounded-lg border border-gray-200 bg-gray-50">
          <div className="text-lg md:text-xl font-bold text-gray-500">{notDefinedCameras}</div>
          <div className="text-xs text-gray-600">NotDefined</div>
        </div>
        <div className="p-2 md:p-3 rounded-lg border border-orange-200 bg-orange-50">
          <div className="text-lg md:text-xl font-bold text-orange-600">{incompatibleCameras}</div>
          <div className="text-xs text-gray-600">Incompatible</div>
        </div>
        <div className="p-2 md:p-3 rounded-lg border border-purple-200 bg-purple-50">
          <div className="text-lg md:text-xl font-bold text-purple-600">{mismatchedCertCameras}</div>
          <div className="text-xs text-gray-600 truncate" title="Mismatched Certificate">
            Mismatched Cert
          </div>
        </div>
      </div>

      {/* Camera Grid/List */}
      <div className="bg-white rounded-lg shadow-sm border min-h-[400px] flex flex-col items-center justify-center">
        {isLoadingContent ? (
          <div className="flex flex-col items-center justify-center p-8 space-y-4">
            <RefreshCw className="w-10 h-10 animate-spin text-blue-600" />
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900">Loading Data</h3>
              <p className="text-sm text-gray-500">Connecting to cloud system and fetching resources...</p>
            </div>
          </div>
        ) : error && !loading ? (
          <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-2">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">Connection Error</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">{error}</p>
            </div>
            <Button onClick={() => { refetch(); testConnection(); }} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" /> Try Again
            </Button>
          </div>
        ) : viewMode !== "cloud" && servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-2">
              <Server className="w-10 h-10 text-gray-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">No Server Available</h3>
              <p className="text-gray-500 max-w-md mx-auto">
                We couldn't find any servers registered in this system.
                Please ensure your servers are online and connected to the cloud.
              </p>
            </div>
            <Button onClick={() => refetch()} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" /> Check Again
            </Button>
          </div>
        ) : viewMode !== "cloud" && displayCameras.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-2">
              <Camera className="w-10 h-10 text-gray-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">No Camera Detected</h3>
              <p className="text-gray-500 max-w-md mx-auto">
                Servers are online, but no cameras were found.
                You can try to add cameras manually or scan the network.
              </p>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="w-4 h-4 mr-2" /> Add Camera
              </Button>
              <Button onClick={() => refetch()} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" /> Refresh
              </Button>
            </div>
          </div>
        ) : filteredCameras.length === 0 && viewMode !== "cloud" ? (
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-2">
              <Search className="w-10 h-10 text-gray-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">No Matches Found</h3>
              <p className="text-gray-500 max-w-md mx-auto">
                We couldn't find any cameras matching "{searchTerm}".
                Try adjusting your search or filters.
              </p>
            </div>
            <Button onClick={() => { setSearchTerm(""); setFilterStatus("all"); }} variant="outline">
              Clear All Filters
            </Button>
          </div>
        ) : null}

        {/* Cloud View - All Systems with Cameras */}
        {viewMode === "cloud" && !isLoadingContent && (
          <div className="p-3 md:p-6 w-full">
            {camerasBySystem.length === 0 ? (
              <div className="flex items-center justify-center p-8 text-gray-500">
                <Cloud className="w-6 h-6 mr-2" />
                <span>No systems found</span>
              </div>
            ) : (
              <div className="space-y-4">
                {camerasBySystem.map((systemData) => {
                  const isExpanded = expandedSystems.has(systemData.systemId);
                  const isOnline = systemData.stateOfHealth === "online";

                  // Filter cameras for this system
                  const filteredSystemCameras = systemData.cameras.filter((cam) => {
                    const matchesSearch =
                      !searchTerm ||
                      cam.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      cam.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      cam.vendor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      cam.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      searchInLocation(cam.name, searchTerm);

                    const matchesStatus =
                      filterStatus === "all" || cam.status?.toLowerCase() === filterStatus.toLowerCase();
                    const matchesVendor =
                      filterVendor === "all" || cam.vendor?.toLowerCase() === filterVendor.toLowerCase();
                    const matchesProvince =
                      filterProvince === "all" || cameraLocations[cam.name]?.province_name === filterProvince;
                    const matchesDistrict =
                      filterDistrict === "all" || cameraLocations[cam.name]?.district_name === filterDistrict;
                    const matchesVillage =
                      filterVillage === "all" || cameraLocations[cam.name]?.village_name === filterVillage;

                    return (
                      matchesSearch &&
                      matchesStatus &&
                      matchesVendor &&
                      matchesProvince &&
                      matchesDistrict &&
                      matchesVillage
                    );
                  });

                  const onlineCount = filteredSystemCameras.filter((c) => c.status?.toLowerCase() === "online").length;
                  const offlineCount = filteredSystemCameras.filter(
                    (c) => c.status?.toLowerCase() === "offline",
                  ).length;

                  return (
                    <div key={systemData.systemId} className="border rounded-lg overflow-hidden">
                      {/* System Header */}
                      <button
                        onClick={() => toggleSystemExpansion(systemData.systemId)}
                        className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5 text-gray-500" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-500" />
                          )}
                          <Server className="w-5 h-5 text-blue-600" />
                          <div className="text-left">
                            <div className="font-semibold text-gray-900">{systemData.systemName}</div>
                            <div className="text-xs text-gray-500">
                              {filteredSystemCameras.length} cameras
                              {searchTerm ||
                                filterStatus !== "all" ||
                                filterVendor !== "all" ||
                                filterProvince !== "all" ||
                                filterDistrict !== "all" ||
                                filterVillage !== "all"
                                ? ` (filtered from ${systemData.cameras.length})`
                                : ""}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="flex items-center gap-1 text-green-600">
                              <Wifi className="w-3 h-3" /> {onlineCount}
                            </span>
                            <span className="flex items-center gap-1 text-red-600">
                              <WifiOff className="w-3 h-3" /> {offlineCount}
                            </span>
                          </div>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${isOnline ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                              }`}
                          >
                            {isOnline ? "Online" : "Offline"}
                          </span>
                        </div>
                      </button>

                      {/* System Cameras */}
                      {isExpanded && (
                        <div className="p-4 bg-white">
                          {!isOnline ? (
                            <div className="p-6 text-center text-gray-500">
                              <WifiOff className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                              <p>System is offline. Cannot fetch cameras.</p>
                            </div>
                          ) : filteredSystemCameras.length === 0 ? (
                            <div className="p-6 text-center text-gray-500">
                              <Camera className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                              <p>
                                {systemData.cameras.length === 0
                                  ? "No cameras in this system"
                                  : "No cameras match your search"}
                              </p>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                              {filteredSystemCameras.map((camera) => (
                                <div
                                  key={`${systemData.systemId}-${camera.id}`}
                                  className="border rounded-lg p-3 hover:shadow-md transition-shadow bg-white flex flex-col h-full min-h-[200px]"
                                >
                                  {/* Header */}
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                                      <Camera className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                      <span className="font-medium text-gray-900 text-sm truncate" title={camera.name}>
                                        {camera.name}
                                      </span>
                                    </div>
                                    {camera.status?.toLowerCase() === "online" ? (
                                      <Wifi className="w-4 h-4 text-green-600 flex-shrink-0" />
                                    ) : (
                                      <WifiOff className="w-4 h-4 text-red-600 flex-shrink-0" />
                                    )}
                                  </div>

                                  {/* Camera Info */}
                                  <div className="space-y-0.5 text-xs text-gray-600">
                                    {camera.model && <div className="truncate">Model: {camera.model}</div>}
                                    {camera.vendor && <div className="truncate">Vendor: {camera.vendor}</div>}
                                    {camera.mac && <div className="truncate">MAC: {camera.mac}</div>}
                                    {camera.physicalId && <div className="truncate">ID: {camera.physicalId}</div>}
                                    {camera.typeId && <div className="truncate text-gray-500">Type: {camera.typeId}</div>}
                                    {camera.url && <div className="truncate text-gray-500" title={camera.url}>URL: {camera.url}</div>}
                                    {!camera.model && !camera.vendor && !camera.mac && !camera.physicalId && !camera.typeId && !camera.url && (
                                      <div className="text-gray-400 italic">No technical info available</div>
                                    )}
                                  </div>

                                  {/* Location Details */}
                                  <div className="flex-grow mt-2 pt-2 border-t border-gray-100">
                                    <div className="flex items-center gap-2 mb-2">
                                      <MapPin className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                                      <div className="text-xs text-gray-500 line-clamp-4">
                                        {cameraLocations[camera.name] ? (
                                          <div className="space-y-0.5">
                                            {cameraLocations[camera.name]?.detail_address && (
                                              <div className="font-medium text-gray-700">
                                                {cameraLocations[camera.name]?.detail_address}
                                              </div>
                                            )}
                                            {cameraLocations[camera.name]?.village_name && (
                                              <div>Kel. {cameraLocations[camera.name]?.village_name}</div>
                                            )}
                                            {cameraLocations[camera.name]?.district_name && (
                                              <div>Kec. {cameraLocations[camera.name]?.district_name}</div>
                                            )}
                                            {cameraLocations[camera.name]?.regency_name && (
                                              <div>{cameraLocations[camera.name]?.regency_name}</div>
                                            )}
                                            {cameraLocations[camera.name]?.province_name && (
                                              <div className="text-gray-400">
                                                {cameraLocations[camera.name]?.province_name}
                                              </div>
                                            )}
                                            {!cameraLocations[camera.name]?.village_name &&
                                              !cameraLocations[camera.name]?.district_name &&
                                              !cameraLocations[camera.name]?.regency_name &&
                                              !cameraLocations[camera.name]?.province_name &&
                                              !cameraLocations[camera.name]?.detail_address && (
                                                <div className="flex items-center gap-1.5 text-gray-400 italic bg-gray-50 px-2 py-0.5 rounded border border-dashed border-gray-200 w-fit">
                                                  <span>Lokasi belum diatur</span>
                                                </div>
                                              )}
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-1.5 text-gray-400 italic bg-gray-50 px-2 py-0.5 rounded border border-dashed border-gray-200 w-fit">
                                            <span>Lokasi belum diatur</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Status Badge */}
                                  <div className="flex items-center justify-between mt-auto pt-2 border-t">
                                    <div className="group relative">
                                      <span
                                        className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-help ${getStatusBadgeStyle(
                                          camera.status || "",
                                        )}`}
                                      >
                                        {camera.status || "Unknown"}
                                      </span>
                                      <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-10">
                                        <div className="bg-gray-900 text-white text-xs rounded-lg py-2 px-3 max-w-xs shadow-lg">
                                          <div className="font-semibold mb-1">{camera.status || "Unknown"}</div>
                                          <div className="text-gray-300">
                                            {getStatusDescription(camera.status || "")}
                                          </div>
                                        </div>
                                        <div className="absolute top-full left-4 w-2 h-2 bg-gray-900 transform rotate-45 -mt-1"></div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Grid View */}
        {!loading && viewMode === "grid" && filteredCameras.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 p-3 md:p-6">
            {filteredCameras.map((camera) => (
              <div key={camera.id} className="border rounded-lg p-3 md:p-4 hover:shadow-md transition-shadow bg-white">
                <div className="flex items-start justify-between mb-2 md:mb-3">
                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                    <Camera className="w-4 h-4 md:w-5 md:h-5 text-gray-600 flex-shrink-0" />
                    <span className="font-medium text-gray-900 text-sm md:text-base truncate">{camera.name}</span>
                  </div>
                  {getStatusIcon(camera.status)}
                </div>

                <div className="space-y-1 md:space-y-2 text-xs md:text-sm text-gray-600">
                  <div className="flex items-center space-x-1">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate" title={formatCameraLocation(camera.name)}>
                      {cameraLocations[camera.name] ? (
                        formatCameraLocation(camera.name)
                      ) : camera.location || camera.ip ? (
                        camera.location || camera.ip
                      ) : (
                        <span className="inline-flex items-center text-gray-400 italic bg-gray-50 px-1.5 py-0.5 rounded border border-dashed border-gray-200 text-[10px]">
                          Lokasi belum diatur
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="truncate">Model: {camera.model || "Unknown"}</div>
                  {camera.vendor && <div className="truncate hidden sm:block">Vendor: {camera.vendor}</div>}
                </div>

                <div className="flex items-center justify-between mt-3 md:mt-4 pt-2 md:pt-3 border-t">
                  <span
                    className={`px-2 py-0.5 md:py-1 rounded-full text-xs font-medium cursor-help ${getStatusBadgeStyle(
                      camera.status,
                    )}`}
                    title={`${camera.status}: ${getStatusDescription(camera.status)}`}
                  >
                    {camera.status}
                  </span>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleEditCamera(camera)}
                      className="p-1.5 md:p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                      title="Edit camera"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteCamera(camera)}
                      className="p-1.5 md:p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      title="Delete camera"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* List View */}
        {!loading && viewMode === "list" && filteredCameras.length > 0 && (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Camera
                    </th>
                    <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Location
                    </th>
                    <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type/Model
                    </th>
                    <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredCameras.map((camera) => (
                    <tr key={camera.id} className="hover:bg-gray-50">
                      <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Camera className="w-5 h-5 text-gray-600 mr-3" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">{camera.name}</div>
                          </div>
                        </div>
                      </td>
                      <td
                        className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-600"
                        title={formatCameraLocation(camera.name)}
                      >
                        {cameraLocations[camera.name] ? (
                          formatCameraLocation(camera.name)
                        ) : (
                          <span className="text-gray-400 italic bg-gray-50 px-1.5 py-0.5 rounded border border-dashed border-gray-200 text-[10px]">
                            Lokasi belum diatur
                          </span>
                        )}
                      </td>
                      <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{camera.vendor || "-"}</div>
                        <div className="text-sm text-gray-500">{camera.model || "-"}</div>
                      </td>
                      <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(camera.status)}
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium cursor-help ${getStatusBadgeStyle(
                              camera.status,
                            )}`}
                            title={`${camera.status}: ${getStatusDescription(camera.status)}`}
                          >
                            {camera.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleEditCamera(camera)}
                            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                            title="Edit camera"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteCamera(camera)}
                            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg"
                            title="Delete camera"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View for List Mode */}
            <div className="md:hidden space-y-3 p-3">
              {filteredCameras.map((camera) => (
                <div key={camera.id} className="bg-white border rounded-lg p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                      <Camera className="w-4 h-4 text-gray-600 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 truncate">{camera.name}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {cameraLocations[camera.name] ? (
                            formatCameraLocation(camera.name)
                          ) : camera.location || camera.ip ? (
                            camera.location || camera.ip
                          ) : (
                            <span className="text-gray-400 italic bg-gray-50 px-1.5 py-0.5 rounded border border-dashed border-gray-200 text-[10px]">
                              Lokasi belum diatur
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(camera.status)}
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-help ${getStatusBadgeStyle(
                          camera.status,
                        )}`}
                        title={`${camera.status}: ${getStatusDescription(camera.status)}`}
                      >
                        {camera.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t">
                    <div className="text-xs text-gray-500">
                      <span>{camera.vendor || "-"}</span>
                      {camera.model && <span> / {camera.model}</span>}
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleEditCamera(camera)}
                        className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Edit"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCamera(camera)}
                        className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
